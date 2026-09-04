import { toNativeVideoSlide } from "./provider-resolve.js";
import { REDGIFS_MEDIA_HOST } from "./provider-hosts.js";

/**
 * Redgifs native-video support.
 *
 * Redgifs links arrive from Reddit as an iframe embed (`/ifr/<id>`), which we
 * can't time (no duration, no `ended`) or unmute (cross-origin). Instead we
 * resolve the direct mp4 (plus duration and audio flag) from the Redgifs API
 * and play it as a native `<video>`, which fixes both. The Redgifs CDN
 * hotlink-protects by `Referer` (a reddit referer gets 403). Firefox honors
 * `referrerpolicy="no-referrer"` on a `<video>`, so it plays the mp4 directly.
 * Chrome does NOT (referrerpolicy is a no-op on media elements there), so on
 * Chrome the slide is `proxied` from the start: the background fetches the bytes
 * with no Referer and plays them as a blob (`slideshow.fetchMedia`). The same
 * proxy path is the fallback when a page CSP (www.reddit) blocks the direct load.
 */

const AUTH_URL = "https://api.redgifs.com/v2/auth/temporary";
const GIF_URL = "https://api.redgifs.com/v2/gifs/";
/** @type {RequestInit} */
const PROVIDER_FETCH_OPTIONS = {
  credentials: "omit",
  referrerPolicy: "no-referrer",
};

/**
 * @typedef {object} RedgifsMedia
 * @property {string} mediaUrl Direct mp4 (hd) URL.
 * @property {number} [durationSeconds]
 * @property {boolean} hasAudio
 * @property {number} [sourceWidth]
 * @property {number} [sourceHeight]
 */

/**
 * Resolve Redgifs ids to direct mp4 URLs, caching the anonymous temporary token
 * and refreshing it once on a 401.
 *
 * @param {{ fetchImpl?: typeof fetch }} [deps]
 */
export function createRedgifsResolver({ fetchImpl = fetch } = {}) {
  /** @type {string | null} */
  let token = null;

  /**
   * @param {boolean} [force]
   * @returns {Promise<string>}
   */
  async function getToken(force) {
    if (token && !force) return token;
    const res = await fetchImpl(AUTH_URL, PROVIDER_FETCH_OPTIONS);
    if (!res.ok) throw new Error(`Redgifs auth HTTP ${res.status}`);
    const next = (await res.json())?.token;
    if (!next) throw new Error("Redgifs auth: no token");
    token = next;
    return next;
  }

  /**
   * @param {string} id
   * @returns {Promise<RedgifsMedia>}
   */
  async function resolve(id) {
    /** @param {string} t */
    const get = (t) =>
      fetchImpl(GIF_URL + id, {
        ...PROVIDER_FETCH_OPTIONS,
        headers: { Authorization: `Bearer ${t}` },
      });

    let res = await get(await getToken());
    if (res.status === 401) res = await get(await getToken(true));
    if (!res.ok) throw new Error(`Redgifs gif HTTP ${res.status}`);

    const gif = (await res.json())?.gif;
    const mediaUrl = gif?.urls?.hd ?? gif?.urls?.sd;
    if (!mediaUrl) throw new Error("Redgifs gif: no mp4 url");
    // The API response is third-party; don't trust its host. The background's
    // fetch allowlist enforces this too, but failing here falls back to the
    // iframe embed instead of a dead video.
    let host;
    try {
      host = new URL(mediaUrl).hostname;
    } catch {
      throw new Error("Redgifs gif: invalid mp4 url");
    }
    if (host !== REDGIFS_MEDIA_HOST) {
      throw new Error(`Redgifs gif: unexpected media host ${host}`);
    }
    return {
      mediaUrl,
      durationSeconds:
        typeof gif.duration === "number" ? gif.duration : undefined,
      hasAudio: Boolean(gif.hasAudio),
      sourceWidth: gif.width,
      sourceHeight: gif.height,
    };
  }

  return { resolve };
}

/**
 * Turn a Redgifs iframe-embed slide into a native-video slide. Direct on Firefox
 * (referrerpolicy="no-referrer" dodges the CDN's Referer 403); `proxied` on
 * Chrome, where that attribute is a no-op on `<video>` so the bytes must come
 * through the background blob proxy instead.
 *
 * @param {import("./slides.js").Slide} slide
 * @param {RedgifsMedia} media
 * @param {{ proxied?: boolean }} [opts]
 * @returns {import("./slides.js").Slide}
 */
export function redgifsVideoSlide(slide, media, opts) {
  return toNativeVideoSlide(slide, media, opts);
}

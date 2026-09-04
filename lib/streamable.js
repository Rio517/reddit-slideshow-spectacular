import { streamableId } from "./slides.js";
import { resolveNativeSlides, toNativeVideoSlide } from "./provider-resolve.js";
import { isStreamableHost } from "./provider-hosts.js";
import { createLogger } from "./log.js";

const log = createLogger("streamable");

/**
 * Streamable native-video support.
 *
 * Streamable links arrive from Reddit as a watch URL (`streamable.com/<id>`),
 * which we render as the first-party iframe embed (`/e/<id>`) as a fallback. The
 * background resolves the direct mp4 (plus duration and dimensions) from the
 * public API (no key) and plays it as a native, correctly-timed `<video>`.
 *
 * Unlike Redgifs, the Streamable CDN (`cdn-*.streamable.com`) does NOT
 * hotlink-protect by Referer, so the mp4 plays DIRECTLY from the page - no
 * background blob proxy. This also dodges Chrome's Opaque Response Blocking,
 * which blocks a service worker from reading that CORS-less mp4 body and broke
 * the old proxied path on Chrome (ADR 0013).
 */

const VIDEOS_URL = "https://api.streamable.com/videos/";
/** @type {RequestInit} */
const PROVIDER_FETCH_OPTIONS = {
  credentials: "omit",
  referrerPolicy: "no-referrer",
};

/**
 * @typedef {object} StreamableMedia
 * @property {string} mediaUrl Direct mp4 URL.
 * @property {number} [durationSeconds]
 * @property {boolean} hasAudio
 * @property {number} [sourceWidth]
 * @property {number} [sourceHeight]
 */

/**
 * @param {{ fetchImpl?: typeof fetch }} [deps]
 */
export function createStreamableResolver({ fetchImpl = fetch } = {}) {
  /**
   * @param {string} id
   * @returns {Promise<StreamableMedia>}
   */
  async function resolve(id) {
    const res = await fetchImpl(VIDEOS_URL + id, PROVIDER_FETCH_OPTIONS);
    if (!res.ok) throw new Error(`Streamable HTTP ${res.status}`);
    const mp4 = (await res.json())?.files?.mp4;
    let url = mp4?.url;
    if (!url) throw new Error("Streamable: no mp4 url (still processing?)");
    // The API sometimes returns a protocol-relative URL.
    if (url.startsWith("//")) url = `https:${url}`;
    // The response is third-party; don't trust its host. The background's fetch
    // allowlist enforces this too, but failing here keeps the iframe embed
    // instead of a dead video.
    let host;
    try {
      host = new URL(url).hostname;
    } catch {
      throw new Error("Streamable: invalid mp4 url");
    }
    if (!isStreamableHost(host)) {
      throw new Error(`Streamable: unexpected media host ${host}`);
    }
    return {
      mediaUrl: url,
      durationSeconds:
        typeof mp4.duration === "number" ? mp4.duration : undefined,
      hasAudio: true,
      sourceWidth: mp4.width,
      sourceHeight: mp4.height,
    };
  }

  return { resolve };
}

/**
 * Turn a Streamable iframe-embed slide into a direct native-video slide. Not
 * proxied: the CDN serves the mp4 to a reddit page without a Referer block, so
 * the `<video>` loads it itself (the render sink host-gates `*.streamable.com`).
 *
 * @param {import("./slides.js").Slide} slide
 * @param {StreamableMedia} media
 * @returns {import("./slides.js").Slide}
 */
export function streamableVideoSlide(slide, media) {
  return toNativeVideoSlide(slide, media);
}

export const STREAMABLE_RESOLVE_CONCURRENCY = 4;
export const STREAMABLE_RESOLVE_TIMEOUT_MS = 8000;

/**
 * Upgrade every Streamable embed slide in a page to a direct native-video
 * slide. Resolution failures (incl. timeouts) keep the iframe embed fallback.
 *
 * @param {import("./slides.js").Slide[]} slides
 * @param {(id: string) => Promise<StreamableMedia>} resolve
 * @param {{ concurrency?: number, timeoutMs?: number, setTimeoutImpl?: typeof setTimeout }} [opts]
 * @returns {Promise<import("./slides.js").Slide[]>}
 */
export function resolveStreamableSlides(slides, resolve, opts = {}) {
  return resolveNativeSlides(slides, resolve, {
    provider: "streamable",
    extractId: streamableId,
    toSlide: streamableVideoSlide,
    concurrency: opts.concurrency ?? STREAMABLE_RESOLVE_CONCURRENCY,
    timeoutMs: opts.timeoutMs ?? STREAMABLE_RESOLVE_TIMEOUT_MS,
    setTimeoutImpl: opts.setTimeoutImpl,
    log,
  });
}

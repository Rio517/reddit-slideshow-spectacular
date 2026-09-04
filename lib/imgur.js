import { imgurAlbumId, buildImgurAlbumImageSlides } from "./slides.js";
import { mapLimit, withTimeout } from "./async-pool.js";
import { createLogger } from "./log.js";

const log = createLogger("imgur");

/**
 * Imgur album/gallery support (ADR 0015).
 *
 * Albums arrive from Reddit as a bare page link with no media. We resolve the
 * image list from Imgur's keyless front-end endpoint
 * (`imgur.com/ajaxalbums/getimages/<id>/hit.json`, no API key, no header) and
 * expand the placeholder slide 1→N into plain image slides. The images hotlink
 * directly from `i.imgur.com` (verified to work from a reddit referer), so —
 * unlike the `.gifv`→`.mp4` path (ADR 0011) — no blob proxy is needed.
 */

const AJAX_ALBUMS_URL = "https://imgur.com/ajaxalbums/getimages/";
/** @type {RequestInit} */
const PROVIDER_FETCH_OPTIONS = {
  credentials: "omit",
  referrerPolicy: "no-referrer",
};
// `.mp4` entries are real album videos (animated/prefer_video); they hotlink
// directly from i.imgur.com to a <video> (ADR 0015). The rest are images.
const ALLOWED_EXT = /^\.(avif|gif|jpe?g|mp4|png|webp)$/i;

/**
 * @param {{ fetchImpl?: typeof fetch }} [deps]
 */
export function createImgurAlbumResolver({ fetchImpl = fetch } = {}) {
  /**
   * @param {string} id
   * @returns {Promise<import("./slides.js").ImgurAlbumImage[]>}
   */
  async function resolve(id) {
    const res = await fetchImpl(
      `${AJAX_ALBUMS_URL}${id}/hit.json`,
      PROVIDER_FETCH_OPTIONS,
    );
    if (!res.ok) throw new Error(`Imgur album HTTP ${res.status}`);
    const data = (await res.json())?.data;
    // An empty/invalid album returns `data: []` (an array); a real one is an
    // object with an images array. HTTP status and `success` stay 200/true.
    const images = Array.isArray(data) ? [] : (data?.images ?? []);
    const out = [];
    for (const image of images) {
      const hash = image?.hash;
      const ext = image?.ext;
      if (typeof hash !== "string" || !/^[A-Za-z0-9]+$/.test(hash)) continue;
      if (typeof ext !== "string" || !ALLOWED_EXT.test(ext)) continue;
      out.push({
        hash,
        ext,
        width: typeof image.width === "number" ? image.width : undefined,
        height: typeof image.height === "number" ? image.height : undefined,
        animated: Boolean(image.animated),
        hasSound: Boolean(image.has_sound),
        looping: Boolean(image.looping),
      });
    }
    if (!out.length) throw new Error("Imgur album: no usable images");
    return out;
  }

  return { resolve };
}

export const IMGUR_RESOLVE_CONCURRENCY = 4;
export const IMGUR_RESOLVE_TIMEOUT_MS = 8000;

/**
 * Expand every `imgur-album` placeholder slide into its member image slides.
 * A failed or empty album is dropped (the post contributes no slides, as a bare
 * album link did before ADR 0015). Concurrency-limited and timed out.
 *
 * @param {import("./slides.js").Slide[]} slides
 * @param {(id: string) => Promise<import("./slides.js").ImgurAlbumImage[]>} resolve
 * @param {{ concurrency?: number, timeoutMs?: number, setTimeoutImpl?: typeof setTimeout }} [opts]
 * @returns {Promise<import("./slides.js").Slide[]>}
 */
export function resolveImgurAlbumSlides(slides, resolve, opts = {}) {
  const concurrency = opts.concurrency ?? IMGUR_RESOLVE_CONCURRENCY;
  const timeoutMs = opts.timeoutMs ?? IMGUR_RESOLVE_TIMEOUT_MS;
  const setTimeoutImpl = opts.setTimeoutImpl ?? setTimeout;

  /** @param {import("./slides.js").Slide} slide @returns {Promise<import("./slides.js").Slide[]>} */
  const expand = async (slide) => {
    if (slide.provider !== "imgur-album") return [slide];
    const id = imgurAlbumId(slide.sourceUrl);
    if (!id) return [];
    try {
      const images = await withTimeout(resolve(id), timeoutMs, setTimeoutImpl);
      return buildImgurAlbumImageSlides(slide, images);
    } catch (err) {
      log.warn("album resolve failed, dropping", id, err);
      return [];
    }
  };

  return mapLimit(slides, concurrency, expand).then((groups) => groups.flat());
}

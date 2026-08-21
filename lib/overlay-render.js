import {
  DIRECT_VIDEO_HOSTS,
  DIRECT_VIDEO_HOST_SUFFIXES,
  EMBED_HOSTS,
  REDGIFS_MEDIA_HOST,
  hostMatches,
} from "./provider-hosts.js";
import { needsLod } from "./zoom-lod.js";

/**
 * @typedef {import("./slides.js").Slide} Slide
 */

export const MEDIA_CLASS = "reddit-slideshow-media";

/**
 * Build a DOM element that renders a slide's media.
 *
 * CSP-safe: attributes only, never innerHTML. old.reddit.com sets no CSP, and
 * www.reddit.com's logged-in CSP permits our media hosts (img-src https:,
 * media-src *.redd.it, frame-src redgifs.com), so cross-origin media loads
 * directly from content-script-injected elements.
 *
 * @param {Slide} slide
 * @param {Document} [doc]
 * @returns {HTMLElement}
 */
export function renderSlide(slide, doc = document) {
  let element;
  switch (slide.kind) {
    case "video":
      element = renderVideo(slide, doc);
      break;
    case "embed":
      element = renderEmbed(slide, doc);
      break;
    case "image":
    default:
      element = renderImage(slide, doc);
      break;
  }
  element.classList.add(MEDIA_CLASS);
  // Videos and animated gifs fill the viewport so a small clip doesn't sit tiny;
  // static images keep their intrinsic size (and pan & zoom when large).
  const filled = slide.kind === "video" || isGifImage(slide);
  if (filled) element.classList.add(`${MEDIA_CLASS}--fill`);
  element.dataset.provider = slide.provider;
  element.dataset.slideId = slide.id;
  applyAspectRatio(element, slide, filled);
  return element;
}

/**
 * An animated gif shown as an `<img>` (not a native video) - it reads as moving
 * content, so it's filled and excluded from pan & zoom like a video.
 * @param {Slide} slide
 * @returns {boolean}
 */
export function isGifImage(slide) {
  return (
    slide.kind === "image" &&
    (Boolean(slide.isGif) || slide.mimeType === "image/gif")
  );
}

/**
 * @param {Slide} slide
 * @param {Document} doc
 * @returns {HTMLImageElement}
 */
function renderImage(slide, doc) {
  const img = doc.createElement("img");
  img.alt = slide.title;
  img.decoding = "async";
  // The on-screen image outranks the background preloads for the next slides.
  img.setAttribute("fetchpriority", "high");
  // old.reddit.com sends no CSP, so validate before the sink: HTTPS only (any
  // host - image posts legitimately link to external hosts).
  const src = safeMediaUrl(slide.mediaUrl);
  // A very large source starts from reddit's preview so the slide swap waits
  // on a fast decode; the overlay upgrades to the original in place.
  const preview = needsLod(slide.sourceWidth ?? 0, slide.sourceHeight ?? 0)
    ? safeMediaUrl(slide.previewUrl)
    : undefined;
  if (src && preview) {
    img.src = preview;
    img.dataset.rsFull = src;
  } else if (src) {
    img.src = src;
  }
  return img;
}

/**
 * @param {Slide} slide
 * @param {Document} doc
 * @returns {HTMLVideoElement}
 */
function renderVideo(slide, doc) {
  const video = doc.createElement("video");
  // Direct (non-proxied) src, gated to an allow-listed video host, with no
  // Referer so a provider CDN (Redgifs) can't 403 the hotlink. Proxied is the
  // fallback for CSP-blocked pages: the overlay sets a blob: src asynchronously.
  if (!slide.proxied) {
    const src = safeMediaUrl(slide.mediaUrl, isDirectVideoHost);
    if (src) {
      // Only the Redgifs CDN 403s a reddit Referer, so suppress it for that host
      // alone (v.redd.it/Catbox/Imgur/Giphy serve fine with one - don't change
      // theirs). Firefox honors referrerpolicy on a <video>; Chrome does not, so
      // the Chrome build marks redgifs slides proxied upstream and never reaches
      // this branch for them (set as an attribute since TS lacks the property).
      if (new URL(src).hostname === REDGIFS_MEDIA_HOST) {
        video.setAttribute("referrerpolicy", "no-referrer");
      }
      video.src = src;
    }
  }
  // The overlay starts playback explicitly, and only when the show is playing, so
  // a paused or manual-mode slide shows its first frame without moving (matching
  // how pan & zoom freezes when paused). Muted keeps that programmatic play()
  // allowed by the autoplay policy.
  video.muted = true;
  video.autoplay = false;
  video.playsInline = true;
  // No native control bar: it pops in disruptively over the slideshow and would
  // be a second, competing mute. Every video follows the slideshow's own mute
  // state (set in overlay-ui from the shared `muted` flag) instead.
  video.controls = false;
  video.loop = Boolean(slide.isGif);
  video.preload = "auto";
  return video;
}

/**
 * @param {Slide} slide
 * @param {Document} doc
 * @returns {HTMLIFrameElement}
 */
function renderEmbed(slide, doc) {
  const iframe = doc.createElement("iframe");
  const src = safeEmbedUrl(slide.embedUrl ?? slide.mediaUrl);
  if (src) iframe.src = src;
  iframe.allow = "autoplay; fullscreen";
  // Let the provider's player run, but deny it top-navigation, popups, and form
  // submission so a third-party embed cannot hijack the Reddit tab. No
  // allow-same-origin: with allow-scripts it would let the embed act as its real
  // origin (the known sandbox foot-gun).
  iframe.setAttribute("sandbox", "allow-scripts allow-presentation");
  iframe.setAttribute("allowfullscreen", "true");
  iframe.setAttribute("scrolling", "no");
  iframe.setAttribute("frameborder", "0");
  return iframe;
}

// Images can come from any external host (gated on protocol only); video and
// embeds are restricted to known hosts - the allowlists live in provider-hosts.
/** @param {string} host */
function isDirectVideoHost(host) {
  return hostMatches(host, {
    hosts: DIRECT_VIDEO_HOSTS,
    suffixes: DIRECT_VIDEO_HOST_SUFFIXES,
  });
}

/**
 * Validate a media URL before it reaches an <img>/<video> src. HTTPS is
 * required; when `isAllowedHost` is given the URL's host must pass it.
 * @param {string | undefined} url
 * @param {(host: string) => boolean} [isAllowedHost]
 * @returns {string | undefined}
 */
function safeMediaUrl(url, isAllowedHost) {
  if (typeof url !== "string") return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return undefined;
    if (isAllowedHost && !isAllowedHost(parsed.hostname)) return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

/**
 * Whether a slide's media is loadable directly from its display sink, mirroring
 * the per-kind gating above so the overlay can skip an unsafe slide instead of
 * waiting on a load that never comes.
 * @param {Slide} slide
 * @returns {boolean}
 */
export function mediaUrlIsSafe(slide) {
  if (slide.kind === "image") return Boolean(safeMediaUrl(slide.mediaUrl));
  if (slide.kind === "video" && !slide.proxied) {
    return Boolean(safeMediaUrl(slide.mediaUrl, isDirectVideoHost));
  }
  if (slide.kind === "embed") {
    return Boolean(safeEmbedUrl(slide.embedUrl ?? slide.mediaUrl));
  }
  return true; // proxied video (blob) is validated elsewhere
}

/**
 * @param {string | undefined} src
 * @returns {string | undefined}
 */
function safeEmbedUrl(src) {
  // Same HTTPS + allow-list validation as safeMediaUrl, with the embed host required.
  return safeMediaUrl(src, (host) => hostMatches(host, { hosts: EMBED_HOSTS }));
}

/**
 * @param {HTMLElement} element
 * @param {Slide} slide
 * @param {boolean} filled Whether the element fills the viewport (video/gif).
 */
function applyAspectRatio(element, slide, filled) {
  if (!(slide.sourceWidth && slide.sourceHeight)) return;
  // Static images size themselves from their intrinsic dimensions.
  if (slide.kind === "image" && !filled) return;
  // Pre-load layout hint so video/iframe reserve the right box before metadata.
  element.style.aspectRatio = `${slide.sourceWidth} / ${slide.sourceHeight}`;
  if (!filled) return;
  // A filled element would otherwise be a 100vw×100vh box with the clip
  // letterboxed *inside* it, so the black bars are part of the element: its
  // native controls span the whole window and a click there can't reach the
  // backdrop to close. Size the box to the largest rect of this aspect that
  // fits the viewport instead, so the surrounding black is real backdrop.
  // (overlay.css falls back to full-bleed when these vars are unset.)
  const ar = slide.sourceWidth / slide.sourceHeight;
  const n = (/** @type {number} */ v) => Number(v.toFixed(3)).toString();
  element.style.setProperty("--rs-fit-w", `min(100vw, ${n(100 * ar)}vh)`);
  element.style.setProperty("--rs-fit-h", `min(100vh, ${n(100 / ar)}vw)`);
}

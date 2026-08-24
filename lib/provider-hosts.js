/**
 * Single source of truth for the host allowlists that gate media loading.
 *
 * The playback sink (overlay-render) and the privileged background proxy fetch
 * (background-router) are trust boundaries, and the provider resolvers validate
 * third-party API responses against the same facts. Declaring each host once
 * here keeps those lists from drifting apart (a silent drift fails closed: the
 * media just won't load).
 */

// Redgifs API mp4 host; the third-party API response is validated against it.
export const REDGIFS_MEDIA_HOST = "media.redgifs.com";
export const STREAMABLE_HOST_SUFFIX = ".streamable.com";
export const GIPHY_HOST_SUFFIX = ".giphy.com";

// Reddit's preview CDN: the still previews of every post (own uploads on
// preview., linked media on external-preview.) and the mp4 transcode reddit
// makes of every gif post.
export const REDDIT_PREVIEW_HOSTS = [
  "preview.redd.it",
  "external-preview.redd.it",
];

// Direct-playable video hosts. Reddit's own and Catbox direct files (ADR 0012),
// plus the provider CDNs we now load directly rather than proxy: Redgifs,
// Streamable, Imgur (i.imgur.com), and Giphy. Their CDNs serve the mp4 to a
// <video> on a reddit page (Redgifs needs referrerpolicy="no-referrer" to dodge
// its Referer 403). The blob proxy below stays as a fallback for pages whose CSP
// blocks cross-origin media (www.reddit). Exact + dot-prefixed suffix match.
export const DIRECT_VIDEO_HOSTS = [
  "v.redd.it",
  ...REDDIT_PREVIEW_HOSTS,
  "files.catbox.moe",
  REDGIFS_MEDIA_HOST,
  "i.imgur.com",
];
export const DIRECT_VIDEO_HOST_SUFFIXES = [
  STREAMABLE_HOST_SUFFIX,
  GIPHY_HOST_SUFFIX,
];
// First-party iframe-embed fallbacks, used when native resolution fails.
export const EMBED_HOSTS = ["www.redgifs.com", "streamable.com"];

// Media the background can proxy to a blob (the fallback when a direct load is
// blocked by the page CSP). The CDN 403s a reddit Referer for some (Redgifs;
// Imgur .gifv -> .mp4, ADR 0011). Exact + suffix match.
export const PROXY_MEDIA_HOSTS = [REDGIFS_MEDIA_HOST, "i.imgur.com"];
export const PROXY_MEDIA_HOST_SUFFIXES = [
  STREAMABLE_HOST_SUFFIX,
  GIPHY_HOST_SUFFIX,
];
// Image hosts whose bytes the background may fetch for Layer-2 perceptual
// dedup (ADR 0006/0015). Exact match.
export const HASHABLE_HOSTS = [
  "i.redd.it",
  ...REDDIT_PREVIEW_HOSTS,
  "i.imgur.com",
];

/**
 * Host allowlist matcher: exact host in `hosts`, or ending with one of
 * `suffixes`. The matching used by every media trust gate, declared once.
 * @param {string} host
 * @param {{ hosts?: readonly string[], suffixes?: readonly string[] }} allow
 * @returns {boolean}
 */
export function hostMatches(host, { hosts = [], suffixes = [] }) {
  return (
    hosts.includes(host) || suffixes.some((suffix) => host.endsWith(suffix))
  );
}

/**
 * Whether a host is Streamable (the watch domain or any CDN subdomain). Used by
 * the resolver's response validation and listing-provider detection.
 * @param {string | undefined} host
 * @returns {boolean}
 */
export function isStreamableHost(host) {
  return (
    !!host &&
    (host === "streamable.com" || host.endsWith(STREAMABLE_HOST_SUFFIX))
  );
}

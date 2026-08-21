import { hostnameOf, pathnameOf } from "./url-utils.js";
import {
  HASHABLE_HOSTS,
  hostMatches,
  isStreamableHost,
} from "./provider-hosts.js";

/** @import { RedditListing, RedditPost, RedditVideo } from "./reddit-types.js" */

const OLD_REDDIT_ORIGIN = "https://old.reddit.com";
const REDGIFS_EMBED_ORIGIN = "https://www.redgifs.com";
const IMGUR_MEDIA_ORIGIN = "https://i.imgur.com";
const STREAMABLE_EMBED_ORIGIN = "https://streamable.com";
const GIPHY_MEDIA_ORIGIN = "https://media.giphy.com";

/**
 * @typedef {object} Slide
 * @property {string} id
 * @property {string | undefined} postId
 * @property {"reddit-image" | "reddit-gallery" | "reddit-video" | "redgifs" | "imgur" | "imgur-album" | "catbox" | "streamable" | "giphy"} provider
 * @property {"image" | "video" | "embed"} kind
 * @property {string} mediaUrl
 * @property {string} [previewUrl] Largest reddit-generated preview URL; very
 *   large sources render it first and upgrade to the original in place.
 * @property {string} [hashUrl] Smallest reddit-generated preview URL, hashed
 *   for Layer-2 dedup instead of re-fetching the full-resolution mediaUrl.
 * @property {string} sourceUrl
 * @property {string | undefined} permalink
 * @property {string} title
 * @property {string} [author] Reddit username (no "u/" prefix), for the title byline.
 * @property {string} [subreddit] Subreddit name (no "r/" prefix), for the byline.
 * @property {boolean | null} [likes] Current vote on the post: true up, false
 *   down, null/undefined none. Seeds the up/down keys; mutated as the user votes.
 * @property {boolean} over18
 * @property {"timer" | "media"} durationMode
 * @property {boolean} audioAvailable
 * @property {number | undefined} sourceWidth
 * @property {number | undefined} sourceHeight
 * @property {"original" | "preview"} quality
 * @property {string | undefined} mimeType
 * @property {string} filenameHint
 * @property {number} [galleryIndex] 1-based position within a multi-image gallery
 *   post; unset for single images so the jump list can disambiguate galleries.
 * @property {number} [galleryTotal] Number of images in the gallery post.
 * @property {number} [durationSeconds]
 * @property {string} [dashUrl]
 * @property {string} [hlsUrl]
 * @property {string} [audioUrl] Resolved separate audio track (v.redd.it), played
 *   from a companion <audio> synced to the silent fallback video.
 * @property {string} [embedUrl]
 * @property {boolean} [isGif]
 * @property {boolean} [proxied] Media bytes must be fetched by the background
 *   and played as a blob (e.g. Redgifs, whose CDN blocks a reddit Referer).
 * @property {string} [skipReason] Set when the slide was auto-skipped (broken
 *   media, perceptual duplicate); shown in the jump and skipped lists.
 */

/**
 * @param {RedditListing} listing Reddit listing JSON in raw_json=1 form.
 * @param {string} [origin] Page origin used to resolve relative permalinks, so
 *   "open original" stays on the user's frontend. Defaults to old Reddit.
 * @returns {Slide[]}
 */
export function slidesFromListing(listing, origin = OLD_REDDIT_ORIGIN) {
  const children = listing?.data?.children ?? [];
  return children.flatMap((child) => slidesFromPost(child.data, origin));
}

/**
 * Resolve a single listing post into zero or more slides.
 *
 * Crossposts carry their media inside `crosspost_parent_list[0]`, so media is
 * resolved from the parent while display context (id, title, permalink, NSFW
 * flag) stays with the post the user actually sees.
 *
 * @param {RedditPost | undefined} post
 * @param {string} origin
 * @returns {Slide[]}
 */
function slidesFromPost(post, origin) {
  if (!post) return [];
  const media = post.crosspost_parent_list?.[0] ?? post;
  const slides = dispatchSlides(media, post, origin);
  // The byline is the display post's author (who shared it), even when a
  // crosspost's media came from elsewhere; the subreddit and vote state are the
  // display post's too.
  const author = post.author;
  if (author && author !== "[deleted]") {
    for (const s of slides) if (s.author === undefined) s.author = author;
  }
  if (post.subreddit) {
    for (const s of slides)
      if (s.subreddit === undefined) s.subreddit = post.subreddit;
  }
  if (post.likes != null) {
    for (const s of slides) if (s.likes === undefined) s.likes = post.likes;
  }
  return slides;
}

/**
 * @param {RedditPost} media
 * @param {RedditPost} post
 * @param {string} origin
 * @returns {Slide[]}
 */
function dispatchSlides(media, post, origin) {
  if (isGalleryPost(media)) return gallerySlides(media, post, origin);
  if (isRedditVideoPost(media)) return redditVideoSlides(media, post, origin);
  if (isRedgifsPost(media)) return redgifsSlides(media, post, origin);
  if (isStreamablePost(media)) return streamableSlides(media, post, origin);
  if (isImgurGifvPost(media)) return imgurGifvSlides(media, post, origin);
  if (isImgurAlbumPost(media))
    return imgurAlbumPlaceholderSlides(media, post, origin);
  if (isGiphyPost(media)) return giphySlides(media, post, origin);
  if (isCatboxVideoPost(media)) return catboxVideoSlides(media, post, origin);
  return imageSlides(media, post, origin);
}

/**
 * Smallest reddit-generated preview URL, for Layer-2 dedup hashing (a 9x8
 * dHash doesn't need full resolution). Host-gated to the same allowlist the
 * background hasher enforces, so this never points the privileged fetch at
 * an unvetted host.
 * @param {RedditPost} media
 * @returns {string | undefined}
 */
function hashPreviewUrl(media) {
  return gatedPreviewUrl(media.preview?.images?.[0]?.resolutions?.[0]?.url);
}

/**
 * Largest reddit-generated preview URL, rendered first for very large
 * sources. Same host gate as the hash preview.
 * @param {RedditPost} media
 * @returns {string | undefined}
 */
function largestPreviewUrl(media) {
  const resolutions = media.preview?.images?.[0]?.resolutions;
  return gatedPreviewUrl(resolutions?.[resolutions.length - 1]?.url);
}

/**
 * @param {string | undefined} url
 * @returns {string | undefined}
 */
function gatedPreviewUrl(url) {
  if (!url) return undefined;
  const host = hostnameOf(url);
  return host && hostMatches(host, { hosts: HASHABLE_HOSTS }) ? url : undefined;
}

/**
 * @param {RedditPost} media
 * @param {RedditPost} context
 * @param {string} origin
 * @returns {Slide[]}
 */
function imageSlides(media, context, origin) {
  const url = media.url_overridden_by_dest ?? media.url;
  if (!url || !isImagePost(media, url)) return [];

  const previewSource = media.preview?.images?.[0]?.source;
  const isOriginal = hostnameOf(url) === "i.redd.it";

  return [
    {
      id: `${context.name}:0`,
      postId: context.name,
      provider: "reddit-image",
      kind: "image",
      mediaUrl: url,
      previewUrl: largestPreviewUrl(media),
      hashUrl: hashPreviewUrl(media),
      sourceUrl: url,
      permalink: absolutePermalink(context.permalink, origin),
      title: context.title ?? "",
      over18: Boolean(context.over_18),
      durationMode: "timer",
      audioAvailable: false,
      sourceWidth: previewSource?.width,
      sourceHeight: previewSource?.height,
      quality: isOriginal ? "original" : "preview",
      mimeType: mimeTypeFromUrl(url),
      filenameHint: filenameHint(context, url),
    },
  ];
}

/**
 * @param {RedditPost} media
 * @param {RedditPost} context
 * @param {string} origin
 * @returns {Slide[]}
 */
function gallerySlides(media, context, origin) {
  const items = media.gallery_data?.items ?? [];
  /** @type {Slide[]} */
  const slides = [];

  for (const item of items) {
    const mediaId = item?.media_id;
    const meta = mediaId ? media.media_metadata?.[mediaId] : undefined;
    if (item?.is_deleted || meta?.status !== "valid" || !meta?.s?.u) continue;

    const url = meta.s.u;
    const index = slides.length;
    slides.push({
      id: `${context.name}:${index}`,
      postId: context.name,
      provider: "reddit-gallery",
      kind: "image",
      mediaUrl: url,
      previewUrl: gatedPreviewUrl(meta.p?.[meta.p.length - 1]?.u),
      sourceUrl: url,
      permalink: absolutePermalink(context.permalink, origin),
      title: context.title ?? "",
      over18: Boolean(context.over_18),
      durationMode: "timer",
      audioAvailable: false,
      sourceWidth: meta.s.x,
      sourceHeight: meta.s.y,
      quality: "original",
      mimeType: mimeTypeFromUrl(url),
      filenameHint: filenameHint(context, url, { index }),
    });
  }

  // Number the images so jump-list entries from one gallery (which share a
  // title) are distinguishable rather than looking like duplicates. Only when
  // there is more than one valid image - a lone image is not a "1/1".
  if (slides.length > 1) {
    const total = slides.length;
    slides.forEach((slide, i) => {
      slide.galleryIndex = i + 1;
      slide.galleryTotal = total;
    });
  }

  return slides;
}

/**
 * @param {RedditPost} media
 * @param {RedditPost} context
 * @param {string} origin
 * @returns {Slide[]}
 */
function redditVideoSlides(media, context, origin) {
  const video = redditVideoOf(media);
  if (!video?.fallback_url) return [];
  const url = video.fallback_url;

  const isGif = Boolean(video.is_gif);
  return [
    {
      id: `${context.name}:0`,
      postId: context.name,
      provider: "reddit-video",
      kind: "video",
      mediaUrl: url,
      sourceUrl: media.url ?? url,
      permalink: absolutePermalink(context.permalink, origin),
      title: context.title ?? "",
      over18: Boolean(context.over_18),
      durationMode: "media",
      audioAvailable: Boolean(video.has_audio) && !isGif,
      durationSeconds:
        typeof video.duration === "number" ? video.duration : undefined,
      sourceWidth: video.width,
      sourceHeight: video.height,
      quality: "original",
      mimeType: "video/mp4",
      dashUrl: video.dash_url,
      hlsUrl: video.hls_url,
      isGif,
      filenameHint: filenameHint(context, url, { extension: "mp4" }),
    },
  ];
}

/**
 * @param {RedditPost} media
 * @param {RedditPost} context
 * @param {string} origin
 * @returns {Slide[]}
 */
function redgifsSlides(media, context, origin) {
  const watchUrl = media.url_overridden_by_dest ?? media.url;
  const id = redgifsId(watchUrl);
  if (!id || !watchUrl) return [];

  const embedUrl = `${REDGIFS_EMBED_ORIGIN}/ifr/${id}`;
  const oembed = media.secure_media?.oembed;
  return [
    {
      id: `${context.name}:0`,
      postId: context.name,
      provider: "redgifs",
      kind: "embed",
      mediaUrl: embedUrl,
      sourceUrl: watchUrl,
      permalink: absolutePermalink(context.permalink, origin),
      title: context.title ?? "",
      over18: Boolean(context.over_18),
      durationMode: "timer",
      audioAvailable: false,
      sourceWidth: oembed?.width,
      sourceHeight: oembed?.height,
      quality: "original",
      mimeType: undefined,
      embedUrl,
      filenameHint: filenameHint(context, watchUrl, { extension: "mp4" }),
    },
  ];
}

/**
 * Streamable arrives as a watch URL. Emit the first-party iframe embed (`/e/<id>`)
 * as a renderable fallback; the background resolver upgrades it to a proxied
 * native video resolved from the public API (ADR 0013). Mirrors the Redgifs flow.
 *
 * @param {RedditPost} media
 * @param {RedditPost} context
 * @param {string} origin
 * @returns {Slide[]}
 */
function streamableSlides(media, context, origin) {
  const watchUrl = media.url_overridden_by_dest ?? media.url;
  const id = streamableId(watchUrl);
  if (!id || !watchUrl) return [];

  const embedUrl = `${STREAMABLE_EMBED_ORIGIN}/e/${id}`;
  return [
    {
      id: `${context.name}:0`,
      postId: context.name,
      provider: "streamable",
      kind: "embed",
      mediaUrl: embedUrl,
      sourceUrl: watchUrl,
      permalink: absolutePermalink(context.permalink, origin),
      title: context.title ?? "",
      over18: Boolean(context.over_18),
      durationMode: "timer",
      audioAvailable: false,
      sourceWidth: undefined,
      sourceHeight: undefined,
      quality: "original",
      mimeType: undefined,
      embedUrl,
      filenameHint: filenameHint(context, watchUrl, { extension: "mp4" }),
    },
  ];
}

/**
 * Imgur `.gifv` is a silent, looping clip with a matching `.mp4` at the same id
 * on i.imgur.com. Transform the URL (no network resolve) and play it directly as
 * a native looping `<video>`. The background blob proxy is the fallback for pages
 * whose CSP blocks cross-origin media (www.reddit) - see the `proxied` flag.
 *
 * @param {RedditPost} media
 * @param {RedditPost} context
 * @param {string} origin
 * @returns {Slide[]}
 */
function imgurGifvSlides(media, context, origin) {
  const srcUrl = media.url_overridden_by_dest ?? media.url;
  const id = imgurGifvId(srcUrl);
  if (!id || !srcUrl) return [];

  // Any imgur subdomain is normalized to the canonical i.imgur.com mp4, so the
  // background proxy allowlist stays a single host (i.imgur.com).
  const mp4 = `${IMGUR_MEDIA_ORIGIN}/${id}.mp4`;
  const previewSource = media.preview?.images?.[0]?.source;
  return [
    {
      id: `${context.name}:0`,
      postId: context.name,
      provider: "imgur",
      kind: "video",
      mediaUrl: mp4,
      sourceUrl: srcUrl,
      permalink: absolutePermalink(context.permalink, origin),
      title: context.title ?? "",
      over18: Boolean(context.over_18),
      durationMode: "media",
      audioAvailable: false,
      sourceWidth: previewSource?.width,
      sourceHeight: previewSource?.height,
      quality: "original",
      mimeType: "video/mp4",
      isGif: true,
      filenameHint: filenameHint(context, mp4, { extension: "mp4" }),
    },
  ];
}

/**
 * @param {RedditPost | undefined} media
 */
function isImgurGifvPost(media) {
  const url = media?.url_overridden_by_dest ?? media?.url;
  const host = hostnameOf(url);
  if (!host || !(host === "imgur.com" || host.endsWith(".imgur.com"))) {
    return false;
  }
  return /\.gifv$/i.test(pathnameOf(url) ?? "");
}

/**
 * Extract the Imgur id from a `.gifv` URL (`/<id>.gifv`).
 * @param {string | undefined} url
 * @returns {string | undefined}
 */
function imgurGifvId(url) {
  const match = /\/([A-Za-z0-9]+)\.gifv$/i.exec(pathnameOf(url) ?? "");
  return match ? match[1] : undefined;
}

/**
 * Extract the Imgur album/gallery id — the trailing alphanumeric token of an
 * `/a/<id>` or `/gallery/<slug>-<id>` path (ids contain no hyphens).
 * @param {string | undefined} url
 * @returns {string | undefined}
 */
export function imgurAlbumId(url) {
  const match = /^\/(?:a|gallery)\/(?:.*-)?([A-Za-z0-9]+)\/?$/.exec(
    pathnameOf(url) ?? "",
  );
  return match ? match[1] : undefined;
}

/**
 * An imgur.com album/gallery PAGE link (not the i.imgur.com media host, whose
 * direct files go through the image path).
 * @param {RedditPost | undefined} media
 */
function isImgurAlbumPost(media) {
  const url = media?.url_overridden_by_dest ?? media?.url;
  const host = hostnameOf(url);
  if (!host || host === "i.imgur.com") return false;
  if (!(host === "imgur.com" || host.endsWith(".imgur.com"))) return false;
  return Boolean(imgurAlbumId(url));
}

/**
 * Imgur albums arrive as a bare page link with no media. Emit one placeholder
 * slide carrying the album id (in sourceUrl); the background resolver expands it
 * into N image slides via the keyless ajaxalbums endpoint (ADR 0015).
 *
 * @param {RedditPost} media
 * @param {RedditPost} context
 * @param {string} origin
 * @returns {Slide[]}
 */
function imgurAlbumPlaceholderSlides(media, context, origin) {
  const srcUrl = media.url_overridden_by_dest ?? media.url;
  const id = imgurAlbumId(srcUrl);
  if (!id || !srcUrl) return [];
  return [
    {
      id: `${context.name}:album`,
      postId: context.name,
      provider: "imgur-album",
      kind: "image",
      mediaUrl: "",
      sourceUrl: srcUrl,
      permalink: absolutePermalink(context.permalink, origin),
      title: context.title ?? "",
      over18: Boolean(context.over_18),
      durationMode: "timer",
      audioAvailable: false,
      sourceWidth: undefined,
      sourceHeight: undefined,
      quality: "original",
      mimeType: undefined,
      filenameHint: filenameHint(context, srcUrl),
    },
  ];
}

/**
 * @typedef {object} ImgurAlbumImage
 * @property {string} hash
 * @property {string} ext Leading-dot extension, e.g. ".jpg" or ".mp4".
 * @property {number} [width]
 * @property {number} [height]
 * @property {boolean} [animated]
 * @property {boolean} [hasSound] A `.mp4` entry that carries audio.
 * @property {boolean} [looping] A `.mp4` entry that loops (a silent clip).
 */

/**
 * Expand a resolved Imgur album into its member image slides, inheriting the
 * post's display context from the placeholder. Numbered (galleryIndex/Total)
 * when there is more than one, so jump-list entries that share a title are
 * distinguishable — matching native Reddit galleries.
 *
 * @param {Slide} placeholder The `imgur-album` placeholder slide.
 * @param {ImgurAlbumImage[]} images
 * @returns {Slide[]}
 */
export function buildImgurAlbumImageSlides(placeholder, images) {
  /** @type {Slide[]} */
  const slides = images.map((img, index) => {
    const mediaUrl = `${IMGUR_MEDIA_ORIGIN}/${img.hash}${img.ext}`;
    const isVideo = /\.mp4$/i.test(img.ext);
    /** @type {Slide} */
    const base = {
      id: `${placeholder.postId}:${index}`,
      postId: placeholder.postId,
      provider: "imgur",
      kind: "image",
      mediaUrl,
      sourceUrl: mediaUrl,
      permalink: placeholder.permalink,
      title: placeholder.title,
      author: placeholder.author,
      over18: placeholder.over18,
      durationMode: "timer",
      audioAvailable: false,
      sourceWidth: img.width,
      sourceHeight: img.height,
      quality: "original",
      mimeType: mimeTypeFromUrl(mediaUrl),
      filenameHint: filenameHint(
        /** @type {any} */ ({
          name: placeholder.postId,
          title: placeholder.title,
        }),
        mediaUrl,
        { index },
      ),
    };
    if (!isVideo) return base;
    // A `.mp4` member plays directly from i.imgur.com (a DIRECT_VIDEO_HOST).
    // It advances on `ended`; a silent looping clip reads as a gif (fills, no
    // pan/zoom, loops), while one with audio plays through once.
    return {
      ...base,
      kind: "video",
      durationMode: "media",
      audioAvailable: Boolean(img.hasSound),
      mimeType: "video/mp4",
      isGif: Boolean(img.looping) && !img.hasSound,
    };
  });
  if (slides.length > 1) {
    const total = slides.length;
    slides.forEach((slide, i) => {
      slide.galleryIndex = i + 1;
      slide.galleryTotal = total;
    });
  }
  return slides;
}

/**
 * Giphy `giphy.com/gifs/<slug-id>` watch pages carry no direct media, so the
 * image path skips them. Transform to the canonical silent-looping mp4 (no API)
 * and play it directly from Giphy's media CDN (ADR 0014); the background blob
 * proxy is the fallback for CSP-blocked pages. Direct `media.giphy.com` /
 * `i.giphy.com` gifs already render via the generic image path.
 *
 * @param {RedditPost} media
 * @param {RedditPost} context
 * @param {string} origin
 * @returns {Slide[]}
 */
function giphySlides(media, context, origin) {
  const srcUrl = media.url_overridden_by_dest ?? media.url;
  const id = giphyId(srcUrl);
  if (!id || !srcUrl) return [];

  const mp4 = `${GIPHY_MEDIA_ORIGIN}/media/${id}/giphy.mp4`;
  const previewSource = media.preview?.images?.[0]?.source;
  return [
    {
      id: `${context.name}:0`,
      postId: context.name,
      provider: "giphy",
      kind: "video",
      mediaUrl: mp4,
      sourceUrl: srcUrl,
      permalink: absolutePermalink(context.permalink, origin),
      title: context.title ?? "",
      over18: Boolean(context.over_18),
      durationMode: "media",
      audioAvailable: false,
      sourceWidth: previewSource?.width,
      sourceHeight: previewSource?.height,
      quality: "original",
      mimeType: "video/mp4",
      isGif: true,
      filenameHint: filenameHint(context, mp4, { extension: "mp4" }),
    },
  ];
}

/**
 * Only the `giphy.com` watch domain (not the media/i CDN subdomains, whose gifs
 * already work as images) with an extractable id.
 * @param {RedditPost | undefined} media
 */
function isGiphyPost(media) {
  const url = media?.url_overridden_by_dest ?? media?.url;
  if (hostnameOf(url) !== "giphy.com") return false;
  return Boolean(giphyId(url));
}

/**
 * Extract the Giphy id - the trailing alphanumeric token of a
 * `/gifs|clips|embed|stickers/<slug-with-id>` path (ids contain no hyphens).
 * @param {string | undefined} url
 * @returns {string | undefined}
 */
function giphyId(url) {
  const match =
    /^\/(?:gifs|clips|embed|stickers)\/(?:.*-)?([A-Za-z0-9]+)$/.exec(
      pathnameOf(url) ?? "",
    );
  return match ? match[1] : undefined;
}

const CATBOX_VIDEO_EXT = /\.(mp4|webm|mov)$/i;
/** @type {Record<string, string>} */
const CATBOX_MIME_TYPES = {
  webm: "video/webm",
  mov: "video/quicktime",
  mp4: "video/mp4",
};

/**
 * Catbox serves direct files with no hotlink protection, so a video file plays
 * as a native `<video>` loaded straight from the page (no background proxy). The
 * sink is still host/HTTPS-gated to files.catbox.moe (ADR 0012). Catbox images
 * already work via the generic image path.
 *
 * @param {RedditPost} media
 * @param {RedditPost} context
 * @param {string} origin
 * @returns {Slide[]}
 */
function catboxVideoSlides(media, context, origin) {
  const url = media.url_overridden_by_dest ?? media.url;
  if (!url) return [];
  const ext = (
    CATBOX_VIDEO_EXT.exec(pathnameOf(url) ?? "")?.[1] ?? "mp4"
  ).toLowerCase();
  const mimeType = CATBOX_MIME_TYPES[ext] ?? "video/mp4";
  const previewSource = media.preview?.images?.[0]?.source;
  return [
    {
      id: `${context.name}:0`,
      postId: context.name,
      provider: "catbox",
      kind: "video",
      mediaUrl: url,
      sourceUrl: url,
      permalink: absolutePermalink(context.permalink, origin),
      title: context.title ?? "",
      over18: Boolean(context.over_18),
      durationMode: "media",
      audioAvailable: true,
      sourceWidth: previewSource?.width,
      sourceHeight: previewSource?.height,
      quality: "original",
      mimeType,
      filenameHint: filenameHint(context, url, { extension: ext }),
    },
  ];
}

/**
 * @param {RedditPost | undefined} media
 */
function isCatboxVideoPost(media) {
  const url = media?.url_overridden_by_dest ?? media?.url;
  if (hostnameOf(url) !== "files.catbox.moe") return false;
  return CATBOX_VIDEO_EXT.test(pathnameOf(url) ?? "");
}

/**
 * @param {RedditPost | undefined} media
 */
function isGalleryPost(media) {
  return Boolean(
    media?.is_gallery && media?.gallery_data?.items && media?.media_metadata,
  );
}

/**
 * @param {RedditPost | undefined} media
 * @returns {RedditVideo | undefined}
 */
function redditVideoOf(media) {
  return media?.secure_media?.reddit_video ?? media?.media?.reddit_video;
}

/**
 * @param {RedditPost | undefined} media
 */
function isRedditVideoPost(media) {
  return Boolean(redditVideoOf(media));
}

/**
 * @param {RedditPost | undefined} media
 */
function isRedgifsPost(media) {
  if (media?.secure_media?.type === "redgifs.com") return true;
  const host = hostnameOf(media?.url_overridden_by_dest ?? media?.url);
  return Boolean(
    host && (host === "redgifs.com" || host.endsWith(".redgifs.com")),
  );
}

/**
 * @param {RedditPost} post
 * @param {string} url
 */
function isImagePost(post, url) {
  if (post.post_hint === "image") return true;
  return /\.(avif|gif|jpe?g|png|webp)(\?.*)?$/i.test(url);
}

/**
 * @param {string | undefined} url
 * @returns {string | undefined}
 */
export function redgifsId(url) {
  if (!url) return undefined;
  const match = /\/(?:watch|ifr)\/([A-Za-z0-9]+)/.exec(pathnameOf(url) ?? "");
  return match ? match[1] : undefined;
}

/**
 * @param {RedditPost | undefined} media
 */
function isStreamablePost(media) {
  return isStreamableHost(
    hostnameOf(media?.url_overridden_by_dest ?? media?.url),
  );
}

/**
 * Extract the Streamable id from a watch/embed URL (`/<id>`, `/e/<id>`, `/o/<id>`).
 * @param {string | undefined} url
 * @returns {string | undefined}
 */
export function streamableId(url) {
  const match = /^\/(?:[eo]\/)?([A-Za-z0-9]+)\/?$/.exec(pathnameOf(url) ?? "");
  return match ? match[1] : undefined;
}

/**
 * Resolve a relative listing permalink against the page's origin, pinned to
 * reddit. The resolved URL feeds "open original" and the byline author link, so
 * a permalink that resolves off `*.reddit.com` (or won't parse) is dropped -
 * closing both sinks rather than navigating off-site. Defense-in-depth: reddit
 * listing permalinks are relative paths, so this only bites spoofed data.
 * @param {string | undefined} permalink
 * @param {string} origin
 */
function absolutePermalink(permalink, origin) {
  if (!permalink) return undefined;
  let resolved;
  try {
    resolved = new URL(permalink, origin);
  } catch {
    return undefined;
  }
  const host = resolved.hostname;
  if (host !== "reddit.com" && !host.endsWith(".reddit.com")) return undefined;
  return resolved.toString();
}

/**
 * @param {string} url
 * @returns {string | undefined}
 */
function mimeTypeFromUrl(url) {
  const pathname = (pathnameOf(url) ?? "").toLowerCase();
  if (pathname.endsWith(".avif")) return "image/avif";
  if (pathname.endsWith(".gif")) return "image/gif";
  if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (pathname.endsWith(".png")) return "image/png";
  if (pathname.endsWith(".webp")) return "image/webp";
  return undefined;
}

// Title length in the download name: enough to identify the post, short
// enough that the whole name stays well under any filesystem limit.
const FILENAME_TITLE_MAX = 60;

/**
 * Download name: `rss-{title}-{gallery position}-{post id}.{ext}`. The rss-
 * prefix groups the files when a downloads folder is sorted by name; the
 * post id (fullname minus its `t3_` type tag) keeps names unique across
 * posts with identical titles.
 * @param {RedditPost} context
 * @param {string} url
 * @param {{ index?: number, extension?: string }} [options]
 */
function filenameHint(context, url, options = {}) {
  const extension =
    options.extension ?? ((pathnameOf(url) ?? "").split(".").pop() || "jpg");
  let slug = (context.title ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length > FILENAME_TITLE_MAX) {
    // Cut at a word boundary rather than mid-word; hard-cap an unbroken word.
    const cut = slug.slice(0, FILENAME_TITLE_MAX + 1).replace(/-[^-]*$/, "");
    slug =
      cut.length > FILENAME_TITLE_MAX ? slug.slice(0, FILENAME_TITLE_MAX) : cut;
  }
  const position =
    typeof options.index === "number" ? String(options.index + 1) : "";
  const id = (context.name ?? "").replace(/^t\d+_/, "");
  const base = ["rss", slug, position, id].filter(Boolean).join("-");
  return `${base}.${extension}`;
}

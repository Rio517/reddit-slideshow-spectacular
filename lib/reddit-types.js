/**
 * Narrow JSDoc types for the subset of Reddit listing JSON (raw_json=1) this
 * extension actually reads - not the full Reddit schema. Almost everything is
 * optional: posts vary by kind (image/gallery/video/redgifs/crosspost) and the
 * resolvers probe defensively, so a too-strict shape would fight the `?.` guards.
 *
 * Types-only module: it emits nothing at runtime. Consume with the TS 5.5
 * `@import` tag, e.g. `@import { RedditPost } from "./reddit-types.js"`.
 *
 * @typedef {object} RedditListing
 * @property {{ children?: RedditChild[], after?: string | null, before?: string | null }} [data]
 *
 * @typedef {object} RedditChild
 * @property {string} [kind] e.g. "t3".
 * @property {RedditPost} [data]
 *
 * @typedef {object} RedditPost
 * @property {string} [name] Fullname, e.g. "t3_abc".
 * @property {string} [title]
 * @property {string} [author]
 * @property {string} [subreddit] Subreddit name, no "r/" prefix.
 * @property {boolean | null} [likes] Current vote: true up, false down, null none.
 * @property {string} [permalink] Relative path.
 * @property {boolean} [over_18]
 * @property {string} [url]
 * @property {string} [url_overridden_by_dest]
 * @property {string} [post_hint] e.g. "image", "hosted:video".
 * @property {boolean} [is_gallery]
 * @property {RedditGalleryData} [gallery_data]
 * @property {Record<string, RedditMediaMetaEntry>} [media_metadata]
 * @property {RedditMedia} [media]
 * @property {RedditMedia} [secure_media]
 * @property {RedditPreview} [preview]
 * @property {RedditPost[]} [crosspost_parent_list]
 *
 * @typedef {object} RedditGalleryData
 * @property {RedditGalleryItem[]} [items]
 *
 * @typedef {object} RedditGalleryItem
 * @property {string} [media_id]
 * @property {boolean} [is_deleted]
 *
 * @typedef {object} RedditMediaMetaEntry
 * @property {string} [status] "valid" when usable.
 * @property {string} [e] Member kind, e.g. "Image", "AnimatedImage".
 * @property {string} [m] Member mime type, e.g. "image/gif".
 * @property {{ u?: string, gif?: string, mp4?: string, x?: number, y?: number }} [s]
 *   Source media. A still carries `u`; an animated member carries `gif` and
 *   reddit's `mp4` transcode of it instead.
 * @property {Array<{ u?: string }>} [p] Preview ladder, smallest first.
 *
 * @typedef {object} RedditMedia
 * @property {string} [type] e.g. "redgifs.com".
 * @property {RedditVideo} [reddit_video]
 * @property {{ width?: number, height?: number }} [oembed]
 *
 * @typedef {object} RedditVideo
 * @property {string} [fallback_url]
 * @property {string} [dash_url]
 * @property {string} [hls_url]
 * @property {number} [duration]
 * @property {number} [width]
 * @property {number} [height]
 * @property {boolean} [is_gif]
 * @property {boolean} [has_audio]
 *
 * @typedef {object} RedditPreview
 * @property {RedditPreviewImage[]} [images]
 *
 * @typedef {object} RedditPreviewImage
 * @property {RedditPreviewSize} [source]
 * @property {RedditPreviewSize[]} [resolutions]
 * @property {Record<string, { source?: RedditPreviewSize, resolutions?: RedditPreviewSize[] }>} [variants]
 *   Alternate encodings of the same image, keyed by format ("gif", "mp4",
 *   "obfuscated", "nsfw"). A gif post carries reddit's mp4 transcode here.
 *
 * @typedef {object} RedditPreviewSize
 * @property {string} [url]
 * @property {number} [width]
 * @property {number} [height]
 */

export {};

// New Reddit listing-partial markup for listing-JSON posts, in the shape
// lib/reddit-www-listing.js parses: a `shreddit-post` per post, its media as
// the feed renders it, and a more-posts partial carrying the next cursor.

/** @param {unknown} value */
const esc = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

/** @param {any} post A listing child's `data`. */
function mediaHtml(post) {
  if (post.is_gallery) {
    const pages = post.gallery_data.items.map(
      (/** @type {any} */ item, /** @type {number} */ i) => {
        const m = post.media_metadata[item.media_id];
        const shown = esc(m.p[0].u);
        // Later pages load their image lazily.
        const src = i === 0 ? `src="${shown}"` : `data-lazy-src="${shown}"`;
        return (
          `<li slot="page-${i + 1}"><img class="absolute post-background-image-filter" ${src} width="${m.s.x}" height="${m.s.y}">` +
          `<figure><img class="non-lightboxed-content media-lightbox-img" ${src} width="${m.s.x}" height="${m.s.y}">` +
          `<div class="lightboxed-content hidden"><zoomable-img><img class="media-lightbox-img" src="${esc(m.s.u)}"></zoomable-img></div></figure></li>`
        );
      },
    );
    return `<gallery-carousel post-id="${post.name}">${pages.join("")}</gallery-carousel>`;
  }
  const video = post.secure_media?.reddit_video;
  if (video) {
    return `<shreddit-player src="${esc(video.hls_url)}" packaged-media-json="{&quot;playbackMp4s&quot;:{}}" post-type="video"></shreddit-player>`;
  }
  const mp4 = post.preview?.images?.[0]?.variants?.mp4?.source;
  if (mp4) {
    return `<video width="${mp4.width}" height="${mp4.height}"><source src="${esc(mp4.url)}" type="video/mp4"></video>`;
  }
  const shown = post.preview?.images?.[0]?.resolutions?.[0];
  if (shown) {
    return `<img data-post-media-primary src="${esc(shown.url)}" srcset="${esc(shown.url)} 640w" width="${shown.width}" height="${shown.height}">`;
  }
  return "";
}

/** @param {any} post */
function postType(post) {
  if (post.is_gallery) return "gallery";
  if (post.secure_media?.reddit_video) {
    return post.secure_media.reddit_video.is_gif ? "gif" : "video";
  }
  if (post.preview?.images?.[0]?.variants?.mp4) return "gif";
  return post.preview ? "image" : "link";
}

/** @param {any} post A listing child's `data`. */
export function wwwPostHtml(post) {
  const nsfw = post.over_18 ? "true" : "false";
  return (
    `<shreddit-post data-ks-item class="block [&amp;:not(:defined)]:pb-2xl" permalink="${esc(post.permalink)}" content-href="${esc(post.url)}" id="${post.name}" post-title="${esc(post.title)}" post-type="${postType(post)}" score="${post.score ?? 1}" upvote-ratio="1" author="${esc(post.author)}" subreddit-name="${esc(post.subreddit)}">` +
    `<shreddit-post-flair class="x"></shreddit-post-flair><shreddit-post-overflow-menu></shreddit-post-overflow-menu>` +
    `<shreddit-media-lightbox-listener post-id="${post.name}" telemetry="{&quot;post&quot;:{&quot;id&quot;:&quot;${post.name}&quot;,&quot;nsfw&quot;:${nsfw},&quot;promoted&quot;:${Boolean(post.promoted)}},&quot;subreddit&quot;:{&quot;nsfw&quot;:false}}">` +
    `${mediaHtml(post)}</shreddit-media-lightbox-listener></shreddit-post>`
  );
}

/** An ad as the feed renders it: its own element, never a `shreddit-post`. */
export const WWW_AD_HTML =
  '<shreddit-ad-post id="t3_ad" post-title="Buy it"><img data-post-media-primary src="https://example.com/ad.jpg" width="10" height="10"></shreddit-ad-post>';

/**
 * @param {any} listing A listing JSON (`{ data: { children, after } }`).
 * @param {{ ads?: boolean }} [options]
 */
export function wwwListingHtml(listing, options = {}) {
  const posts = listing.data.children.map((/** @type {any} */ c) =>
    wwwPostHtml(c.data),
  );
  if (options.ads) posts.splice(1, 0, WWW_AD_HTML);
  const after = listing.data.after;
  const next = after
    ? `<faceplate-partial slot="load-after" src="/svc/shreddit/community-more-posts/new/?after=${encodeURIComponent(btoa(after))}&amp;t=DAY&amp;name=aww&amp;feedLength=25" loading="programmatic"></faceplate-partial>`
    : "";
  return `${posts.join("")}${next}`;
}

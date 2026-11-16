import { attr, decodeEntities } from "./html-attrs.js";

/**
 * Fetch one page of a www subreddit feed from new Reddit's listing partial.
 * Throws on a non-ok response or the login wall; the caller falls back to old
 * Reddit.
 *
 * @param {string} url From `toWwwListingUrl`.
 * @param {typeof fetch} fetchImpl
 */
export async function fetchWwwListing(url, fetchImpl) {
  const response = await fetchImpl(url, { credentials: "include" });
  if (!response.ok)
    throw new Error(`New Reddit listing: HTTP ${response.status}`);
  if (new URL(response.url || url).pathname.startsWith("/login")) {
    throw new Error("New Reddit listing: login wall");
  }
  return parseWwwListingHtml(await response.text());
}

/**
 * The posts (in page order, ads skipped) and next-page cursor of a new Reddit
 * listing partial, each post in the listing JSON shape `lib/slides.js` reads.
 * The page is split into posts before any per-post regex runs: it is over 1 MB.
 *
 * @param {string} html
 * @returns {{ children: Array<{ kind: "t3", data: import("./reddit-types.js").RedditPost }>, after: string | null }}
 */
export function parseWwwListingHtml(html) {
  const children = [];
  // `<shreddit-post-flair` and the like share the prefix; the space does not.
  for (const raw of html.split(/(?=<shreddit-post\s)/)) {
    if (!raw.startsWith("<shreddit-post ")) continue;
    const end = raw.search(/<shreddit-ad-post\b/);
    const chunk = end < 0 ? raw : raw.slice(0, end);
    const tag = chunk.slice(0, chunk.indexOf(">"));
    if (/&quot;promoted&quot;:true/.test(chunk) || /\spromoted[\s=>]/.test(tag))
      continue;
    const post = postFromElement(tag, chunk);
    if (post.name?.startsWith("t3_"))
      children.push({ kind: /** @type {const} */ ("t3"), data: post });
  }

  const next = /\ssrc="(\/svc\/shreddit\/community-more-posts\/[^"]*)"/.exec(
    html,
  )?.[1];
  const cursor = next
    ? new URL(decodeEntities(next), "https://www.reddit.com").searchParams.get(
        "after",
      )
    : null;
  return { children, after: cursor ? fullnameFromCursor(cursor) : null };
}

/** @param {string} cursor Base64 of a t3 fullname, padding optional. */
function fullnameFromCursor(cursor) {
  try {
    const name = atob(cursor);
    return /^t3_[a-z0-9]+$/.test(name) ? name : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} tag The `shreddit-post` opening tag.
 * @param {string} chunk The element's markup.
 * @returns {import("./reddit-types.js").RedditPost}
 */
function postFromElement(tag, chunk) {
  // The feed markup carries no vote state or hidden-score marker: its action
  // bar loads later. The post's own flag is in the lightbox telemetry JSON.
  /** @type {import("./reddit-types.js").RedditPost} */
  const post = {
    name: attr(tag, "id"),
    title: attr(tag, "post-title") ?? "",
    author: attr(tag, "author"),
    subreddit: attr(tag, "subreddit-name"),
    permalink: attr(tag, "permalink"),
    url: attr(tag, "content-href"),
    over_18: /&quot;nsfw&quot;:true/.test(chunk) || /\snsfw[\s=>]/.test(tag),
    score: Number(attr(tag, "score")) || 0,
    hide_score: false,
    likes: null,
  };
  const type = attr(tag, "post-type");

  if (type === "gallery") {
    const items = [];
    /** @type {Record<string, import("./reddit-types.js").RedditMediaMetaEntry>} */
    const meta = {};
    const carousel = /<gallery-carousel[\s\S]*?<\/gallery-carousel>/.exec(
      chunk,
    )?.[0];
    for (const page of (carousel ?? "").split(/(?=<li slot="page-)/)) {
      if (!page.startsWith('<li slot="page-')) continue;
      const full = /<img[^>]*\ssrc="(https:\/\/i\.redd\.it\/[^"]+)"/.exec(
        page,
      )?.[1];
      const shown = /<img class="non-lightboxed[^>]*>/.exec(page)?.[0];
      const id = full && /\/([a-z0-9]+)\.[a-z]+$/i.exec(full)?.[1];
      if (!full || !shown || !id) continue;
      const u = decodeEntities(full);
      // The carousel image's own size is the source's; its URL is a resize.
      meta[id] = {
        status: "valid",
        s: {
          u,
          x: Number(attr(shown, "width")) || undefined,
          y: Number(attr(shown, "height")) || undefined,
        },
        p: [{ u: attr(shown, "src") ?? attr(shown, "data-lazy-src") }],
      };
      items.push({ media_id: id });
    }
    if (items.length > 0) {
      post.is_gallery = true;
      post.gallery_data = { items };
      post.media_metadata = meta;
    }
    return post;
  }

  // Only a video's own player: a later sibling post's can trail in the chunk.
  const player =
    (type === "video" || type === "gif") &&
    /<shreddit-player\s[^>]*>/.exec(chunk)?.[0];
  const hls = player && attr(player, "src");
  if (hls && hostOf(hls) === "v.redd.it") {
    post.secure_media = {
      reddit_video: {
        // The manifest sits beside the playlist, and needs no signature.
        dash_url: new URL("DASHPlaylist.mpd", hls).href,
        hls_url: hls,
        is_gif: type === "gif",
      },
    };
    return post;
  }

  if (type === "gif") {
    // A gif post plays Reddit's mp4 transcode of it, sized on its `<video>`.
    for (const [tagText] of chunk.matchAll(/<source\s[^>]*>/g)) {
      const src = attr(tagText, "src");
      if (!src || attr(tagText, "type") !== "video/mp4") continue;
      const video = /<video\s[^>]*>/.exec(chunk)?.[0] ?? "";
      const size = (/** @type {string} */ name) =>
        Number(attr(video, name) ?? attr(tagText, name)) || undefined;
      post.preview = {
        images: [
          {
            variants: {
              mp4: {
                source: {
                  url: src,
                  width: size("width"),
                  height: size("height"),
                },
              },
            },
          },
        ],
      };
      break;
    }
    return post;
  }

  if (type === "image") {
    const img = /<img\s[^>]*\bdata-post-media-primary[^>]*>/.exec(chunk)?.[0];
    const src = img && attr(img, "src");
    const width = Number(img && attr(img, "width"));
    const height = Number(img && attr(img, "height"));
    if (src && width && height) {
      post.preview = {
        images: [{ resolutions: [{ url: src, width, height }] }],
      };
    }
  }
  return post;
}

/** @param {string} url */
function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

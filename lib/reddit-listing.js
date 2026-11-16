import { toListingHtmlUrl, toWwwListingUrl } from "./reddit-url.js";
import { attr, decodeEntities } from "./html-attrs.js";
import { fetchWwwListing } from "./reddit-www-listing.js";
import { createLogger } from "./log.js";
import { mapLimit } from "./async-pool.js";
import { audioUrlFromDash } from "./reddit-audio.js";

// Media CDN requests (DASH manifests, image headers) in flight per page.
const MEDIA_FETCH_CONCURRENCY = 6;
// Enough of an image to reach its size header, past a JPEG's metadata.
const IMAGE_HEAD_BYTES = 65536;

export class RedditListingFetchError extends Error {
  /**
   * @param {string} message
   * @param {{ jsonUrl: string, status?: number, statusText?: string }} options
   */
  constructor(message, options) {
    super(message);
    this.name = "RedditListingFetchError";
    this.jsonUrl = options.jsonUrl;
    this.status = options.status;
    this.statusText = options.statusText;
  }
}

const log = createLogger("listing");

/**
 * Fetch one listing page as listing-shaped JSON, with the browser session.
 *
 * Reddit 403s listing `.json` (and `/api/info`), even logged in, and rate
 * limits each post's own `.json` to about 100 a window. So a www subreddit
 * feed is read from new Reddit's own pages, and anything else, or a www read
 * that fails, from the old Reddit HTML page, which carries each post's media in
 * its expando. Either way the page is completed from the media CDNs: a video's
 * DASH manifest, an image's size header. Only a post whose page lacks its media
 * costs a post `.json`.
 *
 * @param {string} pageUrl
 * @param {{ after?: string }} [options]
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<{ listing: any }>}
 */
export async function fetchListingJson(
  pageUrl,
  options = {},
  fetchImpl = fetch,
) {
  const wwwUrl = toWwwListingUrl(pageUrl, options);
  if (wwwUrl) {
    try {
      const page = await fetchWwwListing(wwwUrl, fetchImpl);
      if (page.children.length > 0) {
        return await completeListing(page, fetchImpl);
      }
      log.warn("new Reddit returned no posts; using old Reddit");
    } catch (error) {
      log.warn("new Reddit listing failed; using old Reddit", error);
    }
  }
  return fetchOldListing(pageUrl, options, fetchImpl);
}

/**
 * @param {string} pageUrl
 * @param {{ after?: string }} options
 * @param {typeof fetch} fetchImpl
 */
async function fetchOldListing(pageUrl, options, fetchImpl) {
  const htmlUrl = toListingHtmlUrl(pageUrl, options);
  const response = await fetchImpl(htmlUrl, { credentials: "include" });
  if (!response.ok) {
    throw new RedditListingFetchError(
      `Reddit listing fetch failed with HTTP ${response.status}`,
      {
        jsonUrl: htmlUrl,
        status: response.status,
        statusText: response.statusText,
      },
    );
  }
  // Logged out, old Reddit redirects every page to its login wall.
  if (new URL(response.url || htmlUrl).pathname.startsWith("/login")) {
    throw new RedditListingFetchError("Log in to Reddit to load this listing", {
      jsonUrl: htmlUrl,
      status: 401,
    });
  }
  return completeListing(parseListingHtml(await response.text()), fetchImpl);
}

/**
 * @param {{ children: Array<{ kind: "t3", data: import("./reddit-types.js").RedditPost }>, after: string | null }} page
 * @param {typeof fetch} fetchImpl
 */
async function completeListing({ children, after }, fetchImpl) {
  await mapLimit(children, MEDIA_FETCH_CONCURRENCY, async (child, i) => {
    children[i] = await completePost(child, fetchImpl).catch(() => child);
  });
  return { listing: { kind: "Listing", data: { children, after } } };
}

/**
 * The posts (in page order, ads skipped) and next-page cursor of an old Reddit
 * listing page, each post in the listing JSON shape `lib/slides.js` reads.
 *
 * @param {string} html
 * @returns {{ children: Array<{ kind: "t3", data: import("./reddit-types.js").RedditPost }>, after: string | null }}
 */
export function parseListingHtml(html) {
  const children = [];
  for (const chunk of html.split(/(?=<div class=" thing )/)) {
    if (!chunk.startsWith(`<div class=" thing `)) continue;
    const tag = chunk.slice(0, chunk.indexOf(">"));
    if (attr(tag, "data-type") !== "link") continue;
    if (attr(tag, "data-promoted") === "true") continue;
    const post = postFromThing(tag, chunk);
    if (post.name)
      children.push({ kind: /** @type {const} */ ("t3"), data: post });
  }
  const next = /<span class="next-button"><a href="([^"]+)"/.exec(html)?.[1];
  const after = next
    ? new URL(decodeEntities(next)).searchParams.get("after")
    : null;
  return { children, after };
}

/**
 * @param {string} tag The thing's opening tag.
 * @param {string} chunk The thing's markup through to the next thing.
 * @returns {import("./reddit-types.js").RedditPost}
 */
function postFromThing(tag, chunk) {
  const midcol = /<div class="midcol (likes|dislikes|unvoted)"/.exec(
    chunk,
  )?.[1];
  /** @type {import("./reddit-types.js").RedditPost} */
  const post = {
    name: attr(tag, "data-fullname"),
    title: decodeEntities(
      /<a class="title [^>]*>([^<]*)</.exec(chunk)?.[1] ?? "",
    ),
    author: attr(tag, "data-author"),
    subreddit: attr(tag, "data-subreddit"),
    permalink: attr(tag, "data-permalink"),
    url: attr(tag, "data-url"),
    over_18: attr(tag, "data-nsfw") === "true",
    score: Number(attr(tag, "data-score")) || 0,
    hide_score: /<div class="score unvoted">&bull;</.test(chunk),
    likes: midcol === "likes" ? true : midcol === "dislikes" ? false : null,
  };

  // The expando's markup, entity-encoded into an attribute.
  const expando = decodeEntities(
    /data-cachedhtml="([^"]*)"/.exec(chunk)?.[1] ?? "",
  );
  if (attr(tag, "data-is-gallery") === "true") {
    const items = [];
    /** @type {Record<string, import("./reddit-types.js").RedditMediaMetaEntry>} */
    const meta = {};
    for (const [, id, full, shown, w, h] of expando.matchAll(
      /id="gallery-preview-[a-z0-9]+-([a-z0-9]+)"[\s\S]*?href="([^"]+)"[^>]*>\s*<img class="preview" src="([^"]+)" width="(\d+)" height="(\d+)"/g,
    )) {
      const u = decodeEntities(full);
      // The full-size link asks for the source width; the shown size its shape.
      const x = Number(new URL(u).searchParams.get("width")) || Number(w);
      const p = [{ u: decodeEntities(shown) }];
      meta[id] = {
        status: "valid",
        s: { u, x, y: Math.round((x * Number(h)) / Number(w)) },
        p,
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

  const dash = /data-mpd-url="([^"]+)"/.exec(expando)?.[1];
  if (dash) {
    post.secure_media = {
      reddit_video: {
        dash_url: decodeEntities(dash),
        hls_url: decodeEntities(
          /data-hls-url="([^"]+)"/.exec(expando)?.[1] ?? "",
        ),
        is_gif: /data-is-gif="true"/.test(expando),
      },
    };
    return post;
  }

  // A gif post's expando plays Reddit's mp4 transcode of it.
  const mp4 = /<source src="([^"]+)" type="video\/mp4"/.exec(expando)?.[1];
  if (mp4) {
    const box = /width: (\d+)px; height: (\d+)px/.exec(expando);
    post.preview = {
      images: [
        {
          variants: {
            mp4: {
              source: {
                url: decodeEntities(mp4),
                width: Number(box?.[1]) || undefined,
                height: Number(box?.[2]) || undefined,
              },
            },
          },
        },
      ],
    };
    return post;
  }

  const preview =
    /<img class="preview" src="([^"]+)" width="(\d+)" height="(\d+)"/.exec(
      expando,
    );
  if (preview) {
    const [, url, width, height] = preview;
    post.preview = {
      images: [
        {
          resolutions: [
            {
              url: decodeEntities(url),
              width: Number(width),
              height: Number(height),
            },
          ],
        },
      ],
    };
  }
  return post;
}

/**
 * Fill in what the page leaves out: a video's playable mp4, size, duration and
 * audio from its DASH manifest; an i.redd.it image's size from its header; the
 * whole post from its `.json` when the page left its media out.
 *
 * @param {{ kind: "t3", data: import("./reddit-types.js").RedditPost }} child
 * @param {typeof fetch} fetchImpl
 */
async function completePost(child, fetchImpl) {
  const post = child.data;
  const url = post.url ?? "";
  const host = hostOf(url);
  const isGif = /\.gif$/i.test(new URL(url, "https://old.reddit.com").pathname);
  const pageMissedMedia =
    (host === "v.redd.it" && !post.secure_media) ||
    (url.includes("/gallery/") && !post.gallery_data) ||
    (isGif && !post.preview);
  if (pageMissedMedia) {
    return fetchPost(String(post.name).replace(/^t3_/, ""), fetchImpl);
  }

  const video = post.secure_media?.reddit_video;
  if (video?.dash_url) {
    Object.assign(video, await videoFromDash(video.dash_url, fetchImpl));
  } else if (host === "i.redd.it" && post.preview?.images?.[0]?.resolutions) {
    const image = post.preview.images[0];
    const shown = image.resolutions?.[0];
    const size = await imageSize(url, fetchImpl);
    if (size) {
      // A JPEG's header can be stored sideways; the page's preview is upright.
      const sideways =
        shown?.width &&
        shown.height &&
        shown.width !== shown.height &&
        size.width > size.height !== shown.width > shown.height;
      image.source = sideways
        ? { url, width: size.height, height: size.width }
        : { url, ...size };
    }
  }
  return child;
}

/**
 * The best video rendition, duration and audio presence of a v.redd.it DASH
 * manifest, as the `reddit_video` fields `lib/slides.js` reads.
 *
 * @param {string} dashUrl
 * @param {typeof fetch} fetchImpl
 */
export async function videoFromDash(dashUrl, fetchImpl) {
  const response = await fetchImpl(dashUrl);
  if (!response.ok) throw new Error(`DASH manifest: HTTP ${response.status}`);
  const mpd = await response.text();
  let best = { base: "", width: 0, height: 0 };
  // Video renditions carry a height; the audio rendition doesn't.
  for (const [, attrs, base] of mpd.matchAll(
    /<Representation([^>]*\bheight="\d+"[^>]*)>\s*<BaseURL>\s*([^<\s]+)\s*<\/BaseURL>/g,
  )) {
    const height = Number(/\bheight="(\d+)"/.exec(attrs)?.[1]);
    if (height > best.height) {
      best = {
        base,
        width: Number(/\bwidth="(\d+)"/.exec(attrs)?.[1]),
        height,
      };
    }
  }
  const fallback = best.base ? new URL(best.base, dashUrl) : null;
  // The manifest is third-party content: play only from its own host.
  if (!fallback || fallback.host !== new URL(dashUrl).host) return {};
  const [, h = 0, m = 0, s = 0] =
    /PT(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?/.exec(
      /mediaPresentationDuration="([^"]+)"/.exec(mpd)?.[1] ?? "",
    ) ?? [];
  return {
    fallback_url: fallback.href,
    width: best.width,
    height: best.height,
    duration: Math.round(Number(h) * 3600 + Number(m) * 60 + Number(s)),
    has_audio: audioUrlFromDash(mpd, dashUrl) !== null,
  };
}

/**
 * An image's pixel size from the first bytes of the file (a Range request).
 *
 * @param {string} url
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<{ width: number, height: number } | null>}
 */
async function imageSize(url, fetchImpl) {
  const response = await fetchImpl(url, {
    headers: { range: `bytes=0-${IMAGE_HEAD_BYTES - 1}` },
  });
  // A server that ignores the range would send the whole file.
  if (response.status !== 206) {
    await response.body?.cancel();
    return null;
  }
  return imageSizeFromBytes(new Uint8Array(await response.arrayBuffer()));
}

/**
 * Width and height from a PNG or JPEG header; null for anything else.
 *
 * @param {Uint8Array} b
 * @returns {{ width: number, height: number } | null}
 */
export function imageSizeFromBytes(b) {
  const u16 = (/** @type {number} */ i) => (b[i] << 8) | b[i + 1];
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return { width: u16(18), height: u16(22) };
  }
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  for (let i = 2; i + 8 < b.length; ) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    // Start-of-frame markers, minus the DHT/JPG/DAC tables that share the range.
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      ![0xc4, 0xc8, 0xcc].includes(marker)
    ) {
      return { width: u16(i + 7), height: u16(i + 5) };
    }
    i += 2 + u16(i + 2);
  }
  return null;
}

/**
 * One post's listing child (`{ kind: "t3", data }`) from its own `.json`.
 *
 * @param {string} id
 * @param {typeof fetch} fetchImpl
 */
async function fetchPost(id, fetchImpl) {
  const url = `https://old.reddit.com/comments/${id}/.json?raw_json=1&limit=1&depth=1`;
  const response = await fetchImpl(url, {
    credentials: "include",
    headers: { accept: "application/json" },
  });
  // Fail closed on anything but JSON from the cookie-bearing request.
  const type = response.headers.get("content-type") ?? "";
  if (!response.ok || !type.includes("application/json")) {
    throw new RedditListingFetchError(`Post ${id}: HTTP ${response.status}`, {
      jsonUrl: url,
      status: response.status,
    });
  }
  const post = (await response.json())?.[0]?.data?.children?.[0];
  if (post?.kind !== "t3") throw new Error(`Post ${id}: not a post`);
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

import { describe, expect, it } from "vitest";
import {
  fetchListingJson,
  imageSizeFromBytes,
  parseListingHtml,
  videoFromDash,
} from "../../lib/reddit-listing.js";

// Markup trimmed from a real old Reddit listing page (names changed). The
// expando is entity-encoded into `data-cachedhtml`, so its URLs' `&` arrive as
// `&amp;amp;`.
/**
 * @param {string} id
 * @param {{ url: string, expando?: string, gallery?: boolean, promoted?: boolean, extra?: string, midcol?: string }} o
 */
const thing = (id, o) =>
  `<div class=" thing id-t3_${id} link " id="thing_t3_${id}" data-fullname="t3_${id}" data-type="link" data-is-gallery="${Boolean(o.gallery)}" data-author="poster_${id}" data-subreddit="aww" data-url="${o.url}" data-permalink="/r/aww/comments/${id}/x/" data-score="50" data-promoted="${Boolean(o.promoted)}" data-nsfw="false" ${o.extra ?? ""}>` +
  `<div class="midcol ${o.midcol ?? "unvoted"}" ><div class="score unvoted" title="50">50</div></div>` +
  `<a class="title may-blank " href="${o.url}" >Title of ${id} &amp; friends &#32;&#x1F431;</a>` +
  `<div class="expando expando-uninitialized" style='display: none' data-cachedhtml="${o.expando ?? ""}"></div></div>`;

const IMAGE = thing("img", {
  url: "https://i.redd.it/img.jpeg",
  midcol: "likes",
  expando:
    " &lt;div class=&quot;media-preview&quot;&gt; &lt;img class=&quot;preview&quot; src=&quot;https://preview.redd.it/img.jpeg?width=576&amp;amp;auto=webp&amp;amp;s=sig&quot; width=&quot;576&quot; height=&quot;768&quot;&gt; &lt;/div&gt; ",
});
const VIDEO = thing("vid", {
  url: "https://v.redd.it/vid",
  expando:
    " &lt;div id=&quot;video-vid&quot; data-hls-url=&quot;https://v.redd.it/vid/HLSPlaylist.m3u8?a=1%2Cx&amp;amp;v=1&quot; data-mpd-url=&quot;https://v.redd.it/vid/DASHPlaylist.mpd?a=1%2Cx&amp;amp;v=1&quot; data-is-gif=&quot;false&quot; &gt;&lt;/div&gt; ",
});
const GALLERY = thing("gal", {
  url: "https://www.reddit.com/gallery/gal",
  gallery: true,
  expando: ["m1", "m2"]
    .map(
      (m) =>
        ` &lt;div class=&quot;gallery-preview&quot; id=&quot;gallery-preview-gal-${m}&quot;&gt; &lt;a class=&quot;may-blank gallery-item-thumbnail-link&quot; data-position=&quot;1&quot; href=&quot;https://preview.redd.it/${m}.jpeg?width=3000&amp;amp;format=pjpg&amp;amp;s=a&quot; target=&quot;_blank&quot;&gt; &lt;img class=&quot;preview&quot; src=&quot;https://preview.redd.it/${m}.jpeg?width=640&amp;amp;s=b&quot; width=&quot;768&quot; height=&quot;512&quot;&gt; &lt;/a&gt; &lt;/div&gt;`,
    )
    .join(""),
});
const GIF = thing("gif", {
  url: "https://i.redd.it/gif.gif",
  expando:
    " &lt;video class=&quot;preview&quot; style=&quot;width: 480px; height: 640px;&quot;&gt; &lt;source src=&quot;https://preview.redd.it/gif.gif?width=480&amp;amp;format=mp4&amp;amp;s=c&quot; type=&quot;video/mp4&quot;&gt; &lt;/video&gt; ",
});
const AD = thing("ad", { url: "https://example.com/", promoted: true });
const NEXT = `<span class="next-button"><a href="https://old.reddit.com/r/aww/new/?count=25&amp;after=t3_gif" rel="nofollow next" >next</a></span>`;
const PAGE = `<div id="siteTable">${IMAGE}${AD}${VIDEO}${GALLERY}${GIF}</div>${NEXT}`;

const MPD = `<MPD mediaPresentationDuration="PT1M4.6S"><Period><AdaptationSet contentType="video">
<Representation bandwidth="1" height="392" id="0" mimeType="video/mp4" width="220"><BaseURL>CMAF_220.mp4</BaseURL></Representation>
<Representation bandwidth="2" height="854" id="1" mimeType="video/mp4" width="480"><BaseURL>CMAF_480.mp4</BaseURL></Representation>
</AdaptationSet><AdaptationSet contentType="audio"><Representation id="2" mimeType="audio/mp4"><BaseURL>CMAF_AUDIO_64.mp4</BaseURL></Representation></AdaptationSet></Period></MPD>`;

// A JPEG whose size (3000 wide, 4000 tall) sits after an APP0 segment.
const JPEG_HEAD = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08,
  0x0f, 0xa0, 0x0b, 0xb8,
]);

/** @param {BodyInit} body @param {ResponseInit & { url?: string }} [init] */
function response(body, init = {}) {
  const res = new Response(body, {
    status: init.status ?? 200,
    headers: init.headers ?? { "content-type": "text/html" },
  });
  if (init.url) Object.defineProperty(res, "url", { value: init.url });
  return res;
}

/** @param {Record<string, () => Response>} routes */
function fakeFetch(routes) {
  /** @type {Array<[string, RequestInit]>} */
  const calls = [];
  /** @type {typeof fetch} */
  const fetchImpl = async (url, init) => {
    calls.push([String(url), init ?? {}]);
    const route = Object.keys(routes).find((k) => String(url).includes(k));
    if (!route) throw new Error(`unexpected ${url}`);
    return routes[route]();
  };
  return { fetchImpl, calls };
}

const cdn = {
  "DASHPlaylist.mpd": () => response(MPD),
  "i.redd.it/img.jpeg": () => response(JPEG_HEAD, { status: 206 }),
};

/** @param {any} listing @param {string} id */
const postOf = (listing, id) =>
  listing.data.children.find((/** @type {any} */ c) => c.data.name === id)
    ?.data;

describe("parseListingHtml", () => {
  const { children, after } = parseListingHtml(PAGE);
  const post = (/** @type {string} */ id) =>
    children.find((c) => c.data.name === id)?.data;

  it("returns the posts in page order, without ads, and the next cursor", () => {
    expect(children.map((c) => c.data.name)).toEqual([
      "t3_img",
      "t3_vid",
      "t3_gal",
      "t3_gif",
    ]);
    expect(after).toBe("t3_gif");
  });

  it("reads a post's byline, score and vote", () => {
    expect(post("t3_img")).toMatchObject({
      title: "Title of img & friends  🐱",
      author: "poster_img",
      subreddit: "aww",
      permalink: "/r/aww/comments/img/x/",
      url: "https://i.redd.it/img.jpeg",
      over_18: false,
      score: 50,
      hide_score: false,
      likes: true,
    });
    expect(post("t3_vid")?.likes).toBeNull();
  });

  it("reads an image's preview", () => {
    expect(post("t3_img")?.preview?.images?.[0]?.resolutions).toEqual([
      {
        url: "https://preview.redd.it/img.jpeg?width=576&auto=webp&s=sig",
        width: 576,
        height: 768,
      },
    ]);
  });

  it("reads a video's stream URLs", () => {
    expect(post("t3_vid")?.secure_media?.reddit_video).toEqual({
      dash_url: "https://v.redd.it/vid/DASHPlaylist.mpd?a=1%2Cx&v=1",
      hls_url: "https://v.redd.it/vid/HLSPlaylist.m3u8?a=1%2Cx&v=1",
      is_gif: false,
    });
  });

  it("reads a gallery's images at source size", () => {
    const gallery = post("t3_gal");
    expect(gallery?.gallery_data?.items).toEqual([
      { media_id: "m1" },
      { media_id: "m2" },
    ]);
    expect(gallery?.media_metadata?.m2).toEqual({
      status: "valid",
      s: {
        u: "https://preview.redd.it/m2.jpeg?width=3000&format=pjpg&s=a",
        x: 3000,
        y: 2000,
      },
      p: [{ u: "https://preview.redd.it/m2.jpeg?width=640&s=b" }],
    });
  });

  it("reads a gif's mp4 transcode", () => {
    expect(post("t3_gif")?.preview?.images?.[0]?.variants?.mp4?.source).toEqual(
      {
        url: "https://preview.redd.it/gif.gif?width=480&format=mp4&s=c",
        width: 480,
        height: 640,
      },
    );
  });

  it("reads a hidden score", () => {
    const hidden = IMAGE.replace(
      '<div class="score unvoted" title="50">50</div>',
      '<div class="score unvoted">&bull;</div>',
    );
    expect(parseListingHtml(hidden).children[0].data.hide_score).toBe(true);
  });

  it("has no cursor on the last page", () => {
    expect(parseListingHtml(IMAGE).after).toBeNull();
  });
});

describe("fetchListingJson", () => {
  it("fetches the old Reddit page once and completes media from the CDNs", async () => {
    const { fetchImpl, calls } = fakeFetch({
      "/r/aww/": () => response(PAGE),
      ...cdn,
    });

    const { listing } = await fetchListingJson(
      "https://www.reddit.com/r/aww/new/",
      { after: "t3_x" },
      fetchImpl,
    );

    expect(calls[0]).toEqual([
      "https://old.reddit.com/r/aww/new/?after=t3_x",
      { credentials: "include" },
    ]);
    expect(calls.filter(([url]) => url.includes("reddit.com/"))).toHaveLength(
      1,
    );
    expect(postOf(listing, "t3_vid").secure_media.reddit_video).toMatchObject({
      fallback_url: "https://v.redd.it/vid/CMAF_480.mp4",
      width: 480,
      height: 854,
      duration: 65,
      has_audio: true,
    });
    expect(postOf(listing, "t3_img").preview.images[0].source).toEqual({
      url: "https://i.redd.it/img.jpeg",
      width: 3000,
      height: 4000,
    });
    const head = calls.find(([url]) => url.includes("img.jpeg"));
    expect(head?.[1]).toEqual({ headers: { range: "bytes=0-65535" } });
    expect(listing.data.after).toBe("t3_gif");
  });

  it("keeps a post as the page described it when its CDN request fails", async () => {
    const { fetchImpl } = fakeFetch({
      "/r/aww/": () => response(IMAGE),
      "i.redd.it": () => response("gone", { status: 404 }),
    });
    const { listing } = await fetchListingJson(
      "https://old.reddit.com/r/aww/",
      {},
      fetchImpl,
    );
    expect(postOf(listing, "t3_img").preview.images[0].source).toBeUndefined();
    expect(postOf(listing, "t3_img").url).toBe("https://i.redd.it/img.jpeg");
  });

  it("falls back to the post's .json when the page lacks its media", async () => {
    const bare = thing("vid", { url: "https://v.redd.it/vid" });
    const json = [
      {
        kind: "Listing",
        data: {
          children: [{ kind: "t3", data: { name: "t3_vid", id: "vid" } }],
        },
      },
    ];
    const { fetchImpl, calls } = fakeFetch({
      "/r/aww/": () => response(bare),
      "/comments/vid/": () =>
        response(JSON.stringify(json), {
          headers: { "content-type": "application/json; charset=UTF-8" },
        }),
    });
    const { listing } = await fetchListingJson(
      "https://old.reddit.com/r/aww/",
      {},
      fetchImpl,
    );
    expect(calls[1]).toEqual([
      "https://old.reddit.com/comments/vid/.json?raw_json=1&limit=1&depth=1",
      { credentials: "include", headers: { accept: "application/json" } },
    ]);
    expect(listing.data.children[0]).toEqual({
      kind: "t3",
      data: { name: "t3_vid", id: "vid" },
    });
  });

  it("throws a typed error for a non-ok page", async () => {
    const { fetchImpl } = fakeFetch({
      "/r/aww/": () => response("blocked", { status: 403 }),
    });
    await expect(
      fetchListingJson("https://old.reddit.com/r/aww/", {}, fetchImpl),
    ).rejects.toMatchObject({ name: "RedditListingFetchError", status: 403 });
  });

  it("names the login wall when logged out", async () => {
    const { fetchImpl } = fakeFetch({
      "/r/aww/": () =>
        response("<html>log in</html>", {
          url: "https://old.reddit.com/login/?reason=lor2",
        }),
    });
    await expect(
      fetchListingJson("https://old.reddit.com/r/aww/", {}, fetchImpl),
    ).rejects.toMatchObject({
      message: "Log in to Reddit to load this listing",
      status: 401,
    });
  });
});

describe("videoFromDash", () => {
  it("refuses a rendition on another host", async () => {
    const offHost = MPD.replace(
      "<BaseURL>CMAF_480.mp4",
      "<BaseURL>https://evil.example/x.mp4",
    );
    const { fetchImpl } = fakeFetch({ mpd: () => response(offHost) });
    expect(
      await videoFromDash("https://v.redd.it/vid/DASHPlaylist.mpd", fetchImpl),
    ).toEqual({});
  });
});

describe("imageSizeFromBytes", () => {
  it("reads a JPEG's frame header", () => {
    expect(imageSizeFromBytes(JPEG_HEAD)).toEqual({
      width: 3000,
      height: 4000,
    });
  });

  it("reads a PNG's header", () => {
    const png = new Uint8Array(24);
    png.set([0x89, 0x50, 0x4e, 0x47], 0);
    png.set([0x00, 0x00, 0x05, 0xdc, 0x00, 0x00, 0x03, 0x20], 16);
    expect(imageSizeFromBytes(png)).toEqual({ width: 1500, height: 800 });
  });

  it("returns null for anything else", () => {
    expect(imageSizeFromBytes(new Uint8Array([0x47, 0x49, 0x46]))).toBeNull();
  });
});

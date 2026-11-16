import { describe, expect, it } from "vitest";
import { fetchListingJson } from "../../lib/reddit-listing.js";
import { parseWwwListingHtml } from "../../lib/reddit-www-listing.js";
import {
  WWW_AD_HTML,
  wwwListingHtml,
} from "../fixtures/www-reddit/listing-html.js";
import { listingHtml } from "../fixtures/old-reddit/listing-html.js";

/** @type {(id: string, extra?: Record<string, any>) => any} */
const post = (id, extra = {}) => ({
  kind: "t3",
  data: {
    name: `t3_${id}`,
    title: `Title of ${id} & "friends"`,
    author: `poster_${id}`,
    subreddit: "aww",
    permalink: `/r/aww/comments/${id}/x/`,
    url: `https://i.redd.it/${id}.jpeg`,
    over_18: false,
    score: 50,
    ...extra,
  },
});

const IMAGE = post("img", {
  preview: {
    images: [
      {
        resolutions: [
          {
            url: "https://cf.preview.redd.it/img.jpeg?width=640&auto=webp&s=sig",
            width: 640,
            height: 853,
          },
        ],
      },
    ],
  },
});
const GALLERY = post("gal", {
  url: "https://www.reddit.com/gallery/gal",
  is_gallery: true,
  gallery_data: { items: [{ media_id: "m1" }, { media_id: "m2" }] },
  media_metadata: Object.fromEntries(
    ["m1", "m2"].map((m, i) => [
      m,
      {
        status: "valid",
        s: { u: `https://i.redd.it/${m}.jpeg`, x: 5712 - i, y: 4284 },
        p: [{ u: `https://cf.preview.redd.it/${m}.jpeg?width=640&s=${m}` }],
      },
    ]),
  ),
});
const VIDEO = post("vid", {
  url: "https://v.redd.it/vid",
  secure_media: {
    reddit_video: {
      dash_url: "",
      hls_url: "https://v.redd.it/vid/HLSPlaylist.m3u8?f=hd%2CsubsAll&v=1",
      is_gif: false,
    },
  },
});
const GIF = post("gif", {
  url: "https://i.redd.it/gif.gif",
  preview: {
    images: [
      {
        variants: {
          mp4: {
            source: {
              url: "https://preview.redd.it/gif.gif?format=mp4&s=c",
              width: 480,
              height: 640,
            },
          },
        },
      },
    ],
  },
});
const NSFW = post("nsfw", { over_18: true, preview: IMAGE.data.preview });

/** @param {any[]} children @param {string | null} [after] */
const listing = (children, after = null) => ({ data: { children, after } });

const PAGE = wwwListingHtml(
  listing([IMAGE, GALLERY, VIDEO, GIF, NSFW], "t3_nsfw"),
  { ads: true },
);

describe("parseWwwListingHtml", () => {
  const { children, after } = parseWwwListingHtml(PAGE);
  const get = (/** @type {string} */ id) =>
    children.find((c) => c.data.name === id)?.data;

  it("returns the posts in page order, without ads, and the next cursor", () => {
    expect(children.map((c) => c.data.name)).toEqual([
      "t3_img",
      "t3_gal",
      "t3_vid",
      "t3_gif",
      "t3_nsfw",
    ]);
    expect(after).toBe("t3_nsfw");
  });

  it("reads a post's byline and score", () => {
    expect(get("t3_img")).toMatchObject({
      title: 'Title of img & "friends"',
      author: "poster_img",
      subreddit: "aww",
      permalink: "/r/aww/comments/img/x/",
      url: "https://i.redd.it/img.jpeg",
      over_18: false,
      score: 50,
    });
  });

  it("reports no vote and no hidden score, which the feed markup lacks", () => {
    expect(get("t3_img")).toMatchObject({ likes: null, hide_score: false });
  });

  it("reads a post's NSFW flag", () => {
    expect(get("t3_nsfw")?.over_18).toBe(true);
    expect(get("t3_img")?.over_18).toBe(false);
  });

  it("reads an image's preview", () => {
    expect(get("t3_img")?.preview?.images?.[0]?.resolutions).toEqual([
      {
        url: "https://cf.preview.redd.it/img.jpeg?width=640&auto=webp&s=sig",
        width: 640,
        height: 853,
      },
    ]);
  });

  it("reads a gallery's images at source size, first page and lazy pages", () => {
    const gallery = get("t3_gal");
    expect(gallery?.is_gallery).toBe(true);
    expect(gallery?.gallery_data?.items).toEqual([
      { media_id: "m1" },
      { media_id: "m2" },
    ]);
    expect(gallery?.media_metadata?.m1).toEqual({
      status: "valid",
      s: { u: "https://i.redd.it/m1.jpeg", x: 5712, y: 4284 },
      p: [{ u: "https://cf.preview.redd.it/m1.jpeg?width=640&s=m1" }],
    });
    expect(gallery?.media_metadata?.m2?.s).toEqual({
      u: "https://i.redd.it/m2.jpeg",
      x: 5711,
      y: 4284,
    });
    expect(gallery?.media_metadata?.m2?.p).toEqual([
      { u: "https://cf.preview.redd.it/m2.jpeg?width=640&s=m2" },
    ]);
  });

  it("reads a video's stream URLs, with an unsigned DASH manifest", () => {
    expect(get("t3_vid")?.secure_media?.reddit_video).toEqual({
      dash_url: "https://v.redd.it/vid/DASHPlaylist.mpd",
      hls_url: "https://v.redd.it/vid/HLSPlaylist.m3u8?f=hd%2CsubsAll&v=1",
      is_gif: false,
    });
  });

  it("marks a v.redd.it gif post as a gif", () => {
    const gifVideo = wwwListingHtml(
      listing([
        {
          ...VIDEO,
          data: {
            ...VIDEO.data,
            name: "t3_gv",
            secure_media: {
              reddit_video: {
                ...VIDEO.data.secure_media.reddit_video,
                is_gif: true,
              },
            },
          },
        },
      ]),
    );
    expect(
      parseWwwListingHtml(gifVideo).children[0].data.secure_media?.reddit_video
        ?.is_gif,
    ).toBe(true);
  });

  it("reads a gif's mp4 transcode", () => {
    expect(get("t3_gif")?.preview?.images?.[0]?.variants?.mp4?.source).toEqual({
      url: "https://preview.redd.it/gif.gif?format=mp4&s=c",
      width: 480,
      height: 640,
    });
  });

  it("does not take a neighbour's media for a post's own", () => {
    // A video post's player trails the markup of the post before it.
    const html =
      wwwListingHtml(listing([IMAGE])) + wwwListingHtml(listing([VIDEO]));
    const [first] = parseWwwListingHtml(html).children;
    expect(first.data.secure_media).toBeUndefined();
  });

  it("skips ads and promoted posts", () => {
    expect(PAGE).toContain(WWW_AD_HTML);
    const promoted = wwwListingHtml(
      listing([{ ...IMAGE, data: { ...IMAGE.data, promoted: true } }]),
    );
    expect(parseWwwListingHtml(promoted).children).toEqual([]);
  });

  it("has no cursor on the last page", () => {
    expect(
      parseWwwListingHtml(wwwListingHtml(listing([IMAGE]))).after,
    ).toBeNull();
  });

  it("round-trips the cursor through base64", () => {
    for (const id of ["t3_1xy18s9", "t3_abc", "t3_1xxhza7x"]) {
      expect(
        parseWwwListingHtml(wwwListingHtml(listing([IMAGE], id))).after,
      ).toBe(id);
    }
  });

  it("reads a cursor without base64 padding", () => {
    const html = `<faceplate-partial src="/svc/shreddit/community-more-posts/new/?after=dDNfMXh4dDRpNw&amp;name=aww"></faceplate-partial>`;
    expect(parseWwwListingHtml(html).after).toBe("t3_1xxt4i7");
  });
});

describe("fetchListingJson on a www subreddit feed", () => {
  const MPD = `<MPD mediaPresentationDuration="PT10S"><Period><AdaptationSet contentType="video">
<Representation bandwidth="2" height="854" id="1" width="480"><BaseURL>CMAF_480.mp4</BaseURL></Representation>
</AdaptationSet></Period></MPD>`;
  const OLD_PAGE = listingHtml(listing([IMAGE], "t3_img"));

  /** @param {Record<string, () => Response | Promise<Response>>} routes */
  function fakeFetch(routes) {
    /** @type {Array<[string, RequestInit | undefined]>} */
    const calls = [];
    /** @type {typeof fetch} */
    const fetchImpl = async (url, init) => {
      calls.push([String(url), init]);
      const key = Object.keys(routes).find((k) => String(url).includes(k));
      if (!key) throw new Error(`unexpected ${url}`);
      return routes[key]();
    };
    return { fetchImpl, calls };
  }
  const html = (/** @type {string} */ body, status = 200) =>
    new Response(body, { status, headers: { "content-type": "text/html" } });
  const oldRequests = (/** @type {Array<[string, any]>} */ calls) =>
    calls.filter(([url]) => url.startsWith("https://old.reddit.com/r/"));

  it("reads new Reddit and never asks old Reddit when it works", async () => {
    const { fetchImpl, calls } = fakeFetch({
      "/svc/shreddit/community-more-posts/new/": () =>
        html(wwwListingHtml(listing([VIDEO, GIF], "t3_gif"))),
      "DASHPlaylist.mpd": () => new Response(MPD),
    });
    const { listing: out } = await fetchListingJson(
      "https://www.reddit.com/r/aww/new/",
      { after: "t3_x" },
      fetchImpl,
    );
    expect(calls[0]).toEqual([
      "https://www.reddit.com/svc/shreddit/community-more-posts/new/?name=aww&after=dDNfeA%3D%3D",
      { credentials: "include" },
    ]);
    expect(oldRequests(calls)).toEqual([]);
    expect(out.data.after).toBe("t3_gif");
    expect(out.data.children[0].data.secure_media.reddit_video).toMatchObject({
      fallback_url: "https://v.redd.it/vid/CMAF_480.mp4",
      height: 854,
    });
  });

  it.each([
    ["throws", () => Promise.reject(new Error("network down"))],
    ["is not ok", () => html("nope", 403)],
    [
      "hits the login wall",
      () => {
        const res = html("login");
        Object.defineProperty(res, "url", {
          value: "https://www.reddit.com/login/",
        });
        return res;
      },
    ],
    ["has no posts", () => html("<div>nothing here</div>")],
  ])(
    "falls back to old Reddit with the same cursor when new Reddit %s",
    async (_name, www) => {
      const { fetchImpl, calls } = fakeFetch({
        "/svc/shreddit/": www,
        "old.reddit.com/r/aww/": () => html(OLD_PAGE),
        "i.redd.it/img.jpeg": () => new Response("", { status: 404 }),
      });
      const { listing: out } = await fetchListingJson(
        "https://www.reddit.com/r/aww/new/",
        { after: "t3_x" },
        fetchImpl,
      );
      expect(oldRequests(calls)).toEqual([
        [
          "https://old.reddit.com/r/aww/new/?after=t3_x",
          { credentials: "include" },
        ],
      ]);
      expect(
        out.data.children.map((/** @type {any} */ c) => c.data.name),
      ).toEqual(["t3_img"]);
    },
  );

  it.each([
    "https://www.reddit.com/r/all/",
    "https://www.reddit.com/r/aww+cats/",
    "https://www.reddit.com/user/someone/",
    "https://www.reddit.com/",
  ])("sends %s straight to old Reddit", async (url) => {
    const { fetchImpl, calls } = fakeFetch({
      "old.reddit.com/": () => html(OLD_PAGE),
      "i.redd.it/img.jpeg": () => new Response("", { status: 404 }),
    });
    await fetchListingJson(url, {}, fetchImpl);
    expect(calls.some(([u]) => u.includes("/svc/shreddit/"))).toBe(false);
    expect(calls[0][0].startsWith("https://old.reddit.com/")).toBe(true);
  });
});

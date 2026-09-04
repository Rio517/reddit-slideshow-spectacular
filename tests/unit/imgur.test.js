import { describe, expect, it, vi } from "vitest";
import {
  createImgurAlbumResolver,
  resolveImgurAlbumSlides,
} from "../../lib/imgur.js";
import albumFixture from "../fixtures/imgur/album-2orxIa1.json";

/** @param {any} body @param {{status?: number}} [opts] */
function jsonResponse(body, { status = 200 } = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const providerFetchOptions = {
  credentials: "omit",
  referrerPolicy: "no-referrer",
};

describe("createImgurAlbumResolver", () => {
  it("parses the ajaxalbums fixture into image descriptors", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(albumFixture));
    const { resolve } = createImgurAlbumResolver({
      fetchImpl: /** @type {any} */ (fetchImpl),
    });
    const images = await resolve("2orxIa1");
    expect(images).toEqual([
      {
        hash: "XV5chUH",
        ext: ".jpg",
        width: 3000,
        height: 4000,
        animated: false,
        hasSound: false,
        looping: false,
      },
      {
        hash: "Rg6ZisF",
        ext: ".jpg",
        width: 3000,
        height: 4000,
        animated: false,
        hasSound: false,
        looping: false,
      },
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://imgur.com/ajaxalbums/getimages/2orxIa1/hit.json",
      providerFetchOptions,
    );
  });

  it("rejects an empty album (data is an array, not an object)", async () => {
    const fetchImpl = async () =>
      jsonResponse({ data: [], success: true, status: 200 });
    const { resolve } = createImgurAlbumResolver({
      fetchImpl: /** @type {any} */ (fetchImpl),
    });
    await expect(resolve("empty")).rejects.toThrow("no usable images");
  });

  it("rejects on a non-OK HTTP response", async () => {
    const fetchImpl = async () => jsonResponse({}, { status: 404 });
    const { resolve } = createImgurAlbumResolver({
      fetchImpl: /** @type {any} */ (fetchImpl),
    });
    await expect(resolve("missing")).rejects.toThrow();
  });

  it("filters malformed entries and rejects when all are filtered", async () => {
    const fetchImpl = async () =>
      jsonResponse({
        data: {
          count: 3,
          images: [
            { hash: "has-hyphen", ext: ".jpg" },
            { hash: "ValidHash", ext: ".webm" }, // unsupported ext, filtered
            { ext: ".png" },
          ],
        },
        success: true,
        status: 200,
      });
    const { resolve } = createImgurAlbumResolver({
      fetchImpl: /** @type {any} */ (fetchImpl),
    });
    await expect(resolve("bad")).rejects.toThrow("no usable images");
  });

  it("keeps the good entry when only some are malformed", async () => {
    const fetchImpl = async () =>
      jsonResponse({
        data: {
          count: 2,
          images: [
            { hash: "GoodOne", ext: ".png", width: 10, height: 20 },
            { hash: "bad-hyphen", ext: ".jpg" },
          ],
        },
        success: true,
        status: 200,
      });
    const { resolve } = createImgurAlbumResolver({
      fetchImpl: /** @type {any} */ (fetchImpl),
    });
    const images = await resolve("mixed");
    expect(images).toEqual([
      {
        hash: "GoodOne",
        ext: ".png",
        width: 10,
        height: 20,
        animated: false,
        hasSound: false,
        looping: false,
      },
    ]);
  });

  it("keeps a .mp4 video entry with its sound/loop flags", async () => {
    const fetchImpl = async () =>
      jsonResponse({
        data: {
          count: 1,
          images: [
            {
              hash: "VidHash",
              ext: ".mp4",
              width: 854,
              height: 480,
              animated: true,
              has_sound: true,
              looping: true,
            },
          ],
        },
        success: true,
        status: 200,
      });
    const { resolve } = createImgurAlbumResolver({
      fetchImpl: /** @type {any} */ (fetchImpl),
    });
    expect(await resolve("vid")).toEqual([
      {
        hash: "VidHash",
        ext: ".mp4",
        width: 854,
        height: 480,
        animated: true,
        hasSound: true,
        looping: true,
      },
    ]);
  });
});

describe("resolveImgurAlbumSlides", () => {
  /** @type {any} */
  const placeholder = {
    id: "t3_alb1:album",
    postId: "t3_alb1",
    provider: "imgur-album",
    kind: "image",
    mediaUrl: "",
    sourceUrl: "https://imgur.com/a/2orxIa1",
    permalink: "https://old.reddit.com/r/example/comments/alb1/imgur_album/",
    title: "Imgur album",
    over18: false,
    durationMode: "timer",
  };

  it("expands a placeholder into numbered image slides", async () => {
    const resolve = async () => [
      {
        hash: "XV5chUH",
        ext: ".jpg",
        width: 3000,
        height: 4000,
        animated: false,
      },
      {
        hash: "Rg6ZisF",
        ext: ".jpg",
        width: 3000,
        height: 4000,
        animated: false,
      },
    ];
    const slides = await resolveImgurAlbumSlides([placeholder], resolve);
    expect(slides).toHaveLength(2);
    expect(slides[0]).toMatchObject({
      provider: "imgur",
      kind: "image",
      mediaUrl: "https://i.imgur.com/XV5chUH.jpg",
      sourceUrl: "https://i.imgur.com/XV5chUH.jpg",
      galleryIndex: 1,
      galleryTotal: 2,
    });
    expect(slides[1]).toMatchObject({
      mediaUrl: "https://i.imgur.com/Rg6ZisF.jpg",
      galleryIndex: 2,
      galleryTotal: 2,
    });
  });

  it("drops the placeholder (returns nothing) when resolution fails", async () => {
    const resolve = async () => {
      throw new Error("boom");
    };
    const slides = await resolveImgurAlbumSlides([placeholder], resolve, {
      timeoutMs: 50,
    });
    expect(slides).toEqual([]);
  });

  it("leaves a non-imgur-album slide untouched", async () => {
    /** @type {any} */
    const other = { provider: "reddit-image", kind: "image" };
    const slides = await resolveImgurAlbumSlides([other], async () => {
      throw new Error("x");
    });
    expect(slides[0]).toBe(other);
  });
});

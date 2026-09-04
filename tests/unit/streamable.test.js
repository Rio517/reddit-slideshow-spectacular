import { describe, expect, it, vi } from "vitest";
import {
  createStreamableResolver,
  resolveStreamableSlides,
  streamableVideoSlide,
} from "../../lib/streamable.js";

/** @param {any} body @param {{status?: number}} [opts] */
function jsonResponse(body, { status = 200 } = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const VIDEO = {
  status: 2,
  files: {
    mp4: {
      url: "https://cdn-cf-east.streamable.com/video/mp4/abc123.mp4?token=x",
      width: 1280,
      height: 720,
      duration: 15.5,
    },
  },
};

const providerFetchOptions = {
  credentials: "omit",
  referrerPolicy: "no-referrer",
};

describe("createStreamableResolver", () => {
  it("resolves the mp4 url, dimensions, and duration from the public API", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(VIDEO));
    const { resolve } = createStreamableResolver({
      fetchImpl: /** @type {any} */ (fetchImpl),
    });
    const media = await resolve("abc123");
    expect(media.mediaUrl).toBe(
      "https://cdn-cf-east.streamable.com/video/mp4/abc123.mp4?token=x",
    );
    expect(media.durationSeconds).toBe(15.5);
    expect(media.sourceWidth).toBe(1280);
    expect(media.sourceHeight).toBe(720);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.streamable.com/videos/abc123",
      providerFetchOptions,
    );
  });

  it("normalizes a protocol-relative mp4 url to https", async () => {
    const fetchImpl = async () =>
      jsonResponse({
        status: 2,
        files: { mp4: { url: "//cdn-b-east.streamable.com/video/mp4/x.mp4" } },
      });
    const { resolve } = createStreamableResolver({
      fetchImpl: /** @type {any} */ (fetchImpl),
    });
    expect((await resolve("x")).mediaUrl).toBe(
      "https://cdn-b-east.streamable.com/video/mp4/x.mp4",
    );
  });

  it("rejects an mp4 url on an unexpected (non-streamable) host", async () => {
    const fetchImpl = async () =>
      jsonResponse({
        status: 2,
        files: { mp4: { url: "https://evil.example/x.mp4" } },
      });
    const { resolve } = createStreamableResolver({
      fetchImpl: /** @type {any} */ (fetchImpl),
    });
    await expect(resolve("x")).rejects.toThrow();
  });

  it("throws when the video is still processing (no mp4 file)", async () => {
    const fetchImpl = async () => jsonResponse({ status: 1, files: {} });
    const { resolve } = createStreamableResolver({
      fetchImpl: /** @type {any} */ (fetchImpl),
    });
    await expect(resolve("x")).rejects.toThrow();
  });

  it("throws on a non-OK API response", async () => {
    const fetchImpl = async () => jsonResponse({}, { status: 404 });
    const { resolve } = createStreamableResolver({
      fetchImpl: /** @type {any} */ (fetchImpl),
    });
    await expect(resolve("missing")).rejects.toThrow();
  });
});

describe("resolveStreamableSlides", () => {
  /** @type {any} */
  const embed = {
    id: "t3_st1:0",
    provider: "streamable",
    kind: "embed",
    embedUrl: "https://streamable.com/e/abc123",
    mediaUrl: "https://streamable.com/e/abc123",
    sourceUrl: "https://streamable.com/abc123",
    durationMode: "timer",
  };

  it("upgrades a streamable embed to a direct (non-proxied) native video", async () => {
    const resolve = async () => ({
      mediaUrl: "https://cdn-cf-east.streamable.com/x.mp4",
      durationSeconds: 9,
      sourceWidth: 640,
      sourceHeight: 360,
      hasAudio: true,
    });
    const [slide] = await resolveStreamableSlides([embed], resolve);
    expect(slide).toMatchObject({
      kind: "video",
      mediaUrl: "https://cdn-cf-east.streamable.com/x.mp4",
      durationMode: "media",
      durationSeconds: 9,
      audioAvailable: true,
    });
    // Direct playback (no blob proxy) so Chrome's ORB can't block the CORS-less
    // CDN mp4 (ADR 0013).
    expect(slide.proxied).toBeFalsy();
  });

  it("keeps the iframe embed fallback when resolution fails", async () => {
    const resolve = async () => {
      throw new Error("boom");
    };
    const [slide] = await resolveStreamableSlides([embed], resolve, {
      timeoutMs: 50,
    });
    expect(slide).toMatchObject({ kind: "embed", provider: "streamable" });
  });

  it("leaves non-streamable slides untouched", async () => {
    /** @type {any} */
    const other = { provider: "reddit-image", kind: "image" };
    const out = await resolveStreamableSlides([other], async () => {
      throw new Error("x");
    });
    expect(out[0]).toBe(other);
  });

  it("streamableVideoSlide falls back to the slide's dimensions when absent", () => {
    const slide = streamableVideoSlide(
      { ...embed, sourceWidth: 100, sourceHeight: 50 },
      { mediaUrl: "https://cdn-x.streamable.com/x.mp4", hasAudio: false },
    );
    expect(slide.sourceWidth).toBe(100);
    expect(slide.sourceHeight).toBe(50);
  });
});

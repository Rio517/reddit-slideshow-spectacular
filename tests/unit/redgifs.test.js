import { describe, expect, it, vi } from "vitest";
import { createRedgifsResolver, redgifsVideoSlide } from "../../lib/redgifs.js";

/** @param {any} body @param {{ status?: number }} [opts] */
function jsonResponse(body, { status = 200 } = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const GIF = {
  urls: {
    hd: "https://media.redgifs.com/X.mp4",
    sd: "https://media.redgifs.com/X-sd.mp4",
  },
  duration: 12.5,
  hasAudio: true,
  width: 1920,
  height: 1080,
};

const providerFetchOptions = {
  credentials: "omit",
  referrerPolicy: "no-referrer",
};

describe("createRedgifsResolver", () => {
  it("resolves an id to the hd mp4 with duration + audio, caching the token", async () => {
    const fetchImpl = vi.fn(async (/** @type {any} */ url) =>
      String(url).includes("/auth/temporary")
        ? jsonResponse({ token: "T1" })
        : jsonResponse({ gif: GIF }),
    );
    const { resolve } = createRedgifsResolver({
      fetchImpl: /** @type {any} */ (fetchImpl),
    });

    expect(await resolve("abc")).toEqual({
      mediaUrl: "https://media.redgifs.com/X.mp4",
      durationSeconds: 12.5,
      hasAudio: true,
      sourceWidth: 1920,
      sourceHeight: 1080,
    });
    await resolve("def");

    const authCalls = fetchImpl.mock.calls.filter((c) =>
      String(c[0]).includes("/auth/temporary"),
    );
    expect(authCalls.length).toBe(1); // token reused across resolves
    const authCall = /** @type {any} */ (authCalls[0]);
    expect(authCall?.[1]).toEqual(providerFetchOptions);
    const gifCall = /** @type {any} */ (
      fetchImpl.mock.calls.find((c) => String(c[0]).includes("/gifs/abc"))
    );
    expect(gifCall?.[1]).toEqual({
      ...providerFetchOptions,
      headers: { Authorization: "Bearer T1" },
    });
  });

  it("refreshes the token once on a 401", async () => {
    let gifCalls = 0;
    const fetchImpl = vi.fn(async (/** @type {any} */ url) => {
      if (String(url).includes("/auth/temporary"))
        return jsonResponse({ token: "T" });
      gifCalls += 1;
      return gifCalls === 1
        ? jsonResponse({}, { status: 401 })
        : jsonResponse({
            gif: {
              urls: { hd: "https://media.redgifs.com/Y.mp4" },
              hasAudio: false,
            },
          });
    });
    const { resolve } = createRedgifsResolver({
      fetchImpl: /** @type {any} */ (fetchImpl),
    });
    const r = await resolve("zzz");
    expect(r.mediaUrl).toBe("https://media.redgifs.com/Y.mp4");
    expect(gifCalls).toBe(2);
  });

  it("falls back to the sd mp4 when no hd url is present", async () => {
    const fetchImpl = vi.fn(async (/** @type {any} */ url) =>
      String(url).includes("/auth/temporary")
        ? jsonResponse({ token: "T" })
        : jsonResponse({
            gif: {
              urls: { sd: "https://media.redgifs.com/X-sd.mp4" },
              hasAudio: false,
            },
          }),
    );
    const { resolve } = createRedgifsResolver({
      fetchImpl: /** @type {any} */ (fetchImpl),
    });
    const r = await resolve("abc");
    expect(r.mediaUrl).toBe("https://media.redgifs.com/X-sd.mp4");
  });

  it("rejects an mp4 url from an unexpected host", async () => {
    const fetchImpl = vi.fn(async (/** @type {any} */ url) =>
      String(url).includes("/auth/temporary")
        ? jsonResponse({ token: "T" })
        : jsonResponse({
            gif: {
              urls: { hd: "https://evil.example/x.mp4" },
              hasAudio: false,
            },
          }),
    );
    const { resolve } = createRedgifsResolver({
      fetchImpl: /** @type {any} */ (fetchImpl),
    });
    await expect(resolve("zzz")).rejects.toThrow(/media host/);
  });

  it("rejects when no mp4 url is present", async () => {
    const fetchImpl = vi.fn(async (/** @type {any} */ url) =>
      String(url).includes("/auth/temporary")
        ? jsonResponse({ token: "T" })
        : jsonResponse({ gif: { urls: {}, hasAudio: false } }),
    );
    const { resolve } = createRedgifsResolver({
      fetchImpl: /** @type {any} */ (fetchImpl),
    });
    await expect(resolve("nope")).rejects.toThrow();
  });
});

describe("redgifsVideoSlide", () => {
  it("upgrades an embed slide to a direct native-video slide", () => {
    const embed = /** @type {any} */ ({
      id: "t3_x:0",
      provider: "redgifs",
      kind: "embed",
      mediaUrl: "https://www.redgifs.com/ifr/abc",
      embedUrl: "https://www.redgifs.com/ifr/abc",
      sourceUrl: "https://www.redgifs.com/watch/abc",
      durationMode: "timer",
      audioAvailable: false,
      over18: true,
      title: "t",
    });
    const video = redgifsVideoSlide(embed, {
      mediaUrl: "https://media.redgifs.com/Abc.mp4",
      durationSeconds: 9,
      hasAudio: true,
      sourceWidth: 100,
      sourceHeight: 200,
    });
    expect(video.kind).toBe("video");
    expect(video.mediaUrl).toBe("https://media.redgifs.com/Abc.mp4");
    expect(video.durationMode).toBe("media");
    expect(video.durationSeconds).toBe(9);
    expect(video.audioAvailable).toBe(true);
    expect(video.proxied).toBeUndefined(); // direct play (no Referer via the sink)
    // Display context is preserved.
    expect(video.title).toBe("t");
    expect(video.over18).toBe(true);
  });

  it("marks the slide proxied when asked (Chrome: referrerpolicy is a no-op)", () => {
    const embed = /** @type {any} */ ({
      provider: "redgifs",
      kind: "embed",
      sourceUrl: "https://www.redgifs.com/watch/abc",
      embedUrl: "https://www.redgifs.com/ifr/abc",
    });
    const video = redgifsVideoSlide(
      embed,
      { mediaUrl: "https://media.redgifs.com/Abc.mp4", hasAudio: false },
      { proxied: true },
    );
    expect(video.kind).toBe("video");
    expect(video.proxied).toBe(true); // blob proxy path (background, no Referer)
  });
});

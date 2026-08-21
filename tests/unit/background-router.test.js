import { describe, expect, it, vi } from "vitest";
import { createMessageRouter } from "../../lib/background-router.js";

const RUNTIME_ID = "self@example";
// A content-script sender: own extension id + a tab (extension pages have none).
const OWN = { id: RUNTIME_ID, tab: { id: 1 } };

function makeRouter(overrides = {}) {
  return createMessageRouter({
    runtimeId: RUNTIME_ID,
    fetchQueuePage: async () => ({
      slides: [{ id: "a" }],
      after: "t3_x",
      postsScanned: 50,
      exhausted: false,
    }),
    hashImage: async () => "0011223344556677",
    ...overrides,
  });
}

describe("createMessageRouter - sender validation", () => {
  it("ignores messages from a foreign sender", () => {
    const router = makeRouter();
    expect(
      router(
        { type: "slideshow.requestPage", payload: { pageUrl: "x" } },
        { id: "someone-else" },
      ),
    ).toBeUndefined();
  });

  it("ignores messages with no sender id", () => {
    const router = makeRouter();
    expect(router({ type: "slideshow.requestPage" }, {})).toBeUndefined();
  });

  it("ignores unknown message types from own sender", () => {
    const router = makeRouter();
    expect(router({ type: "slideshow.unknown" }, OWN)).toBeUndefined();
  });
});

describe("createMessageRouter - requestPage", () => {
  it("returns a built page for a valid request", async () => {
    const router = makeRouter();
    const result = await router(
      {
        type: "slideshow.requestPage",
        payload: { pageUrl: "https://old.reddit.com/r/x/" },
      },
      OWN,
    );
    expect(result).toMatchObject({
      ok: true,
      page: { after: "t3_x", postsScanned: 50, exhausted: false },
    });
  });

  it("passes the after cursor through", async () => {
    /** @type {Array<{ pageUrl: string, options: any }>} */
    const calls = [];
    const router = makeRouter({
      fetchQueuePage: async (
        /** @type {string} */ pageUrl,
        /** @type {any} */ options,
      ) => {
        calls.push({ pageUrl, options });
        return { slides: [], after: null, postsScanned: 0, exhausted: true };
      },
    });
    await router(
      {
        type: "slideshow.requestPage",
        payload: { pageUrl: "https://old.reddit.com/r/x/", after: "t3_y" },
      },
      OWN,
    );
    expect(calls[0].options).toEqual({ after: "t3_y" });
  });

  it("rejects a missing page url", async () => {
    const router = makeRouter();
    const result = await router(
      { type: "slideshow.requestPage", payload: {} },
      OWN,
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "missing-page-url" },
    });
  });

  it("returns an error payload when the fetch fails", async () => {
    const router = makeRouter({
      fetchQueuePage: async () => {
        throw Object.assign(new Error("boom"), {
          name: "RedditListingFetchError",
          status: 403,
        });
      },
    });
    const result = await router(
      {
        type: "slideshow.requestPage",
        payload: { pageUrl: "https://old.reddit.com/r/x/" },
      },
      OWN,
    );
    expect(result).toMatchObject({ ok: false, error: { status: 403 } });
  });

  it("rejects a listing fetch from a non-content-script sender (no tab)", async () => {
    /** @type {string[]} */
    const fetched = [];
    const router = makeRouter({
      fetchQueuePage: async (/** @type {string} */ pageUrl) => {
        fetched.push(pageUrl);
        return { slides: [], after: null, postsScanned: 0, exhausted: true };
      },
    });
    const result = await router(
      {
        type: "slideshow.requestPage",
        payload: { pageUrl: "https://old.reddit.com/r/x/" },
      },
      { id: RUNTIME_ID }, // an extension page: own id, but no tab
    );
    expect(result).toEqual({ ok: false });
    // The session-authenticated fetch must never run for an untrusted caller.
    expect(fetched).toEqual([]);
  });
});

describe("createMessageRouter - hashImage", () => {
  it("returns the hash for a valid url", async () => {
    const router = makeRouter();
    const result = await router(
      {
        type: "slideshow.hashImage",
        payload: { url: "https://i.redd.it/a.jpg" },
      },
      OWN,
    );
    expect(result).toEqual({ ok: true, hash: "0011223344556677" });
  });

  it("hashes an i.imgur.com image (Imgur dedup, ADR 0015)", async () => {
    const router = makeRouter();
    const result = await router(
      {
        type: "slideshow.hashImage",
        payload: { url: "https://i.imgur.com/XV5chUH.jpg" },
      },
      OWN,
    );
    expect(result).toEqual({ ok: true, hash: "0011223344556677" });
  });

  it("passes a null hash through (undecodable image)", async () => {
    const router = makeRouter({ hashImage: async () => null });
    const result = await router(
      {
        type: "slideshow.hashImage",
        payload: { url: "https://i.redd.it/a.jpg" },
      },
      OWN,
    );
    expect(result).toEqual({ ok: true, hash: null });
  });

  it("fails closed when hashing rejects", async () => {
    const router = makeRouter({
      hashImage: async () => {
        throw new Error("blocked");
      },
    });
    const result = await router(
      {
        type: "slideshow.hashImage",
        payload: { url: "https://i.redd.it/a.jpg" },
      },
      OWN,
    );
    expect(result).toEqual({ ok: false });
  });

  it("rejects a non-Reddit-image host without hashing", async () => {
    let called = false;
    const router = makeRouter({
      hashImage: async () => {
        called = true;
        return "deadbeefdeadbeef";
      },
    });
    const result = await router(
      {
        type: "slideshow.hashImage",
        payload: { url: "https://evil.example/x.jpg" },
      },
      OWN,
    );
    expect(result).toEqual({ ok: false });
    expect(called).toBe(false);
  });

  it("rejects a cleartext http URL on an allowlisted host", async () => {
    let called = false;
    const router = makeRouter({
      hashImage: async () => {
        called = true;
        return "deadbeefdeadbeef";
      },
    });
    const result = await router(
      {
        type: "slideshow.hashImage",
        payload: { url: "http://i.redd.it/a.jpg" },
      },
      OWN,
    );
    expect(result).toEqual({ ok: false });
    expect(called).toBe(false);
  });

  it("rejects a missing url", async () => {
    const router = makeRouter();
    expect(
      await router({ type: "slideshow.hashImage", payload: {} }, OWN),
    ).toEqual({ ok: false });
  });

  it("rejects an unparseable hash url without hashing", async () => {
    let called = false;
    const router = makeRouter({
      hashImage: async () => {
        called = true;
        return "deadbeefdeadbeef";
      },
    });
    const result = await router(
      { type: "slideshow.hashImage", payload: { url: "http://[" } },
      OWN,
    );
    expect(result).toEqual({ ok: false });
    expect(called).toBe(false);
  });

  it("rejects a privileged hash from a non-content-script sender (no tab)", async () => {
    const router = makeRouter();
    const result = await router(
      {
        type: "slideshow.hashImage",
        payload: { url: "https://i.redd.it/a.jpg" },
      },
      { id: RUNTIME_ID }, // an extension page: own id, but no tab
    );
    expect(result).toEqual({ ok: false });
  });
});

describe("createMessageRouter - fetchMedia", () => {
  it("returns base64 bytes for a Redgifs media url", async () => {
    const router = makeRouter({
      fetchMediaBytes: async () => new Uint8Array([1, 2, 3]).buffer,
    });
    const result = await router(
      {
        type: "slideshow.fetchMedia",
        payload: { url: "https://media.redgifs.com/X.mp4" },
      },
      OWN,
    );
    // Base64, not a raw ArrayBuffer (which Chrome drops over the message bound.).
    expect(result).toEqual({ ok: true, b64: "AQID" });
  });

  it("returns base64 bytes for a reddit image original (LOD decode)", async () => {
    const router = makeRouter({
      fetchMediaBytes: async () => new Uint8Array([1, 2, 3]).buffer,
    });
    const result = await router(
      {
        type: "slideshow.fetchMedia",
        payload: { url: "https://i.redd.it/huge.jpeg" },
      },
      OWN,
    );
    expect(result).toEqual({ ok: true, b64: "AQID" });
  });

  it("returns base64 bytes for an Imgur .mp4 media url", async () => {
    const router = makeRouter({
      fetchMediaBytes: async () => new ArrayBuffer(16),
    });
    const result = await router(
      {
        type: "slideshow.fetchMedia",
        payload: { url: "https://i.imgur.com/AbCdEf1.mp4" },
      },
      OWN,
    );
    expect(result.ok).toBe(true);
    expect(typeof result.b64).toBe("string");
  });

  it("returns bytes for a Streamable per-video CDN subdomain", async () => {
    const router = makeRouter({
      fetchMediaBytes: async () => new ArrayBuffer(16),
    });
    const result = await router(
      {
        type: "slideshow.fetchMedia",
        payload: {
          url: "https://cdn-cf-east.streamable.com/video/mp4/abc123.mp4",
        },
      },
      OWN,
    );
    expect(result.ok).toBe(true);
  });

  it("returns bytes for a Giphy media subdomain", async () => {
    const router = makeRouter({
      fetchMediaBytes: async () => new ArrayBuffer(16),
    });
    const result = await router(
      {
        type: "slideshow.fetchMedia",
        payload: { url: "https://media2.giphy.com/media/abc/giphy.mp4" },
      },
      OWN,
    );
    expect(result.ok).toBe(true);
  });

  it("rejects a look-alike host that only ends with the brand, not the domain", async () => {
    let called = false;
    const router = makeRouter({
      fetchMediaBytes: async () => {
        called = true;
        return new ArrayBuffer(8);
      },
    });
    const result = await router(
      {
        type: "slideshow.fetchMedia",
        payload: { url: "https://evilstreamable.com/x.mp4" },
      },
      OWN,
    );
    expect(result).toEqual({ ok: false });
    expect(called).toBe(false);
  });

  it("rejects a non-allowlisted media host without fetching", async () => {
    let called = false;
    const router = makeRouter({
      fetchMediaBytes: async () => {
        called = true;
        return new ArrayBuffer(8);
      },
    });
    const result = await router(
      {
        type: "slideshow.fetchMedia",
        payload: { url: "https://evil.example/a.jpg" },
      },
      OWN,
    );
    expect(result).toEqual({ ok: false });
    expect(called).toBe(false);
  });

  it("fails closed when no media fetcher is wired", async () => {
    const router = makeRouter();
    const result = await router(
      {
        type: "slideshow.fetchMedia",
        payload: { url: "https://media.redgifs.com/X.mp4" },
      },
      OWN,
    );
    expect(result).toEqual({ ok: false });
  });

  it("rejects an unparseable media url without fetching", async () => {
    let called = false;
    const router = makeRouter({
      fetchMediaBytes: async () => {
        called = true;
        return new ArrayBuffer(8);
      },
    });
    const result = await router(
      { type: "slideshow.fetchMedia", payload: { url: "http://[" } },
      OWN,
    );
    expect(result).toEqual({ ok: false });
    expect(called).toBe(false);
  });

  it("rejects a media fetch from a non-content-script sender (no tab)", async () => {
    let called = false;
    const router = makeRouter({
      fetchMediaBytes: async () => {
        called = true;
        return new ArrayBuffer(8);
      },
    });
    const result = await router(
      {
        type: "slideshow.fetchMedia",
        payload: { url: "https://media.redgifs.com/X.mp4" },
      },
      { id: RUNTIME_ID }, // an extension page: own id, but no tab
    );
    expect(result).toEqual({ ok: false });
    // The privileged fetch must never run for an untrusted caller.
    expect(called).toBe(false);
  });
});

describe("createMessageRouter - resolveRedgifs", () => {
  const rgMsg = (/** @type {any} */ id) => ({
    type: "slideshow.resolveRedgifs",
    payload: { id },
  });
  const MEDIA = { mediaUrl: "https://media.redgifs.com/X.mp4", hasAudio: true };

  it("resolves a redgifs id to media for a content-script request", async () => {
    /** @type {string[]} */
    const ids = [];
    const router = makeRouter({
      resolveRedgifsId: async (/** @type {string} */ id) => {
        ids.push(id);
        return MEDIA;
      },
    });
    const result = await router(rgMsg("abc"), OWN);
    expect(result).toEqual({ ok: true, media: MEDIA });
    expect(ids).toEqual(["abc"]);
  });

  it("rejects a resolve from a non-content-script sender (no tab)", async () => {
    let called = false;
    const router = makeRouter({
      resolveRedgifsId: async () => {
        called = true;
        return MEDIA;
      },
    });
    const result = await router(rgMsg("abc"), { id: RUNTIME_ID });
    expect(result).toEqual({ ok: false });
    expect(called).toBe(false);
  });

  it("rejects a missing id", async () => {
    const router = makeRouter({ resolveRedgifsId: async () => MEDIA });
    expect(await router(rgMsg(undefined), OWN)).toEqual({ ok: false });
  });

  it("fails closed when resolution throws", async () => {
    const router = makeRouter({
      resolveRedgifsId: async () => {
        throw new Error("redgifs down");
      },
    });
    expect(await router(rgMsg("abc"), OWN)).toEqual({ ok: false });
  });
});

describe("createMessageRouter - resolveRedditAudio", () => {
  const dashMsg = (/** @type {any} */ dashUrl) => ({
    type: "slideshow.resolveRedditAudio",
    payload: { dashUrl },
  });
  const DASH = "https://v.redd.it/abc/DASHPlaylist.mpd?a=1";
  const AUDIO = "https://v.redd.it/abc/DASH_AUDIO_128.mp4";

  it("returns the resolved audio url for a v.redd.it manifest", async () => {
    const router = makeRouter({ resolveRedditAudio: async () => AUDIO });
    expect(await router(dashMsg(DASH), OWN)).toEqual({
      ok: true,
      audioUrl: AUDIO,
    });
  });

  it("passes a null audio url through for a silent clip", async () => {
    const router = makeRouter({ resolveRedditAudio: async () => null });
    expect(await router(dashMsg(DASH), OWN)).toEqual({
      ok: true,
      audioUrl: null,
    });
  });

  it("rejects a resolve from a non-content-script sender (no tab)", async () => {
    let called = false;
    const router = makeRouter({
      resolveRedditAudio: async () => {
        called = true;
        return AUDIO;
      },
    });
    expect(await router(dashMsg(DASH), { id: RUNTIME_ID })).toEqual({
      ok: false,
    });
    expect(called).toBe(false);
  });

  it("rejects a non-v.redd.it manifest host without fetching", async () => {
    let called = false;
    const router = makeRouter({
      resolveRedditAudio: async () => {
        called = true;
        return AUDIO;
      },
    });
    expect(await router(dashMsg("https://evil.example/x.mpd"), OWN)).toEqual({
      ok: false,
    });
    expect(called).toBe(false);
  });

  it("rejects a cleartext manifest url", async () => {
    const router = makeRouter({ resolveRedditAudio: async () => AUDIO });
    expect(
      await router(dashMsg("http://v.redd.it/abc/DASHPlaylist.mpd"), OWN),
    ).toEqual({ ok: false });
  });

  it("fails closed when resolution throws", async () => {
    const router = makeRouter({
      resolveRedditAudio: async () => {
        throw new Error("boom");
      },
    });
    expect(await router(dashMsg(DASH), OWN)).toEqual({ ok: false });
  });
});

describe("createMessageRouter - download", () => {
  const dlMsg = (/** @type {any} */ payload) => ({
    type: "slideshow.download",
    payload,
  });

  it("downloads a media file for a content-script request", async () => {
    /** @type {Array<{ url: string, filename: string }>} */
    const calls = [];
    const router = makeRouter({
      downloadMedia: async (/** @type {any} */ opts) => {
        calls.push(opts);
        return 7;
      },
    });
    const result = await router(
      dlMsg({ url: "https://i.redd.it/a.jpg", filename: "t3_a.jpg" }),
      OWN,
    );
    expect(result).toEqual({ ok: true });
    expect(calls).toEqual([
      { url: "https://i.redd.it/a.jpg", filename: "t3_a.jpg" },
    ]);
  });

  it("rejects a download from a non-content-script sender (no tab)", async () => {
    let called = false;
    const router = makeRouter({
      downloadMedia: async () => {
        called = true;
        return 1;
      },
    });
    const result = await router(
      dlMsg({ url: "https://i.redd.it/a.jpg", filename: "t3_a.jpg" }),
      { id: RUNTIME_ID }, // extension page: own id, no tab
    );
    expect(result).toEqual({ ok: false });
    expect(called).toBe(false);
  });

  it("rejects a non-https download url", async () => {
    let called = false;
    const router = makeRouter({
      downloadMedia: async () => {
        called = true;
        return 1;
      },
    });
    const result = await router(
      dlMsg({ url: "http://i.redd.it/a.jpg", filename: "t3_a.jpg" }),
      OWN,
    );
    expect(result).toEqual({ ok: false });
    expect(called).toBe(false);
  });

  it("rejects a missing filename", async () => {
    const router = makeRouter({ downloadMedia: async () => 1 });
    expect(
      await router(dlMsg({ url: "https://i.redd.it/a.jpg" }), OWN),
    ).toEqual({ ok: false });
  });

  it("strips any path from the suggested filename", async () => {
    /** @type {Array<{ url: string, filename: string }>} */
    const calls = [];
    const router = makeRouter({
      downloadMedia: async (/** @type {any} */ opts) => {
        calls.push(opts);
        return 1;
      },
    });
    await router(
      dlMsg({ url: "https://i.redd.it/a.jpg", filename: "../../etc/passwd" }),
      OWN,
    );
    expect(calls[0].filename).toBe("passwd");
    // Windows backslash separators are stripped too.
    await router(
      dlMsg({ url: "https://i.redd.it/a.jpg", filename: "..\\..\\evil.exe" }),
      OWN,
    );
    expect(calls[1].filename).toBe("evil.exe");
  });

  it("saves into the configured subfolder under the Downloads folder", async () => {
    /** @type {Array<{ url: string, filename: string }>} */
    const calls = [];
    const router = makeRouter({
      downloadMedia: async (/** @type {any} */ opts) => {
        calls.push(opts);
        return 1;
      },
      getDownloadSubfolder: async () => "Reddit Slideshow",
    });
    const result = await router(
      dlMsg({ url: "https://i.redd.it/a.jpg", filename: "t3_a.jpg" }),
      OWN,
    );
    expect(result).toEqual({ ok: true });
    expect(calls[0].filename).toBe("Reddit Slideshow/t3_a.jpg");
  });

  it("re-sanitizes the subfolder value at the download boundary", async () => {
    /** @type {Array<{ url: string, filename: string }>} */
    const calls = [];
    const router = makeRouter({
      downloadMedia: async (/** @type {any} */ opts) => {
        calls.push(opts);
        return 1;
      },
      // Bypasses settings normalization (e.g. a corrupted storage value); the
      // boundary must still confine it to the Downloads folder.
      getDownloadSubfolder: async () => "..\\..\\evil",
    });
    await router(
      dlMsg({ url: "https://i.redd.it/a.jpg", filename: "t3_a.jpg" }),
      OWN,
    );
    expect(calls[0].filename).toBe("evil/t3_a.jpg");
  });

  it("downloads to the plain Downloads folder when the subfolder read fails", async () => {
    /** @type {Array<{ url: string, filename: string }>} */
    const calls = [];
    const router = makeRouter({
      downloadMedia: async (/** @type {any} */ opts) => {
        calls.push(opts);
        return 1;
      },
      getDownloadSubfolder: async () => {
        throw new Error("storage gone");
      },
    });
    const result = await router(
      dlMsg({ url: "https://i.redd.it/a.jpg", filename: "t3_a.jpg" }),
      OWN,
    );
    expect(result).toEqual({ ok: true });
    expect(calls[0].filename).toBe("t3_a.jpg");
  });

  it("fails closed when the download throws", async () => {
    const router = makeRouter({
      downloadMedia: async () => {
        throw new Error("blocked");
      },
    });
    const result = await router(
      dlMsg({ url: "https://i.redd.it/a.jpg", filename: "t3_a.jpg" }),
      OWN,
    );
    expect(result).toEqual({ ok: false });
  });
});

describe("createMessageRouter - vote", () => {
  const voteMsg = (/** @type {any} */ id, /** @type {any} */ dir) => ({
    type: "slideshow.vote",
    payload: { id, dir },
  });

  it("votes on a post for a content-script request", async () => {
    /** @type {Array<[string, number]>} */
    const calls = [];
    const router = makeRouter({
      vote: async (/** @type {string} */ id, /** @type {number} */ dir) => {
        calls.push([id, dir]);
        return true;
      },
    });
    expect(await router(voteMsg("t3_abc", 1), OWN)).toEqual({ ok: true });
    expect(calls).toEqual([["t3_abc", 1]]);
  });

  it("rejects a vote from a non-content-script sender (no tab)", async () => {
    let called = false;
    const router = makeRouter({
      vote: async () => {
        called = true;
        return true;
      },
    });
    expect(await router(voteMsg("t3_abc", 1), { id: RUNTIME_ID })).toEqual({
      ok: false,
    });
    expect(called).toBe(false);
  });

  it("rejects an id that isn't a post fullname", async () => {
    let called = false;
    const router = makeRouter({
      vote: async () => {
        called = true;
        return true;
      },
    });
    expect(await router(voteMsg("evil", 1), OWN)).toEqual({ ok: false });
    expect(await router(voteMsg("t1_abc", 1), OWN)).toEqual({ ok: false });
    expect(called).toBe(false);
  });

  it("rejects an out-of-range direction", async () => {
    const router = makeRouter({ vote: async () => true });
    expect(await router(voteMsg("t3_abc", 2), OWN)).toEqual({ ok: false });
    expect(await router(voteMsg("t3_abc", "up"), OWN)).toEqual({ ok: false });
  });

  it("fails closed when the vote throws", async () => {
    const router = makeRouter({
      vote: async () => {
        throw new Error("not logged in");
      },
    });
    expect(await router(voteMsg("t3_abc", -1), OWN)).toEqual({ ok: false });
  });
});

describe("createMessageRouter - openOptions", () => {
  it("opens the options page for an own-sender request", async () => {
    const openOptionsPage = vi.fn();
    const router = makeRouter({ openOptionsPage });
    const result = await router({ type: "slideshow.openOptions" }, OWN);
    expect(openOptionsPage).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true });
  });

  it("ignores an openOptions request from a foreign sender", () => {
    const openOptionsPage = vi.fn();
    const router = makeRouter({ openOptionsPage });
    expect(
      router({ type: "slideshow.openOptions" }, { id: "someone-else" }),
    ).toBeUndefined();
    expect(openOptionsPage).not.toHaveBeenCalled();
  });
});

describe("createMessageRouter - openPopout", () => {
  const popoutMsg = (/** @type {string} */ url) => ({
    type: "slideshow.openPopout",
    payload: { url },
  });

  it("opens a popout for a Reddit URL from a content script", async () => {
    const openPopout = vi.fn();
    const router = makeRouter({ openPopout });
    const result = await router(
      popoutMsg("https://www.reddit.com/r/x/#rs-slideshow"),
      OWN,
    );
    expect(openPopout).toHaveBeenCalledWith(
      "https://www.reddit.com/r/x/#rs-slideshow",
    );
    expect(result).toEqual({ ok: true });
  });

  it("refuses a non-Reddit or non-HTTPS popout URL", async () => {
    const openPopout = vi.fn();
    const router = makeRouter({ openPopout });
    expect(await router(popoutMsg("https://evil.example/x"), OWN)).toEqual({
      ok: false,
    });
    expect(await router(popoutMsg("http://old.reddit.com/r/x/"), OWN)).toEqual({
      ok: false,
    });
    expect(openPopout).not.toHaveBeenCalled();
  });

  it("refuses a popout request from an extension page (no tab)", async () => {
    const openPopout = vi.fn();
    const router = makeRouter({ openPopout });
    const result = await router(popoutMsg("https://old.reddit.com/r/x/"), {
      id: RUNTIME_ID,
    });
    expect(result).toEqual({ ok: false });
    expect(openPopout).not.toHaveBeenCalled();
  });
});

describe("createMessageRouter - block", () => {
  const blockMsg = (/** @type {any} */ name) => ({
    type: "slideshow.block",
    payload: { name },
  });

  it("blocks a user for a content-script request", async () => {
    /** @type {string[]} */
    const blocked = [];
    const router = makeRouter({
      block: async (/** @type {string} */ name) => {
        blocked.push(name);
        return true;
      },
    });
    expect(await router(blockMsg("spez"), OWN)).toEqual({ ok: true });
    expect(blocked).toEqual(["spez"]);
  });

  it("rejects a block from a non-content-script sender (no tab)", async () => {
    const router = makeRouter({ block: async () => true });
    expect(await router(blockMsg("spez"), { id: RUNTIME_ID })).toEqual({
      ok: false,
    });
  });

  it("rejects an invalid username", async () => {
    const router = makeRouter({ block: async () => true });
    expect(await router(blockMsg("bad name!"), OWN)).toEqual({ ok: false });
    expect(await router(blockMsg(""), OWN)).toEqual({ ok: false });
  });

  it("fails closed when the block throws", async () => {
    const router = makeRouter({
      block: async () => {
        throw new Error("nope");
      },
    });
    expect(await router(blockMsg("spez"), OWN)).toEqual({ ok: false });
  });
});

describe("createMessageRouter - friend", () => {
  const friendMsg = (/** @type {any} */ name) => ({
    type: "slideshow.friend",
    payload: { name },
  });

  it("friends a user for a content-script request", async () => {
    /** @type {string[]} */
    const friended = [];
    const router = makeRouter({
      friend: async (/** @type {string} */ name) => {
        friended.push(name);
        return true;
      },
    });
    expect(await router(friendMsg("spez"), OWN)).toEqual({ ok: true });
    expect(friended).toEqual(["spez"]);
  });

  it("rejects a friend from a non-content-script sender (no tab)", async () => {
    const router = makeRouter({ friend: async () => true });
    expect(await router(friendMsg("spez"), { id: RUNTIME_ID })).toEqual({
      ok: false,
    });
  });

  it("rejects an invalid username", async () => {
    const router = makeRouter({ friend: async () => true });
    expect(await router(friendMsg("bad name!"), OWN)).toEqual({ ok: false });
    expect(await router(friendMsg(""), OWN)).toEqual({ ok: false });
  });

  it("fails closed when the friend throws", async () => {
    const router = makeRouter({
      friend: async () => {
        throw new Error("nope");
      },
    });
    expect(await router(friendMsg("spez"), OWN)).toEqual({ ok: false });
  });
});

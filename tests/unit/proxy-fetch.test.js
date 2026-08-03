import { describe, expect, it } from "vitest";
import { fetchCappedBytes } from "../../lib/proxy-fetch.js";

/**
 * @param {Uint8Array[]} chunks
 * @param {{ contentLength?: number, ok?: boolean, status?: number, url?: string }} [opts]
 */
function streamResponse(
  chunks,
  {
    contentLength,
    ok = true,
    status = 200,
    url = "https://media.redgifs.com/x.mp4",
  } = {},
) {
  let i = 0;
  return {
    ok,
    status,
    url,
    headers: {
      get: (/** @type {string} */ k) =>
        k.toLowerCase() === "content-length" && contentLength != null
          ? String(contentLength)
          : null,
    },
    body: {
      getReader: () => ({
        read: async () =>
          i < chunks.length
            ? { done: false, value: chunks[i++] }
            : { done: true, value: undefined },
        cancel: async () => {},
      }),
    },
  };
}

describe("fetchCappedBytes", () => {
  it("returns the bytes when under the cap", async () => {
    const fetchImpl = async () =>
      /** @type {any} */ (
        streamResponse([new Uint8Array(4), new Uint8Array(4)])
      );
    const buf = await fetchCappedBytes("https://media.redgifs.com/x.mp4", 100, {
      fetchImpl: /** @type {any} */ (fetchImpl),
    });
    expect(buf.byteLength).toBe(8);
  });

  it("rejects when Content-Length exceeds the cap", async () => {
    const fetchImpl = async () =>
      /** @type {any} */ (streamResponse([], { contentLength: 200 }));
    await expect(
      fetchCappedBytes("https://media.redgifs.com/x.mp4", 100, {
        fetchImpl: /** @type {any} */ (fetchImpl),
      }),
    ).rejects.toThrow(/too-large/);
  });

  it("rejects when the streamed body exceeds the cap", async () => {
    const fetchImpl = async () =>
      /** @type {any} */ (
        streamResponse([new Uint8Array(150), new Uint8Array(150)])
      );
    await expect(
      fetchCappedBytes("https://media.redgifs.com/x.mp4", 100, {
        fetchImpl: /** @type {any} */ (fetchImpl),
      }),
    ).rejects.toThrow(/too-large/);
  });

  it("rejects on an HTTP error", async () => {
    const fetchImpl = async () =>
      /** @type {any} */ (streamResponse([], { ok: false, status: 404 }));
    await expect(
      fetchCappedBytes("https://i.redd.it/x.jpg", 100, {
        fetchImpl: /** @type {any} */ (fetchImpl),
      }),
    ).rejects.toThrow(/404/);
  });

  it("rejects when the final (post-redirect) URL fails the validator", async () => {
    const fetchImpl = async () =>
      /** @type {any} */ (
        streamResponse([new Uint8Array(4)], {
          url: "https://internal.example.com/x.mp4",
        })
      );
    await expect(
      fetchCappedBytes("https://media.redgifs.com/x.mp4", 100, {
        fetchImpl: /** @type {any} */ (fetchImpl),
        validateFinalUrl: (url) =>
          new URL(url).hostname === "media.redgifs.com",
      }),
    ).rejects.toThrow(/final-url/);
  });

  it("returns the bytes when the final URL stays on an allowed host", async () => {
    const fetchImpl = async () =>
      /** @type {any} */ (
        streamResponse([new Uint8Array(4)], {
          url: "https://media.redgifs.com/x.mp4",
        })
      );
    const buf = await fetchCappedBytes("https://media.redgifs.com/x.mp4", 100, {
      fetchImpl: /** @type {any} */ (fetchImpl),
      validateFinalUrl: (url) => new URL(url).hostname === "media.redgifs.com",
    });
    expect(buf.byteLength).toBe(4);
  });

  it("aborts and rejects on timeout", async () => {
    const fetchImpl = (/** @type {string} */ _url, /** @type {any} */ opts) =>
      new Promise((_resolve, reject) => {
        opts.signal.addEventListener("abort", () =>
          reject(new Error("aborted")),
        );
      });
    await expect(
      fetchCappedBytes("https://media.redgifs.com/x.mp4", 100, {
        fetchImpl: /** @type {any} */ (fetchImpl),
        timeoutMs: 5,
      }),
    ).rejects.toThrow();
  });
});

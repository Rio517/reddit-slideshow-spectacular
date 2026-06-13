import { describe, expect, it, vi } from "vitest";
import { createRedditWriter } from "../../lib/reddit-write.js";

/** @param {any} body @param {{ status?: number }} [opts] */
function jsonResponse(body, { status = 200 } = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

describe("createRedditWriter", () => {
  it("fetches the modhash once and posts id/dir/uh, caching the token", async () => {
    /** @type {Array<{ url: string, opts: any }>} */
    const calls = [];
    const fetchImpl = vi.fn(
      async (/** @type {any} */ url, /** @type {any} */ opts) => {
        calls.push({ url: String(url), opts });
        return String(url).includes("/api/me.json")
          ? jsonResponse({ data: { modhash: "MH" } })
          : jsonResponse({});
      },
    );
    const { vote } = createRedditWriter({
      fetchImpl: /** @type {any} */ (fetchImpl),
    });

    expect(await vote("t3_abc", 1)).toBe(true);
    await vote("t3_def", -1);

    const me = calls.filter((c) => c.url.includes("/api/me.json"));
    expect(me.length).toBe(1); // modhash reused
    const firstVote = calls.find((c) => c.url.includes("/api/vote"));
    expect(firstVote?.opts?.method).toBe("POST");
    expect(firstVote?.opts?.credentials).toBe("include");
    const params = new URLSearchParams(firstVote?.opts?.body);
    expect(params.get("id")).toBe("t3_abc");
    expect(params.get("dir")).toBe("1");
    expect(params.get("uh")).toBe("MH");
  });

  it("refreshes the modhash once on a 403 and retries the vote", async () => {
    let voteCalls = 0;
    const fetchImpl = vi.fn(async (/** @type {any} */ url) => {
      if (String(url).includes("/api/me.json"))
        return jsonResponse({ data: { modhash: "MH" } });
      voteCalls += 1;
      return voteCalls === 1
        ? jsonResponse({}, { status: 403 })
        : jsonResponse({});
    });
    const { vote } = createRedditWriter({
      fetchImpl: /** @type {any} */ (fetchImpl),
    });
    expect(await vote("t3_abc", 0)).toBe(true);
    expect(voteCalls).toBe(2);
  });

  it("throws when the session has no modhash (not logged in)", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ data: { modhash: "" } }),
    );
    const { vote } = createRedditWriter({
      fetchImpl: /** @type {any} */ (fetchImpl),
    });
    await expect(vote("t3_abc", 1)).rejects.toThrow();
  });

  it("throws on a failed vote response", async () => {
    const fetchImpl = vi.fn(async (/** @type {any} */ url) =>
      String(url).includes("/api/me.json")
        ? jsonResponse({ data: { modhash: "MH" } })
        : jsonResponse({}, { status: 500 }),
    );
    const { vote } = createRedditWriter({
      fetchImpl: /** @type {any} */ (fetchImpl),
    });
    await expect(vote("t3_abc", 1)).rejects.toThrow();
  });

  it("blocks a user: POSTs name + uh to /api/block_user", async () => {
    /** @type {Array<{ url: string, opts: any }>} */
    const calls = [];
    const fetchImpl = vi.fn(
      async (/** @type {any} */ url, /** @type {any} */ opts) => {
        calls.push({ url: String(url), opts });
        return String(url).includes("/api/me.json")
          ? jsonResponse({ data: { modhash: "MH" } })
          : jsonResponse({});
      },
    );
    const { blockUser } = createRedditWriter({
      fetchImpl: /** @type {any} */ (fetchImpl),
    });
    expect(await blockUser("spez")).toBe(true);
    const req = calls.find((c) => c.url.includes("/api/block_user"));
    expect(req?.opts?.method).toBe("POST");
    expect(req?.opts?.credentials).toBe("include");
    const params = new URLSearchParams(req?.opts?.body);
    expect(params.get("name")).toBe("spez");
    expect(params.get("uh")).toBe("MH");
  });

  it("friends a user: POSTs type=friend + name + uh to /api/friend", async () => {
    /** @type {Array<{ url: string, opts: any }>} */
    const calls = [];
    const fetchImpl = vi.fn(
      async (/** @type {any} */ url, /** @type {any} */ opts) => {
        calls.push({ url: String(url), opts });
        return String(url).includes("/api/me.json")
          ? jsonResponse({ data: { modhash: "MH" } })
          : jsonResponse({});
      },
    );
    const { friendUser } = createRedditWriter({
      fetchImpl: /** @type {any} */ (fetchImpl),
    });
    expect(await friendUser("spez")).toBe(true);
    const req = calls.find((c) => c.url.includes("/api/friend"));
    const params = new URLSearchParams(req?.opts?.body);
    expect(params.get("type")).toBe("friend");
    expect(params.get("name")).toBe("spez");
    expect(params.get("uh")).toBe("MH");
  });

  it("refreshes the modhash once on a 403 and retries a block", async () => {
    let writeCalls = 0;
    const fetchImpl = vi.fn(async (/** @type {any} */ url) => {
      if (String(url).includes("/api/me.json"))
        return jsonResponse({ data: { modhash: "MH" } });
      writeCalls += 1;
      return writeCalls === 1
        ? jsonResponse({}, { status: 403 })
        : jsonResponse({});
    });
    const { blockUser } = createRedditWriter({
      fetchImpl: /** @type {any} */ (fetchImpl),
    });
    expect(await blockUser("spez")).toBe(true);
    expect(writeCalls).toBe(2);
  });
});

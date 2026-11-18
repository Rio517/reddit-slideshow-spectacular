import { describe, expect, it, vi } from "vitest";
import {
  createActionClickHandler,
  feedOfPost,
  noticeReason,
  noticeUrl,
} from "../../lib/action-click.js";

describe("noticeReason", () => {
  it("starts on a Reddit feed, on either host", () => {
    expect(noticeReason("https://www.reddit.com/r/pics/")).toBeNull();
    expect(noticeReason("https://old.reddit.com/")).toBeNull();
    expect(noticeReason("https://www.reddit.com/user/someone/")).toBeNull();
  });

  it("is off Reddit when the tab has no readable URL or another host", () => {
    expect(noticeReason(undefined)).toBe("offReddit");
    expect(noticeReason("https://example.com/r/pics/")).toBe("offReddit");
    expect(noticeReason("https://reddit.com.evil.test/")).toBe("offReddit");
    expect(noticeReason("chrome://newtab/")).toBe("offReddit");
  });

  it("names a single post page", () => {
    expect(
      noticeReason("https://www.reddit.com/r/pics/comments/abc123/title/"),
    ).toBe("post");
  });
});

describe("feedOfPost", () => {
  it("is the post's subreddit on the same host", () => {
    expect(feedOfPost("https://old.reddit.com/r/pics/comments/abc/t/")).toBe(
      "https://old.reddit.com/r/pics/",
    );
  });

  it("is null when the path names no feed", () => {
    expect(feedOfPost("https://www.reddit.com/comments/abc/")).toBeNull();
  });
});

describe("noticeUrl", () => {
  it("carries the reason, the tab and the feed", () => {
    const url = new URL(
      noticeUrl("post", 7, "https://www.reddit.com/r/pics/"),
      "https://x.test",
    );
    expect(url.pathname).toBe("/notice.html");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      reason: "post",
      tab: "7",
      feed: "https://www.reddit.com/r/pics/",
    });
  });
});

/**
 * @param {{ openPopup?: () => Promise<unknown>,
 *           sendStart?: (tabId: number) => Promise<unknown> }} [options]
 */
function setup({ openPopup = () => Promise.resolve(), sendStart } = {}) {
  /** @type {string[]} */
  const calls = [];
  const deps = {
    action: {
      setPopup: vi.fn(async ({ popup }) => {
        calls.push(`setPopup:${popup}`);
      }),
      openPopup: vi.fn(() => {
        calls.push("openPopup");
        return openPopup();
      }),
    },
    tabs: { create: vi.fn(async () => {}) },
    sendStart: vi.fn(sendStart ?? (async () => ({ ok: true }))),
    pageUrl: (/** @type {string} */ path) => `chrome-extension://id${path}`,
    log: { info: vi.fn() },
  };
  return { deps, calls, click: createActionClickHandler(deps) };
}

describe("createActionClickHandler", () => {
  it("starts the slideshow on a Reddit feed", async () => {
    const { deps, click } = setup();
    await click({ id: 3, url: "https://www.reddit.com/r/pics/" });
    expect(deps.sendStart).toHaveBeenCalledWith(3);
    expect(deps.action.openPopup).not.toHaveBeenCalled();
  });

  it("opens the notice in the click's own turn off Reddit, then clears it", async () => {
    const { deps, calls, click } = setup();
    const done = click({ id: 3 });
    // Both calls happen before the first await (Firefox's user-action rule).
    expect(calls).toEqual([
      "setPopup:/notice.html?reason=offReddit&tab=3",
      "openPopup",
    ]);
    await done;
    expect(calls.at(-1)).toBe("setPopup:");
    expect(deps.sendStart).not.toHaveBeenCalled();
    expect(deps.tabs.create).not.toHaveBeenCalled();
  });

  it("points a post page at its subreddit", async () => {
    const { calls, click } = setup();
    await click({
      id: 4,
      url: "https://www.reddit.com/r/pics/comments/abc/t/",
    });
    expect(calls[0]).toBe(
      `setPopup:/notice.html?reason=post&tab=4&feed=${encodeURIComponent(
        "https://www.reddit.com/r/pics/",
      )}`,
    );
  });

  it("asks for a reload when a Reddit tab has no content script", async () => {
    const { calls, click } = setup({
      sendStart: async () => {
        throw new Error("Receiving end does not exist.");
      },
    });
    await click({ id: 5, url: "https://www.reddit.com/r/pics/" });
    expect(calls[0]).toBe("setPopup:/notice.html?reason=reload&tab=5");
  });

  it("opens the notice in a tab when the popup can't open", async () => {
    const { deps, calls, click } = setup({
      openPopup: () => Promise.reject(new Error("unsupported")),
    });
    await click({ id: 6 });
    expect(deps.tabs.create).toHaveBeenCalledWith({
      url: "chrome-extension://id/notice.html?reason=offReddit&tab=6&view=tab",
    });
    expect(calls.at(-1)).toBe("setPopup:");
  });
});

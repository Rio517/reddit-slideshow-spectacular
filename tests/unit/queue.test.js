import { describe, expect, it } from "vitest";
import {
  buildQueuePage,
  fetchQueuePage,
  shouldFetchNextPage,
  unreadSlideCount,
} from "../../lib/queue.js";
import fixture from "../fixtures/reddit-json/subreddit-direct-images.json";

describe("buildQueuePage", () => {
  it("builds a media-only page from a Reddit listing", () => {
    const page = buildQueuePage(fixture);

    expect(page).toMatchObject({
      after: "t3_beta",
      postsScanned: 2,
      exhausted: false,
    });
    expect(page.slides).toHaveLength(2);
    expect(page.slides.map((slide) => slide.id)).toEqual([
      "t3_alpha:0",
      "t3_gamma:0",
    ]);
  });

  it("counts posts scanned even when no slides are produced", () => {
    const page = buildQueuePage({
      data: {
        after: "t3_text",
        children: [
          {
            kind: "t3",
            data: {
              name: "t3_text",
              title: "Text post",
              post_hint: "self",
              url: "https://old.reddit.com/r/example/comments/text/text_post/",
            },
          },
        ],
      },
    });

    expect(page.postsScanned).toBe(1);
    expect(page.slides).toEqual([]);
    expect(page.after).toBe("t3_text");
  });
});

describe("fetchQueuePage", () => {
  it("fetches a listing and returns a built queue page of slides", async () => {
    /** @type {typeof fetch} */
    const fetchImpl = async () =>
      new Response(JSON.stringify(fixture), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    const page = await fetchQueuePage(
      "https://old.reddit.com/r/example/",
      {},
      fetchImpl,
    );

    expect(page).toMatchObject({
      after: "t3_beta",
      postsScanned: 2,
      exhausted: false,
    });
    expect(page.slides.map((s) => s.id)).toEqual(["t3_alpha:0", "t3_gamma:0"]);
  });

  it("resolves slide permalinks against the page origin (no old.reddit dependency)", async () => {
    /** @type {typeof fetch} */
    const fetchImpl = async () =>
      new Response(JSON.stringify(fixture), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    const page = await fetchQueuePage(
      "https://www.reddit.com/r/example/",
      {},
      fetchImpl,
    );
    expect(
      page.slides[0].permalink?.startsWith("https://www.reddit.com/"),
    ).toBe(true);
  });

  it("passes the after cursor through to pagination", async () => {
    /** @type {Array<string>} */
    const urls = [];
    /** @type {typeof fetch} */
    const fetchImpl = async (url) => {
      urls.push(String(url));
      return new Response(JSON.stringify(fixture), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    await fetchQueuePage(
      "https://old.reddit.com/r/example/",
      { after: "t3_beta" },
      fetchImpl,
    );

    expect(urls[0]).toBe(
      "https://old.reddit.com/r/example/.json?raw_json=1&after=t3_beta",
    );
  });
});

describe("shouldFetchNextPage", () => {
  it("prefetches based on unread slides and scanned posts, not produced slides only", () => {
    expect(
      shouldFetchNextPage({
        after: "t3_next",
        currentIndex: 0,
        slideCount: 1,
        postsScannedSinceFetch: 25,
      }),
    ).toBe(true);
  });

  it("does not fetch when exhausted or not near the end", () => {
    expect(
      shouldFetchNextPage({
        after: null,
        currentIndex: 8,
        slideCount: 10,
        postsScannedSinceFetch: 25,
      }),
    ).toBe(false);

    expect(
      shouldFetchNextPage({
        after: "t3_next",
        currentIndex: 0,
        slideCount: 10,
        postsScannedSinceFetch: 25,
      }),
    ).toBe(false);
  });
});

describe("unreadSlideCount", () => {
  it("counts slides after the current index", () => {
    expect(unreadSlideCount({ currentIndex: 2, slideCount: 5 })).toBe(2);
  });
});

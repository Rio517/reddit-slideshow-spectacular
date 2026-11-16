import { describe, expect, it } from "vitest";
import {
  buildQueuePage,
  queuePageFromListing,
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

describe("queuePageFromListing", () => {
  it("returns a built queue page of slides", () => {
    const page = queuePageFromListing(
      fixture,
      "https://old.reddit.com/r/example/",
    );
    expect(page).toMatchObject({
      after: "t3_beta",
      postsScanned: 2,
      exhausted: false,
    });
    expect(page.slides.map((s) => s.id)).toEqual(["t3_alpha:0", "t3_gamma:0"]);
  });

  it("resolves slide permalinks against the page origin (no old.reddit dependency)", () => {
    const page = queuePageFromListing(
      fixture,
      "https://www.reddit.com/r/example/",
    );
    expect(
      page.slides[0].permalink?.startsWith("https://www.reddit.com/"),
    ).toBe(true);
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

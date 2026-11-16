import { describe, expect, it } from "vitest";
import { toListingHtmlUrl, toWwwListingUrl } from "../../lib/reddit-url.js";

describe("toListingHtmlUrl", () => {
  it("keeps an old Reddit listing URL", () => {
    expect(toListingHtmlUrl("https://old.reddit.com/r/pics/")).toBe(
      "https://old.reddit.com/r/pics/",
    );
  });

  it("preserves sort path and query parameters", () => {
    expect(toListingHtmlUrl("https://old.reddit.com/r/pics/top/?t=week")).toBe(
      "https://old.reddit.com/r/pics/top/?t=week",
    );
  });

  it("adds after pagination when provided", () => {
    expect(
      toListingHtmlUrl("https://old.reddit.com/r/pics/", { after: "t3_alpha" }),
    ).toBe("https://old.reddit.com/r/pics/?after=t3_alpha");
  });

  it("drops the hash and a .json suffix", () => {
    expect(
      toListingHtmlUrl("https://old.reddit.com/r/pics/.json#rs-slideshow"),
    ).toBe("https://old.reddit.com/r/pics/");
  });

  it("maps a www.reddit.com listing to old Reddit", () => {
    expect(toListingHtmlUrl("https://www.reddit.com/r/pics/top/?t=week")).toBe(
      "https://old.reddit.com/r/pics/top/?t=week",
    );
  });

  it("rejects comment permalinks because they are not a listing shape", () => {
    expect(() =>
      toListingHtmlUrl("https://old.reddit.com/r/pics/comments/abc/title/"),
    ).toThrow("Unsupported Reddit listing URL");
  });

  it("rejects non-Reddit URLs", () => {
    expect(() => toListingHtmlUrl("https://example.com/r/pics/")).toThrow(
      "Unsupported Reddit listing URL",
    );
  });
});

describe("toWwwListingUrl", () => {
  const base = "https://www.reddit.com/svc/shreddit/community-more-posts";

  it("maps a subreddit feed, hot by default", () => {
    expect(toWwwListingUrl("https://www.reddit.com/r/aww/")).toBe(
      `${base}/hot/?name=aww`,
    );
    expect(toWwwListingUrl("https://www.reddit.com/r/aww")).toBe(
      `${base}/hot/?name=aww`,
    );
  });

  it.each(["hot", "new", "top", "rising", "controversial"])(
    "maps the %s sort",
    (sort) => {
      expect(toWwwListingUrl(`https://www.reddit.com/r/aww/${sort}/`)).toBe(
        `${base}/${sort}/?name=aww`,
      );
    },
  );

  it("carries the time window for top and controversial only", () => {
    expect(toWwwListingUrl("https://www.reddit.com/r/aww/top/?t=week")).toBe(
      `${base}/top/?name=aww&t=week`,
    );
    expect(
      toWwwListingUrl("https://www.reddit.com/r/aww/controversial/?t=year"),
    ).toBe(`${base}/controversial/?name=aww&t=year`);
    expect(toWwwListingUrl("https://www.reddit.com/r/aww/new/?t=week")).toBe(
      `${base}/new/?name=aww`,
    );
    expect(toWwwListingUrl("https://www.reddit.com/r/aww/top/?t=bogus")).toBe(
      `${base}/top/?name=aww`,
    );
  });

  it("sends the cursor as base64 of the fullname", () => {
    expect(
      toWwwListingUrl("https://www.reddit.com/r/aww/new/", {
        after: "t3_1xy18s9",
      }),
    ).toBe(`${base}/new/?name=aww&after=dDNfMXh5MThzOQ%3D%3D`);
  });

  it.each([
    "https://old.reddit.com/r/aww/",
    "https://www.reddit.com/",
    "https://www.reddit.com/r/all/",
    "https://www.reddit.com/r/popular/top/",
    "https://www.reddit.com/r/aww+cats/",
    "https://www.reddit.com/user/someone/",
    "https://www.reddit.com/user/someone/submitted/",
    "https://www.reddit.com/search/?q=cats",
    "https://www.reddit.com/r/aww/search/?q=cats",
    "https://www.reddit.com/r/aww/comments/abc/title/",
    "https://www.reddit.com/r/aww/wiki/index",
  ])("leaves %s to old Reddit", (url) => {
    expect(toWwwListingUrl(url)).toBeNull();
  });
});

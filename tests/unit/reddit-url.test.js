import { describe, expect, it } from "vitest";
import { toListingHtmlUrl } from "../../lib/reddit-url.js";

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

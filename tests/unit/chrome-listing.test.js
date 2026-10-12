import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  MAX_PLATFORM_NAMES,
  buildChromeListings,
  chromeListing,
  platformNames,
} from "../../scripts/chrome-listing.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const listings = buildChromeListings({ write: false });
const locales = Object.keys(listings);

describe("Chrome Web Store listings", () => {
  it("covers every listing locale", () => {
    expect(locales.sort()).toEqual(["ar", "de", "en", "es", "fr", "it"]);
  });

  it("docs/store-listing/chrome is in sync (run `npm run listing:chrome`)", () => {
    for (const lang of locales) {
      const onDisk = readFileSync(
        join(root, "docs", "store-listing", "chrome", `${lang}.md`),
        "utf8",
      );
      expect(onDisk).toBe(listings[lang]);
    }
  });

  it.each(locales)("%s names at most five platforms", (lang) => {
    // Chrome's keyword-stuffing policy; the main listings name eight.
    const names = platformNames(listings[lang]);
    expect(names.length).toBeLessThanOrEqual(MAX_PLATFORM_NAMES);
    expect(names).toEqual(["Reddit", "Imgur", "Redgifs"]);
  });

  it.each(locales)("%s carries no what's-new block", (lang) => {
    expect(listings[lang]).not.toMatch(/\bV\d+\.\d+\.\d+/);
    expect(listings[lang]).not.toContain("/releases");
  });

  it.each(locales)("%s links to the full host list", (lang) => {
    expect(listings[lang]).toContain(
      "https://rio517.github.io/reddit-slideshow-spectacular/#program",
    );
  });

  it("fails when the main listing no longer has a line it rewrites", () => {
    const source = readFileSync(
      join(root, "docs", "store-listing", "en.md"),
      "utf8",
    ).replace("- Catbox video and image files", "- Catbox files");
    expect(() => chromeListing(source, "en")).toThrow(/expected one line/);
  });
});

describe("platformNames", () => {
  it("counts a domain as its platform, once", () => {
    expect(platformNames("i.redd.it, v.redd.it and old.reddit.com")).toEqual([
      "Reddit",
    ]);
    expect(platformNames("AirPlay or Chromecast")).toEqual([
      "AirPlay",
      "Chromecast",
    ]);
  });
});

// @ts-nocheck - a Playwright runtime harness (browser/extension-context
// callbacks: chrome.*, page.evaluate). Validated by running it, not by tsc.
// End-to-end smoke test through the REAL built extension in a real Chromium
// (Playwright, --headless=new). It loads .output/chrome-mv3, freezes settings,
// and mocks the reddit listing + media so the run is deterministic and never
// depends on live subreddit content (reddit also 403s headless/datacenter
// requests). This exercises the whole stack the unit tests can't: content-script
// injection, background messaging, the privileged listing fetch, slide building,
// and the overlay render - in a real browser.
//
// Slow (a real browser launch), so it's NOT part of `npm test` (Vitest). Run it
// with `npm run test:prod` (which builds the Chrome target first).
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const EXT = resolve(process.cwd(), ".output/chrome-mv3");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const FEED = "https://old.reddit.com/r/slideshowspectacular/#rs-slideshow";

// A fixed two-image listing - the assertions key off these exact values, so the
// run is independent of whatever real posts the subreddit holds.
const LISTING = {
  kind: "Listing",
  data: {
    after: null,
    children: [
      post(
        "one",
        "A test sunset",
        "demo_user",
        "https://i.redd.it/one.jpg",
        1920,
        1080,
      ),
      post(
        "two",
        "Another test photo",
        "second_user",
        "https://i.redd.it/two.jpg",
        1600,
        900,
      ),
      // Portrait and far past the pan & zoom oversize gate at any window size,
      // for the mid-pan clipping check.
      post(
        "tall",
        "A tall test tower",
        "third_user",
        "https://i.redd.it/tall.jpg",
        3500,
        6250,
      ),
    ],
  },
};
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect width="1920" height="1080" fill="#356"/></svg>`;
const TALL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="3500" height="6250"><rect width="3500" height="6250" fill="#635"/></svg>`;

/** @param {string} id @param {string} title @param {string} author @param {string} url @param {number} w @param {number} h */
function post(id, title, author, url, w, h) {
  return {
    kind: "t3",
    data: {
      name: `t3_${id}`,
      title,
      author,
      subreddit: "slideshowspectacular",
      permalink: `/r/slideshowspectacular/comments/${id}/x/`,
      url,
      post_hint: "image",
      over_18: false,
      preview: { images: [{ source: { url, width: w, height: h } }] },
    },
  };
}

let failures = 0;
/** @param {string} name @param {() => void} fn */
function check(name, fn) {
  try {
    fn();
    console.log("  ✓", name);
  } catch (err) {
    failures += 1;
    console.error("  ✗", name, "-", err.message);
  }
}

/** Read the overlay's meta text out of the shadow root. @param {import("playwright").Page} page */
function readMeta(page) {
  return page.evaluate(() => {
    const sr = document.querySelector("#reddit-slideshow-host")?.shadowRoot;
    const q = (s) => sr?.querySelector(s)?.textContent?.trim() ?? null;
    const media = sr?.querySelector(".reddit-slideshow-media");
    return {
      counter: q(".rs-meta__counter"),
      title: q(".rs-meta__title-text"),
      author: q(".rs-meta__author"),
      subreddit: q(".rs-meta__subreddit"),
      domain: q(".rs-meta__domain"),
      res: q(".rs-meta__res"),
      status: q(".rs-status"),
      mediaTag: media?.tagName ?? null,
      mediaSrc: media?.getAttribute("src") ?? null,
      jumpItems: [...(sr?.querySelectorAll(".rs-jump-panel__item") ?? [])]
        .length,
    };
  });
}

async function main() {
  if (!existsSync(join(EXT, "manifest.json"))) {
    console.error(
      `Built extension not found at ${EXT}. Run \`npm run build:chrome\` first.`,
    );
    process.exit(1);
  }
  const userDataDir = await mkdtemp(join(tmpdir(), "rs-e2e-"));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      "--headless=new",
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
    ],
    userAgent: UA,
  });

  try {
    // Wait for the extension's background service worker, then freeze settings:
    // autoplay off so the show stays on slide 1, NSFW included so nothing depends
    // on a session.
    const sw =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker", { timeout: 15000 }));
    await sw.evaluate(() =>
      chrome.storage.local.set({ autoplay: false, includeNsfw: true }),
    );

    // Mock the listing JSON and the i.redd.it media (deterministic; also dodges
    // reddit's 403 on a headless/datacenter request).
    await context.route("**/*.json?*", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(LISTING),
      }),
    );
    await context.route("https://i.redd.it/**", (route) =>
      route.fulfill({
        contentType: "image/svg+xml",
        body: route.request().url().includes("tall") ? TALL_SVG : SVG,
      }),
    );

    const page = await context.newPage();
    await page.goto(FEED, { waitUntil: "domcontentloaded", timeout: 45000 });
    // The #rs-slideshow hash auto-starts the show; wait for the first image frame.
    await page.waitForFunction(
      () =>
        Boolean(
          document
            .querySelector("#reddit-slideshow-host")
            ?.shadowRoot?.querySelector("img.reddit-slideshow-media"),
        ),
      { timeout: 25000 },
    );

    const slide1 = await readMeta(page);
    check("the overlay mounts and renders the first slide as an image", () => {
      assert.equal(slide1.mediaTag, "IMG");
      assert.equal(slide1.mediaSrc, "https://i.redd.it/one.jpg");
      assert.equal(slide1.status, null);
    });
    check("the counter reflects the listing length", () =>
      assert.equal(slide1.counter, "1 / 3"),
    );
    check("the byline shows author, subreddit, domain, and resolution", () => {
      assert.equal(slide1.title, "A test sunset");
      assert.equal(slide1.author, "/u/demo_user");
      assert.equal(slide1.subreddit, "/r/slideshowspectacular");
      assert.equal(slide1.domain, "i.redd.it");
      assert.equal(slide1.res, "1920×1080");
    });

    // The counter opens the jump-to-post list.
    await page.evaluate(() =>
      document
        .querySelector("#reddit-slideshow-host")
        ?.shadowRoot?.querySelector(".rs-meta__counter")
        ?.dispatchEvent(new Event("click", { bubbles: true })),
    );
    const jump = await readMeta(page);
    check("the jump-to-post list lists every loaded post", () =>
      assert.equal(jump.jumpItems, 3),
    );

    // The right arrow advances to the next slide.
    await page.evaluate(() =>
      document
        .querySelector("#reddit-slideshow-host")
        ?.shadowRoot?.host?.focus?.(),
    );
    await page.keyboard.press("ArrowRight");
    await page
      .waitForFunction(
        () =>
          document
            .querySelector("#reddit-slideshow-host")
            ?.shadowRoot?.querySelector(".rs-meta__counter")
            ?.textContent?.trim() === "2 / 3",
        { timeout: 8000 },
      )
      .catch(() => {});
    const slide2 = await readMeta(page);
    check("the right arrow advances to the second slide", () => {
      assert.equal(slide2.counter, "2 / 3");
      assert.equal(slide2.author, "/u/second_user");
      assert.equal(slide2.res, "1600×900");
    });

    // Regression: the chrome must still auto-hide after the idle dwell even when
    // a control keeps focus from a *mouse* click - focus-visible is false then,
    // so focusInChrome() no longer pins it open. (jsdom can't tell mouse from
    // keyboard focus, so this only reproduces in a real browser.)
    const btnBox = await page.evaluate(() => {
      const sr = document.querySelector("#reddit-slideshow-host")?.shadowRoot;
      const r = sr
        ?.querySelector(".rs-controls .rs-btn")
        ?.getBoundingClientRect();
      return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
    });
    if (btnBox) {
      await page.mouse.click(btnBox.x, btnBox.y); // focus lands on the control
      await page.mouse.move(640, 400); // pointer off the rail, as if watching
    }
    const wentIdle = await page
      .waitForFunction(
        () => {
          const sr = document.querySelector(
            "#reddit-slideshow-host",
          )?.shadowRoot;
          const root = sr?.getElementById("reddit-slideshow-root");
          const controls = sr?.querySelector(".rs-controls");
          return Boolean(
            root?.classList.contains("rs-idle") &&
            controls &&
            window.getComputedStyle(controls).opacity === "0",
          );
        },
        { timeout: 6000 },
      )
      .then(() => true)
      .catch(() => false);
    check(
      "the chrome auto-hides on idle even with a mouse-focused control",
      () => assert.equal(wentIdle, true),
    );

    // Regression: a pan-zoomed portrait image must spread into the viewport's
    // side space, not stay clipped to its own fitted column (the .rs-slide
    // frame). Enable the toggle through the inline settings panel (synchronous
    // with the overlay's live settings - no storage-propagation race), advance
    // to the tall slide, seek the animation to mid-pan, and hit-test a point in
    // what was the side letterbox: the zoomed image must be painted there.
    await page.evaluate(() => {
      const sr = document.querySelector("#reddit-slideshow-host")?.shadowRoot;
      const rows = sr?.querySelectorAll(".rs-set__check") ?? [];
      for (const row of rows) {
        if (!row.textContent?.includes("Pan & zoom")) continue;
        const input = row.querySelector("input");
        input.checked = true;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    await page.evaluate(() =>
      document
        .querySelector("#reddit-slideshow-host")
        ?.shadowRoot?.host?.focus?.(),
    );
    // Step forward until the tall slide is current (the idle check's control
    // click above may have navigated), then wait for its animation.
    const onTallSlide = () =>
      page
        .waitForFunction(
          () =>
            document
              .querySelector("#reddit-slideshow-host")
              ?.shadowRoot?.querySelector(".reddit-slideshow-media")
              ?.getAttribute("src") === "https://i.redd.it/tall.jpg" &&
            (document
              .querySelector("#reddit-slideshow-host")
              ?.shadowRoot?.querySelector(".reddit-slideshow-media")
              ?.getAnimations()?.length ?? 0) > 0,
          { timeout: 3000 },
        )
        .then(() => true)
        .catch(() => false);
    for (let presses = 0; presses < 4; presses += 1) {
      await page.keyboard.press("ArrowRight");
      if (await onTallSlide()) break;
    }
    const panZoom = await page.evaluate(() => {
      const sr = document.querySelector("#reddit-slideshow-host")?.shadowRoot;
      const img = sr?.querySelector("img.reddit-slideshow-media");
      const anim = img?.getAnimations()?.[0];
      if (!img || !anim) {
        // Failure context: which link of the chain broke.
        return {
          animated: false,
          src: img?.getAttribute("src") ?? null,
          counter: sr?.querySelector(".rs-meta__counter")?.textContent ?? null,
          toggleChecked: [...(sr?.querySelectorAll(".rs-set__check") ?? [])]
            .find((r) => r.textContent?.includes("Pan & zoom"))
            ?.querySelector("input")?.checked,
          reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches,
        };
      }
      const sideX = window.innerWidth * 0.05;
      const midY = window.innerHeight / 2;
      const hits = () => sr.elementFromPoint(sideX, midY) === img;
      // At time 0 (scale 1) the probe point must sit outside the fitted
      // column, or it wouldn't prove anything about the zoomed phase.
      const probeOutsideFit = img.getBoundingClientRect().left > sideX;
      const sideHitAtRest = hits();
      anim.currentTime = Number(anim.effect.getTiming().duration) / 2;
      const sideHitMidPan = hits();
      return { animated: true, probeOutsideFit, sideHitAtRest, sideHitMidPan };
    });
    check("the tall slide runs the pan & zoom animation", () =>
      assert.equal(panZoom.animated, true, JSON.stringify(panZoom)),
    );
    check("mid-pan, the zoomed image fills the side letterbox space", () => {
      assert.equal(panZoom.probeOutsideFit, true);
      assert.equal(panZoom.sideHitAtRest, false);
      assert.equal(panZoom.sideHitMidPan, true);
    });

    // Manual inspect-zoom: the show is paused (autoplay off), so scrolling
    // over the slide zooms the frame at the pointer; Escape then resets the
    // zoom instead of closing the show.
    const slideTransform = () =>
      page.evaluate(
        () =>
          /** @type {HTMLElement | null} */ (
            document
              .querySelector("#reddit-slideshow-host")
              ?.shadowRoot?.querySelector(".rs-slide")
          )?.style.transform ?? "",
      );
    await page.mouse.move(640, 360);
    await page.mouse.wheel(0, -240);
    const zoomedTransform = await slideTransform();
    check("scrolling over a paused slide zooms the frame", () =>
      assert.match(zoomedTransform, /scale\(/),
    );

    // Dragging the zoomed slide pans it (and its release-click must not
    // close the show - the Escape check below still finds it open).
    await page.mouse.move(640, 360);
    await page.mouse.down();
    await page.mouse.move(560, 300, { steps: 4 });
    await page.mouse.up();
    const draggedTransform = await slideTransform();
    check("dragging the zoomed slide pans it", () => {
      assert.match(draggedTransform, /scale\(/);
      assert.notEqual(draggedTransform, zoomedTransform);
    });

    await page.keyboard.press("Escape");
    const afterEscape = await page.evaluate(() => {
      const sr = document.querySelector("#reddit-slideshow-host")?.shadowRoot;
      const frame = /** @type {HTMLElement | null} */ (
        sr?.querySelector(".rs-slide")
      );
      return {
        transform: frame?.style.transform ?? "",
        open: Boolean(sr?.querySelector(".rs-meta__counter")),
      };
    });
    check("Escape resets the zoom and keeps the show open", () => {
      assert.equal(afterEscape.transform, "");
      assert.equal(afterEscape.open, true);
    });
  } finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }

  if (failures > 0) {
    console.error(`\n${failures} e2e check(s) failed.`);
    process.exit(1);
  }
  console.log("\nall e2e checks passed.");
}

await main();

// Captures the store + site hero shots offline (`npm run heroes`, part of
// `npm run ship`): the REAL overlay + session (hero-harness.js) over a
// hand-made old-Reddit listing (hero.html), with the demo media fulfilled from
// RS_MEDIA (see demo-media.mjs). No Reddit, cookies, or extension install is
// involved, so the shots are deterministic. Outputs:
//
//   docs/screenshots/hero-chrome.jpg   1280×800 JPEG - Chrome Web Store
//   docs/screenshots/hero-firefox.png  1280×800 PNG  - Firefox Add-ons
//   docs/slideshow-demo.png            1456×835 PNG  - README + website hero
//
// Needs the Playwright Chromium and Firefox binaries
// (npx playwright install chromium firefox). Any failure exits non-zero.
//
//   SHIP_HERO_TITLE overrides the slide the shot pauses on.

import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, normalize, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium, firefox } from "playwright";
import { ensureMedia, fulfilRedditMedia } from "./demo-media.mjs";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const harnessSrc = join(root, "scripts", "slideshow-harness");
const HERO_TITLE = process.env.SHIP_HERO_TITLE ?? "Spectacular Puppy";
// Store screenshot canvas (both stores) and the larger README/site hero.
const STORE = { width: 1280, height: 800 };
const SITE = { width: 1456, height: 835 };

const OUT = {
  chrome: join(root, "docs", "screenshots", "hero-chrome.jpg"),
  firefox: join(root, "docs", "screenshots", "hero-firefox.png"),
  site: join(root, "docs", "slideshow-demo.png"),
};

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

function serve(dir) {
  const server = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? "/").split("?")[0]);
    const full = normalize(join(dir, path === "/" ? "/index.html" : path));
    if (!full.startsWith(dir)) return res.writeHead(403).end();
    const stream = createReadStream(full);
    stream.on("open", () => {
      res.writeHead(200, {
        "content-type": MIME[extname(full)] ?? "application/octet-stream",
      });
      stream.pipe(res);
    });
    stream.on("error", () => res.writeHead(404).end());
  });
  return new Promise((res) =>
    server.listen(0, "127.0.0.1", () =>
      res({ server, port: server.address().port }),
    ),
  );
}

// Content lives in the overlay's open shadow root. Single-class selectors
// only: compound/descendant ones match nothing in Firefox page context.
const TITLE = `document.querySelector("#reddit-slideshow-host")?.shadowRoot?.querySelector(".rs-meta__title-text")?.textContent`;

/** Step to the hero slide, let it decode and the transition settle, wake the rail. */
async function stageHero(page, viewport) {
  await page.waitForSelector("#reddit-slideshow-root", {
    state: "visible",
    timeout: 20000,
  });
  await page.waitForFunction(`Boolean(${TITLE})`, undefined, {
    timeout: 20000,
  });
  await page.mouse.move(viewport.width / 2, viewport.height - 80);
  for (let i = 0; i < 12 && (await page.evaluate(TITLE)) !== HERO_TITLE; i++) {
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(150);
  }
  if ((await page.evaluate(TITLE)) !== HERO_TITLE)
    throw new Error(
      `could not reach the "${HERO_TITLE}" slide (stuck on "${await page.evaluate(TITLE)}")`,
    );
  // The last media element is the incoming slide; wait until it has decoded.
  await page.waitForFunction(
    `(() => {
      const sh = document.querySelector("#reddit-slideshow-host").shadowRoot;
      const img = [...sh.querySelectorAll(".reddit-slideshow-media")]
        .filter((el) => el.tagName === "IMG")
        .pop();
      return Boolean(img && img.complete && img.naturalWidth);
    })()`,
    undefined,
    { timeout: 20000 },
  );
  await page.waitForTimeout(1200); // let the fade settle
  await page.mouse.move(viewport.width / 2 + 40, viewport.height - 100);
  await page.waitForTimeout(400);
}

async function shoot(browserType, viewport, url, shots) {
  const browser = await browserType.launch();
  try {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    await page.route("https://i.redd.it/**", fulfilRedditMedia);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    for (const shot of shots) {
      if (shot.viewport) await page.setViewportSize(shot.viewport);
      await stageHero(page, shot.viewport ?? viewport);
      await page.screenshot(shot.options);
      console.log(`wrote ${shot.options.path}`);
    }
  } finally {
    await browser.close();
  }
}

async function main() {
  await ensureMedia();
  const dir = await mkdtemp(join(tmpdir(), "rs-hero-"));
  const { server, port } = await serve(dir);
  try {
    await build({
      entryPoints: [join(harnessSrc, "hero-harness.js")],
      bundle: true,
      format: "esm",
      outfile: join(dir, "harness.js"),
      alias: { "wxt/browser": join(harnessSrc, "stub-browser.js") },
      loader: { ".css": "text" },
      logLevel: "silent",
    });
    await copyFile(join(harnessSrc, "hero.html"), join(dir, "index.html"));
    const url = `http://127.0.0.1:${port}/index.html`;

    await shoot(chromium, STORE, url, [
      { options: { path: OUT.chrome, type: "jpeg", quality: 90 } },
      { viewport: SITE, options: { path: OUT.site } },
    ]);

    try {
      await shoot(firefox, STORE, url, [{ options: { path: OUT.firefox } }]);
    } catch (err) {
      if (/Executable doesn't exist/.test(String(err)))
        throw new Error(
          "Playwright Firefox is missing - run `npx playwright install firefox`",
        );
      throw err;
    }
  } finally {
    server.close();
    await rm(dir, { recursive: true, force: true });
  }
}

await main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

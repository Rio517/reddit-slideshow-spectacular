// Regenerates the offline docs/store screenshots under docs/screenshots/: the
// options page (light + dark) and a deterministic slideshow shot. The live
// store/site hero shots are scripts/ship-heroes.mjs's job.
// Options shots build firefox-mv3, serve it statically, and
// drive Chromium to render entrypoints/options/index.html. The slideshow shot
// is fully offline and deterministic: it bundles a tiny harness that mounts the
// REAL overlay + session over fixture image slides (scripts/slideshow-harness/)
// and fulfils the i.redd.it media URLs with inline SVG, so no extension, network
// or live Reddit is involved. The capture is still best-effort: any failure is
// logged and skipped, never fatal.

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const outDir = join(root, ".output", "firefox-mv3");
const shotsDir = join(root, "docs", "screenshots");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

function run(cmd, args) {
  return new Promise((res, rej) => {
    const child = spawn(cmd, args, { cwd: root, stdio: "inherit" });
    child.on("error", rej);
    child.on("exit", (code) =>
      code === 0 ? res() : rej(new Error(`${cmd} exited ${code}`)),
    );
  });
}

// Minimal static file server scoped to the build output dir.
function serve(dir) {
  const server = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? "/").split("?")[0]);
    const full = normalize(join(dir, path === "/" ? "/index.html" : path));
    if (!full.startsWith(dir)) {
      res.writeHead(403).end();
      return;
    }
    const stream = createReadStream(full);
    stream.on("open", () => {
      res.writeHead(200, {
        "content-type": MIME[extname(full)] ?? "application/octet-stream",
      });
      stream.pipe(res);
    });
    stream.on("error", () => res.writeHead(404).end());
  });
  return new Promise((res) => {
    server.listen(0, "127.0.0.1", () =>
      res({ server, port: server.address().port }),
    );
  });
}

// Set representative control states so the shot looks like a real config.
// main.js throws (no browser.storage outside the extension), so the form is
// left at HTML defaults until we drive it here.
function applyState() {
  const check = (id, on) => {
    const el = document.getElementById(id);
    if (el) el.checked = on;
  };
  check("autoplay", true);
  check("startMuted", true);
  check("includeNsfw", false);
  check("dedupe", true);
  check("alwaysShowMeta", true);
  check("contentDedup", false);
  check("panZoom", true);

  const card = document.getElementById("panZoomCard");
  if (card) card.dataset.off = "false";
  document.getElementById("panZoomDetails")?.setAttribute("open", "");

  const transition = document.getElementById("transition");
  if (transition) transition.value = "fade";

  for (const radio of document.querySelectorAll('input[name="timerBar"]')) {
    radio.checked = radio.value === "video";
  }

  const maxLoad = document.getElementById("maxLoadWaitSeconds");
  const maxLoadOut = document.getElementById("maxLoadWaitValue");
  if (maxLoad) maxLoad.value = "8";
  if (maxLoadOut) maxLoadOut.textContent = "8";
}

// An r/aww-style fixture image: a hued gradient with a soft paw, sized like a
// 3:2 photo. Vector, so it's crisp and identical every run. The slide's title
// shows in the overlay meta; the image only needs to look like a photo.
function fixtureSvg(url) {
  const n = Number(/rs-fixture-(\d+)/.exec(url)?.[1] ?? 1);
  const hue = (n * 53) % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1067" viewBox="0 0 1600 1067">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue} 62% 56%)"/>
      <stop offset="1" stop-color="hsl(${(hue + 38) % 360} 58% 36%)"/>
    </linearGradient>
    <radialGradient id="h" cx="0.32" cy="0.28" r="0.85">
      <stop offset="0" stop-color="rgba(255,255,255,0.35)"/>
      <stop offset="1" stop-color="rgba(255,255,255,0)"/>
    </radialGradient>
  </defs>
  <rect width="1600" height="1067" fill="url(#g)"/>
  <rect width="1600" height="1067" fill="url(#h)"/>
  <g fill="rgba(255,255,255,0.22)" transform="translate(800 560)">
    <ellipse cx="0" cy="60" rx="120" ry="95"/>
    <ellipse cx="-150" cy="-40" rx="46" ry="62"/>
    <ellipse cx="-55" cy="-110" rx="44" ry="60"/>
    <ellipse cx="55" cy="-110" rx="44" ry="60"/>
    <ellipse cx="150" cy="-40" rx="46" ry="62"/>
  </g>
</svg>`;
}

// Capture the overlay offline: bundle scripts/slideshow-harness/ (the real
// overlay + session over fixture image slides), serve it, and let Playwright
// fulfil the i.redd.it media URLs with inline SVG. Best-effort: any failure is
// logged and swallowed so the options shots and overall script still succeed.
async function captureSlideshow() {
  const harnessSrc = join(root, "scripts", "slideshow-harness");
  const dir = await mkdtemp(join(tmpdir(), "rs-shots-"));
  let browser;
  try {
    // Bundle the harness: resolves the lib/* imports and stubs wxt/browser so
    // settings.js bundles for a plain page.
    await build({
      entryPoints: [join(harnessSrc, "harness.js")],
      bundle: true,
      format: "esm",
      outfile: join(dir, "harness.js"),
      alias: { "wxt/browser": join(harnessSrc, "stub-browser.js") },
      // The overlay CSS is imported as a string and injected into the shadow
      // root (as the content script does), not linked into the page.
      loader: { ".css": "text" },
      logLevel: "silent",
    });
    await cp(join(harnessSrc, "index.html"), join(dir, "index.html"));

    const { server, port } = await serve(dir);
    try {
      browser = await chromium.launch();
      const page = await browser.newPage({
        viewport: { width: 1280, height: 800 },
      });
      await page.route("https://i.redd.it/**", (route) =>
        route.fulfill({
          contentType: "image/svg+xml",
          body: fixtureSvg(route.request().url()),
        }),
      );
      await page.goto(`http://127.0.0.1:${port}/index.html`, {
        waitUntil: "domcontentloaded",
      });
      await page.waitForSelector("#reddit-slideshow-root", {
        state: "visible",
        timeout: 20000,
      });
      await page.waitForSelector("img.reddit-slideshow-media", {
        state: "visible",
        timeout: 20000,
      });
      // Let the first slide decode and the entrance transition settle.
      await page.waitForTimeout(800);
      // Nudge activity so the idle auto-hide doesn't fade the control rail.
      await page.mouse.move(640, 740);
      await page.waitForTimeout(200);
      await page.screenshot({
        path: join(shotsDir, "slideshow.png"),
        fullPage: false,
      });
      console.log("captured docs/screenshots/slideshow.png");
    } finally {
      server.close();
    }
  } catch (err) {
    console.warn(
      `WARNING: offline slideshow capture skipped (${err?.message ?? err}). ` +
        "Options shots are unaffected.",
    );
  } finally {
    await browser?.close();
    await rm(dir, { recursive: true, force: true });
  }
}

async function main() {
  await run("npm", ["run", "build:firefox"]);
  await mkdir(shotsDir, { recursive: true });

  const { server, port } = await serve(outDir);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 560, height: 900 },
    });
    await page.goto(`http://127.0.0.1:${port}/options.html`, {
      waitUntil: "domcontentloaded",
    });
    await page.evaluate(applyState);

    for (const scheme of ["dark", "light"]) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.screenshot({
        path: join(shotsDir, `options-${scheme}.png`),
        fullPage: true,
      });
    }
  } finally {
    await browser.close();
    server.close();
  }

  await captureSlideshow();
}

await main();

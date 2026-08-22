// The website demo reel, end to end (`npm run reel`, part of `npm run ship`):
// renders the REAL overlay over the three demo slides (record-harness.js),
// screenshots each settled slide into RS_OUT (default the media dir), then
// crossfades shot1/2/3 (+ a wrap back to shot1) into the looping
// docs/slideshow.webm.
//
// Media files are fulfilled locally (the page never hits i.redd.it): puppy.png,
// cat1.png, cat2.gif live in RS_MEDIA (default /tmp/rs-media) and are
// downloaded from their public sources when absent. Needs ffmpeg
// (brew install ffmpeg) and the Playwright Chromium binary
// (npx playwright install chromium).

import { createServer } from "node:http";
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  rm,
  readFile,
  writeFile,
} from "node:fs/promises";
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { build } from "esbuild";
import { chromium } from "playwright";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const harnessSrc = join(root, "scripts", "slideshow-harness");
const mediaDir = process.env.RS_MEDIA ?? "/tmp/rs-media";
const outDir = process.env.RS_OUT ?? mediaDir;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

// i.redd.it path -> [local file, content type].
const FILES = {
  "/cpkr7nfk7j4h1.png": ["puppy.png", "image/png"],
  "/6pazgvbx5j4h1.png": ["cat1.png", "image/png"],
  "/rs-catgif.gif": ["cat2.gif", "image/gif"],
};

// Public sources for the demo media, fetched into RS_MEDIA when absent. The
// stills are the real r/SlideShowSpectacular posts; the cat gif uses Giphy's
// canonical media URL (the media<n>.giphy.com form Reddit serves carries an
// expiring token).
const SOURCES = {
  "puppy.png": "https://i.redd.it/cpkr7nfk7j4h1.png",
  "cat1.png": "https://i.redd.it/6pazgvbx5j4h1.png",
  "cat2.gif": "https://media.giphy.com/media/MDJ9IbxxvDUQM/giphy.gif",
};

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:141.0) Gecko/20100101 Firefox/141.0";

async function ensureMedia() {
  await mkdir(mediaDir, { recursive: true });
  for (const [name, url] of Object.entries(SOURCES)) {
    const dest = join(mediaDir, name);
    const cached = await access(dest).then(
      () => true,
      () => false,
    );
    if (cached) continue;
    const res = await fetch(url, { headers: { "user-agent": UA } });
    if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
    await writeFile(dest, Buffer.from(await res.arrayBuffer()));
    console.log(`fetched ${name}`);
  }
}

// Reel timing: each slide dwells DWELL seconds with FADE-second crossfades,
// and the cut lands one frame past the wrap fade so the loop closes on a
// clean shot1 (last frame == first frame).
const FPS = 30;
const DWELL = 3.2;
const FADE = 0.5;

async function encodeReel() {
  const still = (/** @type {number} */ n) => [
    ...["-loop", "1", "-t", String(DWELL), "-framerate", String(FPS)],
    ...["-i", join(outDir, `shot${n}.png`)],
  ];
  const xfade = (
    /** @type {string} */ inputs,
    /** @type {number} */ i,
    /** @type {string} */ out,
  ) =>
    `${inputs}xfade=transition=fade:duration=${FADE}:offset=${(i * (DWELL - FADE)).toFixed(1)}${out}`;
  const wrapDone = Math.round((3 * DWELL - 2 * FADE) * FPS);
  const graph = [
    xfade("[0][1]", 1, "[v01]"),
    xfade("[v01][2]", 2, "[v012]"),
    xfade("[v012][3]", 3, "[v0123]"),
    `[v0123]trim=end_frame=${wrapDone + 1},setpts=PTS-STARTPTS,format=yuv420p[v]`,
  ].join(";");
  const outFile = join(root, "docs", "slideshow.webm");
  const args = [
    ...["-y", "-loglevel", "error"],
    ...still(1),
    ...still(2),
    ...still(3),
    ...still(1),
    ...["-filter_complex", graph, "-map", "[v]"],
    ...["-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "33", "-row-mt", "1"],
    // bitexact: no encoder tags / random mux ids, so an unchanged overlay
    // re-encodes byte-identically and `ship` doesn't dirty the webm.
    ...["-flags", "+bitexact", "-fflags", "+bitexact"],
    ...["-r", String(FPS), outFile],
  ];
  await new Promise((done, fail) => {
    const ff = spawn("ffmpeg", args, { stdio: "inherit" });
    ff.on("error", (err) =>
      fail(
        /** @type {NodeJS.ErrnoException} */ (err).code === "ENOENT"
          ? new Error("ffmpeg not found - brew install ffmpeg")
          : err,
      ),
    );
    ff.on("exit", (code) =>
      code === 0 ? done(undefined) : fail(new Error(`ffmpeg exited ${code}`)),
    );
  });
  console.log(`encoded ${outFile}`);
}

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

async function main() {
  await ensureMedia();
  const dir = await mkdtemp(join(tmpdir(), "rs-rec-"));
  await build({
    entryPoints: [join(harnessSrc, "record-harness.js")],
    bundle: true,
    format: "esm",
    outfile: join(dir, "harness.js"),
    alias: { "wxt/browser": join(harnessSrc, "stub-browser.js") },
    loader: { ".css": "text" },
    logLevel: "silent",
  });
  await cp(join(harnessSrc, "index.html"), join(dir, "index.html"));

  const { server, port } = await serve(dir);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 800 },
    });
    await page.route("https://i.redd.it/**", async (route) => {
      const { pathname } = new URL(route.request().url());
      const entry = FILES[pathname];
      if (!entry) return route.fulfill({ status: 404, body: "" });
      return route.fulfill({
        contentType: entry[1],
        body: await readFile(join(mediaDir, entry[0])),
      });
    });
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

    for (let i = 1; i <= 3; i++) {
      // Let the slide decode and the fade settle, and keep the controls awake.
      await page.waitForTimeout(1000);
      await page.mouse.move(640, 720);
      await page.waitForTimeout(150);
      await page.screenshot({ path: join(outDir, `shot${i}.png`) });
      console.log(`captured shot${i}.png`);
      if (i < 3) {
        // Click the rail's next control (pierces the shadow root); the keydown
        // path needs real focus the headless page doesn't carry.
        await page.mouse.move(700, 400);
        await page.waitForTimeout(150);
        await page.click('[aria-label="Next (→)"]');
      }
    }
  } finally {
    await browser.close();
    server.close();
    await rm(dir, { recursive: true, force: true });
  }
  await encodeReel();
}

await main();

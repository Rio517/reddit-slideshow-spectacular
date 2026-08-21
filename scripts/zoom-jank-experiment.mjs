// Measures manual-zoom jank on a large bitmap in real Firefox vs Chromium:
// bundles the zoom-jank harness, serves it, fulfils the media URL with the
// JPEG given via IMG, then records the longest rAF gap around each wheel-zoom
// step. Variants (VARIANTS env, comma-separated) A/B compositing hints - see
// zoom-jank-harness.js. Make a test image with e.g.:
//   sips -z 12000 9000 public/icon/128.png --setProperty format jpeg --out /tmp/huge.jpg
//   IMG=/tmp/huge.jpg node scripts/zoom-jank-experiment.mjs
/* global performance, requestAnimationFrame */
import { createServer } from "node:http";
import { mkdtemp, cp, readFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium, firefox } from "playwright";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const harnessSrc = join(root, "scripts", "slideshow-harness");
const HUGE_JPG = process.env.IMG;
if (!HUGE_JPG) {
  console.error("Set IMG to a large test JPEG (see the header comment).");
  process.exit(1);
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

function serve(dir) {
  const server = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? "/").split("?")[0]);
    const full = join(dir, path === "/" ? "/index.html" : path);
    const stream = createReadStream(full);
    stream.on("open", () =>
      res.writeHead(200, {
        "content-type": MIME[extname(full)] ?? "application/octet-stream",
      }),
    );
    stream.on("error", () => res.writeHead(404).end());
    stream.pipe(res);
  });
  return new Promise((res) =>
    server.listen(0, "127.0.0.1", () =>
      res({ server, port: server.address().port }),
    ),
  );
}

const dir = await mkdtemp(join(tmpdir(), "rs-jank-"));
await build({
  entryPoints: [join(harnessSrc, "zoom-jank-harness.js")],
  bundle: true,
  format: "esm",
  outfile: join(dir, "harness.js"),
  alias: { "wxt/browser": join(harnessSrc, "stub-browser.js") },
  loader: { ".css": "text" },
  logLevel: "silent",
});
await cp(join(harnessSrc, "index.html"), join(dir, "index.html"));
const jpgBytes = await readFile(HUGE_JPG);
const { server, port } = await serve(dir);

async function measure(browserType, name, variant) {
  const browser = await browserType.launch({ headless: false });
  const page = await browser.newPage({
    viewport: { width: 1200, height: 800 },
  });
  await page.route("https://i.redd.it/**", (route) =>
    route.fulfill({ contentType: "image/jpeg", body: jpgBytes }),
  );
  await page.goto(`http://127.0.0.1:${port}/?v=${variant}`);
  await page.waitForFunction(
    () => {
      const host = document.getElementById("reddit-slideshow-host");
      const slideEl = host?.shadowRoot?.querySelector(".rs-slide");
      const img = slideEl?.querySelector("img");
      return !!img && img.complete && img.naturalWidth > 0;
    },
    { timeout: 30_000 },
  );
  // Let decode + the initial raster fully settle.
  await page.waitForTimeout(2500);
  await page.keyboard.press("Space"); // pause
  await page.waitForTimeout(500);

  await page.evaluate(() => {
    window.__gaps = [];
    let last = performance.now();
    const loop = () => {
      const now = performance.now();
      window.__gaps.push(now - last);
      last = now;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  await page.mouse.move(600, 400);

  const stepGaps = [];
  for (let i = 0; i < 4; i += 1) {
    await page.evaluate(() => {
      window.__gaps.length = 0;
    });
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(700);
    stepGaps.push(await page.evaluate(() => Math.max(...window.__gaps, 0)));
  }
  const scale = await page.evaluate(() => {
    const host = document.getElementById("reddit-slideshow-host");
    const slideEl = host?.shadowRoot?.querySelector(".rs-slide");
    return slideEl?.style.transform ?? "";
  });
  // SHOT=dir saves a per-run screenshot for eyeballing the zoomed pixels.
  if (process.env.SHOT) {
    await page.screenshot({
      path: join(process.env.SHOT, `${name}-${variant || "base"}.png`),
    });
  }
  await browser.close();
  const fmt = stepGaps.map((g) => `${Math.round(g)}ms`).join(" ");
  console.log(
    `${name.padEnd(9)} v=${(variant || "base").padEnd(6)} step-max-gaps: ${fmt}  final: ${scale}`,
  );
}

const variants = (process.env.VARIANTS ?? "").split(",");
for (const variant of variants) {
  await measure(firefox, "firefox", variant);
}
if (!process.env.SKIP_CHROMIUM) await measure(chromium, "chromium", "");
server.close();

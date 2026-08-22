// Captures the store + site hero shots from the REAL r/SlideShowSpectacular
// feed through the built extensions, using the maintainer's logged-in Firefox
// session (reddit cookies read from the local Firefox profile; values are
// never logged). Outputs:
//
//   docs/screenshots/hero-chrome.jpg   1280×800 JPEG - Chrome Web Store
//   docs/screenshots/hero-firefox.png  1280×800 PNG  - Firefox Add-ons
//   docs/slideshow-demo.png            1456×835 PNG  - README + website hero
//
// Chromium runs the .output/chrome-mv3 build via Playwright; Firefox runs the
// packaged firefox zip via selenium-webdriver (needs geckodriver on PATH -
// `brew install geckodriver`). Both auto-start the show via the #rs-slideshow
// hash, jump to the hero slide, pause, and shoot. Run via `npm run ship`
// (zips first) or `npm run heroes` against an existing build.
//
//   SHIP_HERO_TITLE overrides the slide the shot pauses on.

import { execFile as execFileCb } from "node:child_process";
import { existsSync } from "node:fs";
import {
  copyFile,
  glob,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright";
import { Builder } from "selenium-webdriver";
import firefox from "selenium-webdriver/firefox.js";

const execFile = promisify(execFileCb);

const root = resolve(new URL("../", import.meta.url).pathname);
const CHROME_EXT = join(root, ".output", "chrome-mv3");
const FEED = "https://old.reddit.com/r/slideshowspectacular/#rs-slideshow";
const HERO_TITLE = process.env.SHIP_HERO_TITLE ?? "Spectacular Puppy";
// Store screenshot canvas (both stores) and the larger README/site hero.
const STORE = { width: 1280, height: 800 };
const SITE = { width: 1456, height: 835 };
// A plain desktop UA: reddit 403s obvious headless agents.
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const OUT = {
  chrome: join(root, "docs", "screenshots", "hero-chrome.jpg"),
  firefox: join(root, "docs", "screenshots", "hero-firefox.png"),
  site: join(root, "docs", "slideshow-demo.png"),
};

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

// ---------------------------------------------------------------------------
// Page-context staging steps, as plain script bodies so the same code drives
// Playwright (wrapped as an expression) and Selenium (executed as a body).

// The counter fills in as soon as the queue renders - don't wait on media,
// the feed's first slides can be slow third-party loads.
const OVERLAY_READY = `
  const sh = document.querySelector("#reddit-slideshow-host")?.shadowRoot;
  return /\\d+ \\/ \\d+/.test(sh?.querySelector(".rs-meta__counter")?.textContent ?? "");`;

const DIAG = `
  const sh = document.querySelector("#reddit-slideshow-host")?.shadowRoot;
  return {
    url: location.href,
    pageTitle: document.title,
    overlayMounted: Boolean(sh),
    counter: sh?.querySelector(".rs-meta__counter")?.textContent ?? null,
    status: sh?.querySelector(".rs-status")?.textContent ?? null,
  };`;

// NOTE: page-context queries into the content script's shadow root behave
// oddly in Firefox - descendant/compound selectors match nothing. Stick to
// single-class selectors and walk children by hand.
const jumpBody = (title) => `
  const sh = document.querySelector("#reddit-slideshow-host").shadowRoot;
  const panel = sh.querySelector(".rs-jump-panel");
  if (panel.hidden) sh.querySelector(".rs-meta__counter").click();
  const row = [...panel.children].find(
    (el) =>
      el.classList.contains("rs-jump-panel__item") &&
      el.textContent.includes(${JSON.stringify(title)}),
  );
  row?.click();
  return Boolean(row);`;

const targetReady = (title) => `
  const sh = document.querySelector("#reddit-slideshow-host").shadowRoot;
  const img = [...sh.querySelectorAll(".reddit-slideshow-media")]
    .filter((el) => el.tagName === "IMG")
    .pop();
  return Boolean(
    img && img.complete && img.naturalWidth &&
    sh.querySelector(".rs-meta__title-text")?.textContent === ${JSON.stringify(title)},
  );`;

// Pause the show and lift the idle fade so the chrome is up for the shot.
const STAGE = `
  const sh = document.querySelector("#reddit-slideshow-host").shadowRoot;
  const play = sh.querySelector(".rs-btn--primary");
  if (!play.classList.contains("rs-btn--paused")) play.click();
  sh.querySelector("#reddit-slideshow-root").classList.remove("rs-idle");
  return {
    paused: play.classList.contains("rs-btn--paused"),
    counter: sh.querySelector(".rs-meta__counter").textContent,
    title: sh.querySelector(".rs-meta__title-text").textContent,
  };`;

/** @param {(body: string) => Promise<any>} run Execute a script body in the page. */
async function stageHero(run) {
  try {
    await poll(() => run(OVERLAY_READY), 40000, "the overlay queue");
  } catch (err) {
    console.error("diagnostics:", await run(DIAG).catch(() => "unavailable"));
    throw err;
  }
  if (!(await run(jumpBody(HERO_TITLE)))) {
    const rows = await run(`
      const sh = document.querySelector("#reddit-slideshow-host").shadowRoot;
      const panel = sh.querySelector(".rs-jump-panel");
      return {
        loggedIn: Boolean(document.querySelector("#header .user a[href*='/user/']")),
        counter: sh.querySelector(".rs-meta__counter")?.textContent,
        panelHidden: panel.hidden,
        panelChildren: panel.childElementCount,
        rows: [...sh.querySelectorAll(".rs-jump-panel__item .rs-jump-panel__name")]
          .map((n) => n.textContent),
      };`).catch(() => "unavailable");
    console.error("jump-list diagnostics:", rows);
    throw new Error(`"${HERO_TITLE}" not found in the jump list`);
  }
  await poll(
    () => run(targetReady(HERO_TITLE)),
    30000,
    `"${HERO_TITLE}" slide`,
  );
  await sleep(1200); // let the slide transition settle
  const state = await run(STAGE);
  await sleep(400);
  return state;
}

async function poll(check, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await sleep(500);
  }
  throw new Error(`timed out waiting for ${label}`);
}

// ---------------------------------------------------------------------------
// The logged-in session, borrowed from the local Firefox profile. Firefox
// stores cookies unencrypted in cookies.sqlite; work on a copy so a running
// Firefox can't lock us out, and keep values out of every log line.

async function firefoxProfileDir() {
  const profiles = [];
  for await (const p of glob(
    join(
      homedir(),
      "Library/Application Support/Firefox/Profiles/*.default-release",
    ),
  )) {
    profiles.push(p);
  }
  if (!profiles.length)
    throw new Error("no Firefox default-release profile found");
  return profiles[0];
}

/** Copy cookies.sqlite (+WAL) from the profile into a temp dir; return the dir. */
async function copiedCookieDb() {
  const profile = await firefoxProfileDir();
  const dir = await mkdtemp(join(tmpdir(), "rs-ff-cookies-"));
  for (const name of [
    "cookies.sqlite",
    "cookies.sqlite-wal",
    "cookies.sqlite-shm",
  ]) {
    if (existsSync(join(profile, name))) {
      await copyFile(join(profile, name), join(dir, name));
    }
  }
  return dir;
}

/** Reddit cookies from the copied db, shaped for Playwright's addCookies. */
async function redditCookies() {
  const dir = await copiedCookieDb();
  try {
    const { stdout } = await execFile("sqlite3", [
      "-json",
      join(dir, "cookies.sqlite"),
      "select name, value, host, path, expiry, isSecure, isHttpOnly from moz_cookies where host like '%reddit.com';",
    ]);
    const rows = stdout.trim() ? JSON.parse(stdout) : [];
    if (!rows.length)
      throw new Error("no reddit cookies in the Firefox profile");
    return rows.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.host,
      path: c.path,
      // Firefox stores ms-scale expiries; Playwright wants unix seconds
      // (-1 marks a session cookie).
      expires:
        c.expiry > 0
          ? Math.floor(c.expiry > 1e11 ? c.expiry / 1000 : c.expiry)
          : -1,
      secure: Boolean(c.isSecure),
      httpOnly: Boolean(c.isHttpOnly),
    }));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------

async function captureChrome() {
  if (!existsSync(join(CHROME_EXT, "manifest.json")))
    throw new Error(
      "no .output/chrome-mv3 - run `npm run build:chrome` (or `npm run ship`)",
    );
  const cookies = await redditCookies();
  const userDataDir = await mkdtemp(join(tmpdir(), "rs-ship-chrome-"));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      "--headless=new",
      // Browser-wide, so the extension background's listing fetch sends it
      // too - a context userAgent only covers pages, and reddit 403s the
      // HeadlessChrome default.
      `--user-agent=${UA}`,
      `--disable-extensions-except=${CHROME_EXT}`,
      `--load-extension=${CHROME_EXT}`,
    ],
    userAgent: UA,
    viewport: { ...STORE },
  });
  try {
    await context.addCookies(cookies);
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(FEED, { waitUntil: "domcontentloaded", timeout: 45000 });
    const run = (body) => page.evaluate(`(() => {${body}})()`);

    const state = await stageHero(run);
    console.log("chrome staged:", state);
    await page.screenshot({ path: OUT.chrome, type: "jpeg", quality: 90 });
    console.log(`wrote ${OUT.chrome} (${STORE.width}x${STORE.height})`);

    // Same scene at the site hero's size; re-stage in case the resize idled it.
    await page.setViewportSize({ ...SITE });
    await sleep(600);
    await run(STAGE);
    await sleep(400);
    await page.screenshot({ path: OUT.site });
    console.log(`wrote ${OUT.site} (${SITE.width}x${SITE.height})`);
  } finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
}

async function captureFirefox() {
  // Old zips linger in .output - pin to the current package version.
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const zip = join(
    root,
    ".output",
    `reddit-slideshow-${pkg.version}-firefox.zip`,
  );
  if (!existsSync(zip))
    throw new Error(
      `no ${zip} - run \`npm run zip:firefox\` (or \`npm run ship\`)`,
    );

  const cookies = await redditCookies();
  const opts = new firefox.Options().addArguments("-headless");
  const driver = await new Builder()
    .forBrowser("firefox")
    .setFirefoxOptions(opts)
    .build();
  try {
    await driver.installAddon(zip, true);

    // Seed the session: cookies can only be added for the current document's
    // domain, so land on a cheap reddit page first.
    await driver.get("https://old.reddit.com/robots.txt");
    for (const c of cookies) {
      // Marionette rejects cookies that don't domain-match the current page:
      // .reddit.com and old.reddit.com pass, sibling subdomains (www.,
      // accounts., ...) throw. The session lives on .reddit.com, so skipping
      // siblings loses nothing.
      const domain = c.domain.replace(/^\./, "");
      if (domain !== "reddit.com" && domain !== "old.reddit.com") continue;
      try {
        await driver.manage().addCookie({
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path,
          secure: c.secure,
          httpOnly: c.httpOnly,
          ...(c.expires > 0 ? { expiry: c.expires } : {}),
        });
      } catch {
        // One odd cookie must not sink the capture.
      }
    }

    // Land the viewport exactly on the store canvas.
    await driver
      .manage()
      .window()
      .setRect({ width: STORE.width, height: STORE.height });
    const inner = await driver.executeScript(
      "return [window.innerWidth, window.innerHeight]",
    );
    await driver
      .manage()
      .window()
      .setRect({
        width: STORE.width + (STORE.width - inner[0]),
        height: STORE.height + (STORE.height - inner[1]),
      });

    await driver.get(FEED);
    const state = await stageHero((body) => driver.executeScript(body));
    console.log("firefox staged:", state);
    await writeFile(
      OUT.firefox,
      Buffer.from(await driver.takeScreenshot(), "base64"),
    );

    // Headless Firefox can shoot at 2x on retina hosts; normalize to the canvas.
    const { stdout } = await execFile("sips", [
      "-g",
      "pixelWidth",
      OUT.firefox,
    ]);
    const width = Number(/pixelWidth: (\d+)/.exec(stdout)?.[1] ?? 0);
    if (width !== STORE.width) {
      await execFile("sips", [
        "-z",
        String(STORE.height),
        String(STORE.width),
        OUT.firefox,
      ]);
    }
    console.log(`wrote ${OUT.firefox} (${STORE.width}x${STORE.height})`);
  } finally {
    await driver.quit();
  }
}

await captureChrome();
await captureFirefox();

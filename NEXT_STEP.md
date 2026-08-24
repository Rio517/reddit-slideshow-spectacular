# NEXT_STEP - Reddit Slideshow Spectacular!

**Branch:** `main` · **Status:** CI-green. v1.3.1 is tagged and released on
GitHub with the three store zips attached (pan & zoom letterbox fix + the
download-folder setting, both verified in real Chrome and Firefox). v1.3.0 is
submitted to both stores and pending review; §1 has the v1.3.1 submission
steps. Streaming the proxy fallback is parked (see the §1 note).

> **Hard rule:** work directly on `main`. Do not create branches or worktrees unless the user explicitly asks. See `AGENTS.md`.

This is a Firefox-first (also Chrome) WebExtension that turns the current `old.reddit.com` or `www.reddit.com` feed into a keyboard-driven media slideshow. It reuses the logged-in session (no API keys) and resolves images, galleries, gif posts (played as reddit's own mp4 transcode, ADR 0022), v.redd.it video, Redgifs, Imgur `.gifv`, Imgur albums, Streamable, Giphy, Catbox video, and crossposts via the provider dispatch in `lib/slides.js`. The overlay does a gap-free, decode-gated slide swap with six transitions (none/fade/slide/push/zoom/flip), a top-right close + a backdrop close-confirm with countdown, an idle auto-hide that respects focus, a popout/AirPlay window, a jump-to-post list (title + domain/type, auto-skipped slides dimmed and tagged with their reason), a skipped list with a per-item reason, a position counter that pulses on manual nav (with a dim/spinner when the next slide is slow), an end-of-show replay card, and ARIA + a real focus trap. The bottom-left is a bottom-anchored stack: NSFW on top, then the title row (vote arrow + title + open-original + download + loading spinner), then a byline reading `/u/author to /r/subreddit`, with the source (`{domain} • {W}×{H}`) on its own mono line. The ↑/↓ keys upvote/downvote the current post through the session (modhash + `/api/vote`), with a brief toast; the title's vote arrow tints to the current vote and follows the post across a gallery's slides. A paused slide can be inspect-zoomed manually - mouse wheel or +/− at the pointer, drag to pan, Escape resets (ADR 0021). Redgifs resolves lazily on approach; v.redd.it audio plays from a companion `<audio>` synced to the silent fallback video. The overlay mounts inside a shadow root (its CSS injected there, isolated from old.reddit/RES page styles) and makes the page `inert` while open. Settings (per-image timer, transition, top-timer-bar mode, load-wait, autoplay, mute, Include-NSFW, dedup, resolution-aware pan & zoom, Language, a download folder under the browser's Downloads folder, and the launch shortcut) live in an in-overlay gear panel and a light/dark options page (with a Sponsors link), applied live. A DEV-gated logger (`lib/log.js`) aids debugging; CI runs typecheck/lint/format/test + build (both browsers) + web-ext lint; `npm run screenshots` regenerates the options shots and an offline, deterministic slideshow shot (the real overlay + session over fixture slides in `scripts/slideshow-harness/`). old.reddit.com sets no CSP, so injected cross-origin media loads directly; on www.reddit a blocked direct load falls back to the background blob proxy. The image/video sinks are host/HTTPS-gated (`safeMediaUrl`). Content-dedup hashes the preload window so duplicates are filtered before they show.

---

## 0. Current Source Of Truth

Read these before coding:

- Product spec: `docs/product/reddit-slideshow-product-spec.md`
- Development practices: `docs/research/extension-development-best-practices.md`
- WXT/MV3 ADR: `docs/adr/0005-manifest-v3-event-page-and-wxt-build.md`
- Agent workflow: `AGENTS.md`

Key decisions already made:

- Build a standalone Firefox-first WebExtension; also ship Chrome.
- Use WXT + MV3 (Firefox event page; Chrome service worker).
- Support `old.reddit.com` and `www.reddit.com` (www's CSP triggers the blob-proxy fallback for cross-origin media).
- Use offline fixtures for unit tests instead of live Reddit.
- Resolve images, galleries, gif posts, video, Redgifs, Imgur `.gifv`, Imgur albums, Streamable, Giphy, Catbox, and crossposts via the provider dispatch in `lib/slides.js`; CDN-subdomain providers use a dot-prefixed host-suffix allowlist (`lib/provider-hosts.js`).
- Move bytes off the `runtime.sendMessage` boundary: the background returns a perceptual-hash hex for dedup and base64 for the blob proxy (raw `ArrayBuffer` is dropped by the JSON-serialized message channel).
- Launch from the toolbar action (icon) or a configurable shortcut (default Alt+Shift+S; recorder on the options page for Firefox, a browser-shortcuts-page link on Chrome); the slideshow starts from the top of the current listing (the page's own sort).
- i18n: source of truth is `locales/<lang>.json` (6 locales); `lib/i18n.js` bundles all six catalogs and `setLocale(resolveLocale(setting, uiLang))` switches strings + direction + plurals together ("auto" → browser UI language). `browser.i18n` is used only for `getUILanguage()` and the manifest `__MSG__` fields. `npm run locales` generates the committed `public/_locales/**`; the catalog integrity test enforces sync + key + placeholder parity.

---

## 1. Open work

Roughly in priority. Keep small commits - do not batch multiple slices into one
giant commit.

### Requested, not yet done

- **v1.3.1 store rollout.** From the GitHub release, upload `*-chrome.zip` to
  the Chrome Web Store and `*-firefox.zip` plus `*-sources.zip` (the build
  minifies) to Firefox Add-ons, and paste the per-locale listing copy from
  `docs/store-listing/<lang>.md` (its what's-new shows the last two versions).
  The store heroes and promo tiles are committed under `docs/`; `npm run ship`
  regenerates them.
- Optional: a native-speaker pass on the machine-drafted translations,
  especially Arabic (~25% of installs). English fallback covers any gap, and a
  locale file can be refreshed without code changes.

> **Not planned:** streaming the proxy fallback (MediaSource) was investigated
> and parked - it needs a few-hundred-KB in-browser remuxer for a narrow
> Chrome-only win. The full reasoning + the Playwright evidence are in
> `docs/research/proxy-streaming-mediasource.md`.

### Media providers - the pattern

Each provider mirrors Redgifs: detection in the `lib/slides.js` provider
dispatch, a background resolver (`lib/redgifs.js` / `lib/streamable.js`-style)
where a network resolve is needed, then play the mp4 in a `<video>` or render as
images. Direct play uses the provider CDN; the background blob proxy is the
per-slide fallback for pages whose CSP blocks cross-origin media (www.reddit) and
the primary path for Redgifs on Chrome (where `referrerpolicy` is a no-op on
`<video>`). Every new fetch host needs a scoped `host_permission` + an ADR, plus a
fixture and a resolver/detection test. Providers whose media is on varying CDN
subdomains use the dot-prefixed domain-suffix rule in `lib/provider-hosts.js`.

---

## 2. Target Development Flow

For each task or feature:

1. **Write the failing test**
   - Unit test first for parser/resolver/state logic.
   - Fixture-backed test for Reddit data shape.
   - Browser/integration test for overlay behavior once UI exists.

2. **Run the focused test and confirm it fails**
   - The failure should prove the test is meaningful.

3. **Write the smallest code that makes it pass**
   - Keep modules small.
   - Prefer shared `lib/` logic over stuffing behavior into content scripts.
   - Keep content script thin: page integration and overlay only.

4. **Run focused verification**
   - Re-run the specific test.
   - Fix only the thing under test.

5. **Run broader verification**
   - `npm run typecheck`
   - `npm run lint`
   - `npm run format`
   - `npm test`
   - `npm run build`
   - `npm run webext:lint`

6. **Review code**
   - Check diff for scope creep.
   - Check docs if behavior changed.
   - Review security/privacy implications for permissions, DOM injection, and remote media.

7. **Visually verify**
   - For parser-only work: no visual check needed.
   - For extension UI: run the extension in Firefox and inspect manually.
   - Use Playwright when there is a stable local page/fixture or browser target to verify: overlay opens, controls fit, no blank screen, keyboard works, media is visible.
   - Capture screenshots for layout/UI changes when useful.
   - Provider/byte-transfer changes need a real logged-in browser (offline gates can't catch CORS, referrerpolicy, host-permission grants, or message-boundary serialization).

8. **Commit**
   - Commit after each passing, reviewed slice.
   - Keep commit messages specific.

9. **Push**
   - Only push after the working tree is clean and the full verification set passes.
   - If no remote is configured yet, stop and ask before adding one.

---

## 3. Tooling Target

These commands are available:

```sh
npm install
npm run typecheck
npm run lint
npm run format
npm test
npm run test:prod
npm run build
npm run webext:lint
npm run dev
npm run locales
npm run screenshots
npm run reel
npm run ship
```

Roles:

- `npm run typecheck`: JS/JSDoc type checking via TypeScript.
- `npm run lint`: ESLint, including unsafe DOM sink checks.
- `npm run format`: Prettier check (a CI gate; fix with `npx prettier --write .`).
- `npm test`: Vitest unit tests with WXT fake browser.
- `npm run test:prod`: e2e - drives the built Chrome extension in Chromium over a mocked listing.
- `npm run build`: WXT MV3 build (both Firefox and Chrome).
- `npm run webext:lint`: Mozilla extension lint against built output.
- `npm run dev`: WXT dev runner for Firefox (DEV logger on).
- `npm run locales`: regenerate the committed `public/_locales/**` from `locales/`.
- `npm run screenshots`: offline docs shots (options page + deterministic slideshow).
- `npm run reel`: re-record + encode the website demo reel `docs/slideshow.webm` (offline; auto-downloads its demo media, needs ffmpeg).
- `npm run ship`: store zips, live hero shots (`heroes`), promo tiles (`promo`), and the demo reel (`reel`).

Visual/browser tooling:

- Use Playwright for stable browser verification once local fixture pages or extension UI flows exist.
- Use the Browser plugin for quick local URL inspection if needed.
- Use Pencil only for mockups/design artifacts, not implementation.

---

## 4. Verification Gates

Before calling a task done:

- Focused test passes.
- Full relevant command set passes.
- `git status --short` is clean after commit.
- Any changed assumptions are reflected in docs.

Before calling UI work done:

- Firefox manual check completed.
- Playwright or Browser check completed where feasible.
- Controls are keyboard accessible.
- Text does not overflow controls.
- Overlay does not fight old Reddit/RES in the checked scenario.

Before calling provider/media work done:

- Fixture added or updated.
- Resolver test added.
- Unsupported/failure case covered.
- No broad permissions added without ADR/spec update.
- Confirmed in a real logged-in browser (both Firefox and Chrome where the path differs).

---

## 7. Things Not To Do Yet

- Do not add all-URLs host permissions (each new provider host is scoped + ADR'd).
- Do not add analytics.
- Do not rely on live Reddit in unit tests.
- Do not send raw binary over `runtime.sendMessage` (it's dropped) - return a hash or base64.
- Do not create a branch/worktree unless explicitly asked.

# NEXT_STEP - Reddit Slideshow Spectacular!

**Branch:** `main` · **Status:** CI-green on `main`. v1.0.0 is live on both
stores. **v1.1.0 — localization (i18n + RTL — en/es/fr/de/it/ar, full RTL for
Arabic) plus an in-app Language picker — is pushed and released on GitHub**
(tag `v1.1.0`; `release.yml` built + attached the Firefox / AMO-sources / Chrome
zips). The UI auto-detects the browser language and can be overridden under
**Language** on the options page. What remains for v1.1.0 to reach users:
upload the release zips to the Chrome Web Store + Firefox Add-ons dashboards and
submit for review, paste the localized listing copy from
`docs/store-listing/{en,es,fr,de,it,ar}.md` into each store's per-locale fields,
and (optional, recommended) a native-speaker pass on the machine-drafted
translations — especially Arabic (~25% of installs); English fallback covers any
gap meanwhile. Streaming the proxy fallback is parked (see the §1 note).

> **Hard rule:** work directly on `main`. Do not create branches or worktrees unless the user explicitly asks. See `AGENTS.md`.

This is a Firefox-first (also Chrome) WebExtension that turns the current `old.reddit.com` or `www.reddit.com` feed into a keyboard-driven media slideshow. It reuses the logged-in session (no API keys) and resolves images, galleries, v.redd.it video, Redgifs, Imgur `.gifv`, Imgur albums, Streamable, Giphy, Catbox video, and crossposts via the provider dispatch in `lib/slides.js`. The overlay does a gap-free, decode-gated slide swap with six transitions (none/fade/slide/push/zoom/flip), a top-right close + a backdrop close-confirm with countdown, an idle auto-hide that respects focus, a popout/AirPlay window, a jump-to-post list (title + domain/type, auto-skipped slides dimmed and tagged with their reason), a skipped list with a per-item reason, a position counter that pulses on manual nav (with a dim/spinner when the next slide is slow), an end-of-show replay card, and ARIA + a real focus trap. The bottom-left is a bottom-anchored stack: NSFW on top, then the title row (title + open-original + download + loading spinner), then a byline reading `/u/author to /r/subreddit from {domain} at {W}×{H}` (domain + resolution in mono). The ↑/↓ keys upvote/downvote the current post through the session (modhash + `/api/vote`), with a brief toast. Redgifs resolves lazily on approach; v.redd.it audio plays from a companion `<audio>` synced to the silent fallback video. The overlay mounts inside a shadow root (its CSS injected there, isolated from old.reddit/RES page styles) and makes the page `inert` while open. Settings (per-image timer, transition, top-timer-bar mode, load-wait, autoplay, mute, Include-NSFW, dedup, pan & zoom) live in an in-overlay gear panel and a light/dark options page (with a Sponsors link), applied live. A DEV-gated logger (`lib/log.js`) aids debugging; CI runs typecheck/lint/format/test + build (both browsers) + web-ext lint; `npm run screenshots` regenerates the options shots and an offline, deterministic slideshow shot (the real overlay + session over fixture slides in `scripts/slideshow-harness/`). old.reddit.com sets no CSP, so injected cross-origin media loads directly; on www.reddit a blocked direct load falls back to the background blob proxy. The image/video sinks are host/HTTPS-gated (`safeMediaUrl`). Content-dedup hashes the preload window so duplicates are filtered before they show.

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
- Resolve images, galleries, video, Redgifs, Imgur `.gifv`, Imgur albums, Streamable, Giphy, Catbox, and crossposts via the provider dispatch in `lib/slides.js`; CDN-subdomain providers use a dot-prefixed host-suffix allowlist (`lib/provider-hosts.js`).
- Move bytes off the `runtime.sendMessage` boundary: the background returns a perceptual-hash hex for dedup and base64 for the blob proxy (raw `ArrayBuffer` is dropped by the JSON-serialized message channel).
- Launch from the toolbar action (icon) or Alt+Shift+S; the slideshow starts from the top of the current listing (the page's own sort).

---

## 1. Open work

Roughly in priority. Keep small commits - do not batch multiple slices into one
giant commit.

### Requested, not yet done

- **Localization release (1.1.0) — submit to the stores.** v1.1.0 (i18n + RTL +
  in-app Language picker) is pushed and released on GitHub (tag `v1.1.0`, store
  zips attached by `release.yml`). To reach users: download the release zips and
  upload `*-chrome.zip` to the Chrome Web Store and `*-firefox.zip` (+
  `*-sources.zip`, the build minifies) to Firefox Add-ons, submit both for
  review, and paste the localized listing copy from
  `docs/store-listing/{en,es,fr,de,it,ar}.md` into each store's per-locale fields.
  A native-speaker pass on the machine-drafted translations (especially Arabic,
  ~25% of installs) is recommended but optional — English fallback covers gaps,
  and any locale file can be refreshed without code changes. Architecture
  reference: source of truth is
  `locales/<lang>.json` (6 files, 129 keys); `lib/i18n.js` bundles all six
  catalogs and the default getter reads `CATALOGS[activeLocale]` with per-key
  English fallback, so `setLocale(resolveLocale(setting, uiLang))` switches
  strings + direction + plurals together. Entrypoints resolve the locale from the
  `locale` setting ("auto" → browser UI language → a supported locale, or an
  explicit pick); `browser.i18n` is used only for `getUILanguage()` and the
  manifest `__MSG__` name/description/action (browser-locale — it can't follow the
  in-app override). The options page has a **Language** `<select>` that
  re-localizes live; the overlay applies the choice on its next start.
  `scripts/build-locales.mjs` (npm run locales) generates the committed
  `public/_locales/**`; the catalog integrity test enforces sync + key +
  placeholder parity. (Catalogs ship both bundled in JS and in `_locales` for the
  manifest, so the package is ~516 KB — fine for an extension.)

> **Not planned:** streaming the proxy fallback (MediaSource) was investigated
> and parked - it needs a few-hundred-KB in-browser remuxer for a narrow
> Chrome-only win. The full reasoning + the Playwright evidence are in
> `docs/research/proxy-streaming-mediasource.md`.

### Needs a real-browser confirm

These have unit tests but can't be exercised offline. Confirm each in a
logged-in Firefox + Chrome before trusting it:

- **Redgifs lazy resolution** (ADR 0016) - the page now ships iframe embeds and
  the session resolves each to native video on approach; confirm the on-approach
  upgrade plays on both browsers and the iframe fallback still shows on failure.
- **v.redd.it audio** (ADR 0018) - a companion `<audio>` plays the separate DASH
  audio track synced to the silent video; confirm sync, the mute-follow (it
  mirrors the video's `volumechange`), the autoplay-unmute path, and that the
  manifest's audio BaseURL actually matches.
- **Download the current media** (ADR 0017) - confirm cross-origin saves (incl.
  hotlink-protected CDNs, with no reddit Referer) land with the filename hint.
- **Up/down-key voting** (ADR 0019) - confirm a real cast vote, the toggle/clear,
  the modhash 403-refresh, and the not-logged-in optimistic revert.
- **Neon "Spectacular!" wordmark** - the overlay splash + end card draw it as an
  inline SVG outline (`lib/wordmark-spectacular.js`, traced from Monoton), so it
  no longer depends on a webfont or the page CSP (the web-accessible font fell
  back to sans in Firefox over reddit). Confirm it renders on both browsers. The
  options page still uses the Monoton `@font-face` (extension-origin, works).
- **Localization + RTL** — on the options page, switch **Language** to each of
  Spanish/French/German/Italian/Arabic and confirm the page re-localizes and (for
  Arabic) flips to RTL live; then start a slideshow and confirm the overlay
  renders in that language with correct mirroring and an unscrambled byline. Unit
  tests cover catalog integrity, the per-locale getter, `resolveLocale`, and the
  `dir`/`<bdi>` structure — not rendered glyphs/layout.
- **Configurable trigger shortcut** — the options page reads the
  `_execute_action` binding via `commands.getAll()` and, on Firefox, rebinds it
  with `commands.update()`/`reset()`. Confirm in Firefox that updating
  `_execute_action` is actually accepted (MDN is fuzzy for MV3), that the new
  combo launches the slideshow, and that reset restores Alt+Shift+S; on Chrome,
  confirm the card hides the recorder and its button opens
  `chrome://extensions/shortcuts`. If Firefox rejects the update, the card must
  degrade to the guidance-only message. Also eyeball the #ddd title +
  dimensions text over a bright image.

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
npm test
npm run build
npm run webext:lint
npm run dev
```

Roles:

- `npm run typecheck`: JS/JSDoc type checking via TypeScript.
- `npm run lint`: ESLint, including unsafe DOM sink checks.
- `npm test`: Vitest unit tests with WXT fake browser.
- `npm run build`: WXT MV3 build (both Firefox and Chrome).
- `npm run webext:lint`: Mozilla extension lint against built output.
- `npm run dev`: WXT dev runner for Firefox (DEV logger on).

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

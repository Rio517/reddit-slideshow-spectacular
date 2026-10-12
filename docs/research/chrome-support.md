# Chrome Support

Date: 2026-05-30

Findings on shipping a Chrome build alongside the Firefox one. The core is
already browser-agnostic (uses `browser.*` via WXT, a fetch-based background, no
Firefox-only runtime APIs), so the same source builds both. Decision recorded in
**ADR 0009**.

## Build - one source, two targets

WXT produces a Chrome MV3 build from the same source (`wxt build -b chrome`).
Chrome uses a `service_worker` background; Firefox uses a non-persistent event
page. WXT generates the right `background` key per browser from one
`defineBackground`, so no code change is needed. The background is stateless
message handlers + `fetch`, which run fine in a service worker.

## Browser differences handled

- **Icons:** Chrome does **not** accept an SVG manifest icon (Firefox does). The
  manifest references rasterized PNGs (16/32/48/96/128) generated from
  `public/icon.svg` via `rsvg-convert` (`npm run icons`).
- **Manifest:** `browser_specific_settings.gecko` (id +
  `data_collection_permissions`) is Firefox-only and would be an unrecognized key
  on Chrome. The `wxt.config` manifest is a function that includes the gecko block
  only when `browser === "firefox"`. `optional_host_permissions` is supported on
  both.
- **MV3 content-script CORS (in Chrome's favor):** Chrome MV3 content scripts get
  privileged cross-origin fetch via `host_permissions`; Firefox MV3 does not (it
  subjects them to page CORS, which is why Layer 2 hashing routes through the
  background). The background-routed approach works on both, so no change is
  required - Chrome could later fetch directly if desired.
- **Session fetch:** a Chrome MV3 service worker
  `fetch(..., { credentials: "include" })` with `host_permissions` sends the
  user's Reddit cookies, same as Firefox. **Verified in real Chrome** (see below).

## Verified behavior

`npm run build:chrome` emits `.output/chrome-mv3/` with `manifest_version: 3`, a
`service_worker` background, PNG icons, and **no** `browser_specific_settings`.
The Firefox build still has the event page + gecko id. Web-ext lint applies to
the Firefox output only (it is a Mozilla tool).

Real-Chrome smoke test (loaded unpacked via Playwright): the extension loads, the
MV3 service worker registers, the content script injects on `old.reddit.com`, and
the overlay (`#reddit-slideshow-root`) renders. The service worker's
`credentials: "include"` listing fetch to both `old.reddit.com/.json` and
`www.reddit.com/.json` **attaches the user's Reddit cookies** - confirming the
session-fetch assumption on Chrome. Those fetches return `403` from a fresh,
not-logged-in automated profile (Reddit blocks anonymous `.json`), so a full
media-render pass still needs a manual logged-in run; the logged-in `200` path is
already verified separately (curl with a logged-in session).

## Distribution

Chrome Web Store, a separate listing and review from AMO. `npm run zip:chrome`
produces the upload artifact.

## Remaining work

- Smoke-test the service-worker background in real Chrome: the toolbar/launch
  message round-trip, the listing fetch, and the Layer 2 image fetch.
- Confirm the slideshow on both `old.reddit.com` and `www.reddit.com` in Chrome.
- Chrome Web Store listing.

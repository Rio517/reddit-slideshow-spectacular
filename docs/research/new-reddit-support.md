# New Reddit Support

Date: 2026-05-30

Findings on supporting the slideshow on **new Reddit** - `www.reddit.com`, the
"shreddit" redesign - in addition to `old.reddit.com`. "Shreddit" is Reddit's
codename for its current web-components SPA frontend (custom elements like
`<shreddit-post>`, `<shreddit-feed>`, `<shreddit-app>`); it replaced the older
React redesign. Decision recorded in **ADR 0008**.

## Chosen architecture: each frontend self-contained (ADR 0008)

The frontend the user is on and the data source are independent - cookies are
scoped to `.reddit.com`, so the background can fetch either host's `.json`. An
earlier idea was "render on new, fetch from old," but to avoid depending on old
Reddit surviving, ADR 0008 instead has each frontend fetch **its own** `.json`
(old → old, www → www). The new-Reddit path never calls old Reddit. This reuses
the data layer (`reddit-url.js`, `reddit-listing.js`, `queue.js`, `slides.js`),
allowing the www host and resolving permalinks against the page origin.

## Data layer - works

Logged in, both endpoints return identical listing JSON (HTTP 200,
`application/json`, same fields incl. `url_overridden_by_dest`, `preview`,
`secure_media`, `gallery_data`):

- `old.reddit.com/r/<sub>/.json?raw_json=1`
- `www.reddit.com/r/<sub>/.json?raw_json=1`

Logged **out**, `www.reddit.com/.json` returns HTTP 403 with the SPA HTML - but
the extension requires a logged-in session anyway, so this does not matter. A
www page fetches `www.reddit.com/.json`; an old page fetches
`old.reddit.com/.json`.

## Rendering / CSP - works when logged in, but Reddit-controlled

Unlike `old.reddit.com` (which sends **no CSP**), `www.reddit.com` enforces a
Content-Security-Policy, and it differs by auth state:

- **Logged out (or bot-walled):** strict - `default-src 'none'; img-src https://www.redditstatic.com; ...`. This would block injected cross-origin media.
- **Logged in (the real app):** permissive for our media -
  - `img-src 'self' data: blob: https:` → i.redd.it / preview.redd.it images load.
  - `media-src 'self' blob: data: *.redd.it ...` → v.redd.it video loads.
  - `frame-src 'self' ... redgifs.com www.redgifs.com ...` → the Redgifs iframe loads.

So a logged-in overlay renders all current media kinds. The content script's own
JS runs in its isolated world regardless of `script-src`.

Risk: the CSP is Reddit's to change without notice, and it is stricter than old
Reddit's (none). If Reddit tightens it, the robust fallback is to render the
overlay inside an **extension-page iframe** (a `web_accessible_resource` on
`moz-extension://` / `chrome-extension://`), which carries the extension's own
CSP and is exempt from the host page's - the standard technique for overlays on
CSP-strict sites. That is more work than today's direct injection.

## DOM - the shreddit start cursor

New Reddit renders posts as `shreddit-post` web components inside a
`shreddit-feed`, not `old`'s `div.thing[data-fullname]`, and some content lives
in shadow DOM. Verified against a live page: each `shreddit-post` element's `id`
**is** the post fullname (e.g. `id="t3_1ts5tg7"`). So the "start from the post
nearest the viewport" cursor reads `shreddit-post[id^="t3_"]:not([promoted])` on
new Reddit and `div.thing[data-fullname]` (excluding promoted) on old Reddit
(`lib/reddit-dom.js`).

Ads are excluded automatically: verified against `r/all`, promoted posts render
as a **distinct `shreddit-ad-post` element** (carrying its own `promoted`
attribute and a `t3_` id), which the `shreddit-post` selector never matches.
Organic `shreddit-post` elements carry no `promoted` attribute; the
`:not([promoted])` guard is belt-and-suspenders against Reddit ever marking a
`shreddit-post` itself as promoted.

RES is old-Reddit-only, so the RES coexistence concern does not apply on new
Reddit (other extensions and Reddit's own SPA still do).

## Implemented scope

- `www.reddit.com` added to content-script `matches` and `host_permissions`.
- `toListingJsonUrl` accepts the www host; a www page fetches `www.reddit.com/.json`.
- Permalinks resolve against the page origin (`fetchQueuePage` → `slidesFromListing`),
  so "open original" stays on the user's frontend.
- The shreddit start-from-viewport cursor (`lib/reddit-dom.js`).
- `sh.reddit.com` is intentionally excluded (a share/redirect surface).

Remaining: overlay rendering and keyboard capture validated inside the shreddit
SPA in a real logged-in session.

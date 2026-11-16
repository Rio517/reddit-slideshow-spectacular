# ADR 0008: Support new Reddit (www.reddit.com) with a self-contained data path

Date: 2026-05-30
Status: Proposed

## Context

v1 runs only on `old.reddit.com` - the content script, the listing `.json` data
fetch, and the overlay all assume it. Old Reddit is not deprecated today, but it
is a legacy surface Reddit could remove, and the product should not depend on it
surviving.

Research (`docs/research/new-reddit-support.md`), verified against a logged-in
session, found:

- `www.reddit.com/.../.json?raw_json=1` returns the **same** listing JSON as old
  Reddit (identical fields) when logged in. Logged out it is 403, but the
  extension is logged-in by definition.
- old Reddit sends **no** CSP; new Reddit's **logged-in** CSP is permissive for
  our media (`img-src https:`, `media-src *.redd.it`, `frame-src redgifs.com`),
  so a directly-injected overlay renders all current media kinds. The
  logged-out CSP is strict.
- New Reddit renders posts as `shreddit-post` web components, not old Reddit's
  `div.thing[data-fullname]`.

## Decision

1. **Run the content script on both `old.reddit.com` and `www.reddit.com`,** and
   treat each frontend as self-contained.
2. **Fetch the listing from old Reddit on both frontends.** Reddit now 403s
   listing `.json` on both hosts, and old Reddit's HTML page is the listing
   source that still carries every post's media (ADR 0003). The new-Reddit path
   therefore depends on old Reddit: if Reddit removes it, the listing source
   must move to new Reddit's own pages.
3. **Render the overlay directly in the page on both,** relying on new Reddit's
   permissive logged-in CSP - no extension-page-iframe workaround now. Media that
   the CSP blocks already degrades to the existing placeholder card. The iframe
   overlay is recorded as the known mitigation **if** Reddit later tightens the
   CSP, but it is not built unless needed.
4. **Adapt the start-from-viewport cursor to the shreddit DOM,** behind a
   per-frontend reader; if no post elements are found, start from the top of the
   listing and paginate.
5. **Add `www.reddit.com`** to `host_permissions` and the content-script
   `matches`.
6. **Resolve relative listing URLs (post `permalink`) against the page's own
   origin,** not a hardcoded `old.reddit.com`. Otherwise "open original" on a www
   page links back to old Reddit - a live dependency the self-contained path must
   not have.

**Scope:** new Reddit means `www.reddit.com` only. `sh.reddit.com` is excluded -
it is a share/redirect/login surface, not a primary listing-browsing host;
revisit if users actually land there. Soft (client-side) navigation in the
shreddit SPA does not re-run the content script, but the listing URL is read from
`window.location.href` at launch time, so launching after a soft-nav fetches the
correct listing; overlay reset across in-SPA route changes is a verification item
(not built now).

## Consequences

- Future-proof: new-Reddit users do not depend on old Reddit.
- The new-Reddit overlay's media rendering depends on Reddit keeping a permissive
  CSP for logged-in users. If that changes, media falls back to placeholders, and
  the documented next step is the extension-page-iframe overlay.
- Two DOM dialects for the start cursor (old `div.thing`; new `shreddit-post`),
  encapsulated per frontend. `lib/page-cursor.js` stays DOM-agnostic.
- Slightly broader install permissions (`www.reddit.com`), still narrow (no
  all-urls).
- The data layer (`reddit-url.js`, `reddit-listing.js`, `queue.js`, `slides.js`)
  is reused, allowing the `www.reddit.com` host and threading the page origin
  through to permalink resolution.

## Alternatives Considered

- **Render on new, fetch from old:** simplest data reuse, but depends on old
  Reddit surviving. Rejected per the future-proofing goal.
- **New-Reddit only (drop old):** fewer matches, but abandons working old-Reddit
  users for no gain. Rejected - keep both, each self-contained.
- **Extension-page-iframe overlay up front:** robust against any CSP, but a
  significant overlay rewrite. Deferred until/unless Reddit's CSP blocks direct
  rendering.
- **GraphQL / scraping the SPA for data:** brittle and unnecessary while `.json`
  works for logged-in users. Rejected.

## Follow-up

- Validate `www.reddit.com/.json` across listing types (front page, multireddit,
  search) while logged in.
- Confirm `shreddit-post` fullname extraction for the cursor in a real session.
- Confirm overlay rendering + keyboard capture inside the shreddit SPA (client
  navigation, shadow DOM) in real Firefox.

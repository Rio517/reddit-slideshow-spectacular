# Store Listing Metadata

Submission metadata for the Firefox Add-ons site (AMO) and the Chrome Web
Store: categories, permission justifications, questionnaire answers, reviewer
notes, and screenshot captions. The listing copy itself (name, summary,
description, what's-new) lives per locale in `store-listing/<lang>.md`. Every
claim in either place is grounded in the extension's actual behaviour (see
`README.md`, `PRIVACY.md`, `wxt.config.ts`, `lib/`, and `docs/product/`);
keep it accurate - do not add features that aren't shipped.

The justifications are written as **plain text** because the stores don't
render Markdown the same way. Paste them as-is.

---

## 1. Name

**Name (both stores):** Reddit Slideshow Spectacular!

**Homepage / website URL (both stores have a field for this):**
https://rio517.github.io/reddit-slideshow-spectacular/

**Live listings:**

- Chrome Web Store: https://chromewebstore.google.com/detail/reddit-slideshow-spectacu/pcfajhfnnkkpadnfedkgjfgclffeoenp
- Firefox Add-ons: https://addons.mozilla.org/firefox/addon/reddit-slideshow-spectacular/

---

## 2. Summary / short description

The summary lives per locale in `store-listing/<lang>.md` (the `## Summary`
section) - paste from there. For Chrome's short-description field (≤ 132
chars), use the summary with the site URL appended on its own line:

https://rio517.github.io/reddit-slideshow-spectacular/

---

## 3. Detailed description (plain text - paste as-is)

The full description - including each version's what's-new block - lives per
locale in `store-listing/<lang>.md` (the `## Description` section), mirroring
the live listings. Paste each locale's text into the matching per-locale store
field; every claim there must stay grounded in shipped behaviour.

---

## 4. Category suggestions

**AMO (Firefox):**

- Primary: **Photos, Music & Videos**
- Alternate if a more browsing-oriented fit is preferred: **Other**

**Chrome Web Store:**

- Primary: **Entertainment**
- Alternate: **Photos** (or **Fun**)

(Chrome lets you pick one category; Entertainment best fits a media-viewing
tool.)

---

## 5. Permission justifications (reviewer-facing, one line each)

These mirror `wxt.config.ts` and `PRIVACY.md`. AMO in particular asks for a
justification per host; Chrome asks per-host too (see section 8).

API permissions:

- **storage** - Save the user's settings (timer, transitions, mute/autoplay,
  NSFW and dedup toggles, etc.) locally on the computer. Nothing is synced or
  uploaded.
- **downloads** - Save the media the user is currently viewing to their computer,
  with a sensible filename, when they use the in-overlay download control.

Host permissions (install-time):

- **https://old.reddit.com/\*** - Fetch the listing JSON for the old-Reddit page
  the user is viewing, so the slideshow knows which media to show; also, on a
  keypress, write to the user's account with the session cookie + modhash:
  up/down vote on the post (`/api/vote`), block its author (`/api/block_user`),
  or friend/follow them (`/api/friend`).
- **https://www.reddit.com/\*** - Same listing fetch, for new Reddit; the
  slideshow can be launched from either frontend.
- **https://api.redgifs.com/\* , https://media.redgifs.com/\*** - Resolve a
  Redgifs link to its direct video URL and fetch the bytes in the background (the
  CDN hotlink-protects against a Reddit referrer), so the clip plays as native,
  correctly-timed video. Requested without cookies.
- **https://i.imgur.com/\*** - Fetch the .mp4 for an Imgur `.gifv` in the
  background and play it as a looping video (Imgur hotlink-protects against a
  Reddit referrer). Requested without cookies.
- **https://imgur.com/\*** - Fetch the keyless `imgur.com/ajaxalbums`
  album-member list (without cookies) to expand an Imgur album into one slide per
  image. Origin-scoped because MV3 host grants are origin-level.
- **https://\*.streamable.com/\*** - Resolve a Streamable clip's mp4 via its
  public API and fetch the bytes from the per-video CDN subdomain. Without
  cookies.
- **https://\*.giphy.com/\*** - Fetch a Giphy clip's mp4 from its media CDN and
  play it as a looping video. Without cookies.
- **https://v.redd.it/\*** - Fetch a Reddit video's DASH manifest (without
  cookies) to find its separate audio track, played alongside the silent video.
  The video and audio themselves load directly in the page.

Catbox files (`files.catbox.moe`) load directly in the page as `<video>` and
need no host permission.

Host permissions for the on-by-default re-upload detection (fetch Reddit images
to compute a local perceptual hash; the hash never leaves the computer):

- **https://i.redd.it/\*** - Fetch the displayed Reddit-hosted image to hash.
  (Display itself needs no permission; this access is only for hashing.)
- **https://preview.redd.it/\* , https://external-preview.redd.it/\*** - Fetch
  Reddit preview images (incl. externally-hosted post previews) to hash.

No other permissions are requested: no browsing history, no bookmarks, no
all-URLs / broad host access, and no remote code.

---

## 6. Privacy / data-use questionnaire answers

Both stores ask a data-collection questionnaire. The honest answer is that this
extension collects nothing. Mirror `PRIVACY.md`.

**Does the extension collect or transmit user data?** No.

Use these answers:

- Personally identifiable information - **Not collected**
- Health information - **Not collected**
- Financial / payment information - **Not collected**
- Authentication information - **Not collected** (it reuses the browser's
  existing Reddit session cookies to fetch the feed you can already see; it
  never reads, stores, or transmits those cookies itself)
- Personal communications - **Not collected**
- Location - **Not collected**
- Web history - **Not collected**
- User activity (clicks, keystrokes, etc.) - **Not collected**
- Website content - **Not collected/transmitted by us**; the extension fetches
  the listing JSON and media for the page the user is viewing, directly from
  Reddit and the content providers a post links to (Imgur, Redgifs, Streamable,
  Giphy, Catbox), to render the slideshow - none of it is sent anywhere else

Plain-language summary to paste where a free-text box is offered:

Reddit Slideshow Spectacular! collects nothing and sends nothing to the developer - there is no developer server, no analytics, no telemetry, no tracking, no ads, and no accounts. It makes network requests only to Reddit, Reddit's media hosts, and the content providers a post links to (Imgur, Redgifs, Streamable, Giphy, Catbox), to fetch the media you're viewing; those provider requests are made without cookies. The only thing it stores is your own settings, kept locally via the browser's extension storage; removing the extension removes them. The extension contains no remote code.

**AMO data-collection declaration:** the Firefox manifest already declares
`data_collection_permissions: { required: ["none"] }` (see `wxt.config.ts`), so
select "No" / "does not collect data" to match.

**Chrome Web Store certifications:** you can truthfully check all three -
(1) we do not sell or transfer user data to third parties outside the approved
use cases, (2) we do not use or transfer user data for purposes unrelated to the
item's single purpose, and (3) we do not use or transfer user data to determine
creditworthiness or for lending.

**Privacy policy URL:** the `PRIVACY.md` in this repository
(https://github.com/Rio517/reddit-slideshow-spectacular/blob/main/PRIVACY.md), or a hosted
copy of it.

---

## 7. Screenshots

The store assets ship in the repo; `npm run ship` regenerates all of them
(zips + live hero shots + promo tiles), and `npm run screenshots` refreshes
the offline options shots on their own.

**docs/screenshots/hero-chrome.jpg** (1280×800 JPEG, the Chrome Web Store's
screenshot canvas) and **docs/screenshots/hero-firefox.png** (1280×800 PNG,
for Firefox Add-ons) - the slideshow running full-screen over
r/SlideShowSpectacular, captured live in each browser: a golden-retriever
puppy bounding through a sunlit meadow fills the stage, with the position
counter top-left, the title's vote arrow and open-original / download buttons
above a byline (`/u/rio517 to /r/SlideShowSpectacular` with the source
`i.redd.it • 1122×1402` on its own line), and the vertical control rail down
the right edge.

Suggested caption: "Full-screen slideshow over your current feed - keyboard-driven, with a position counter and a minimal control rail."

**docs/screenshots/options-light.png** - the options page (light mode) showing
every setting: image timer, transition between slides, top timer bar, skip-slow
media, autoplay, start muted, include NSFW, hide duplicate media, always show
count & title, detect re-uploaded images, and the pan & zoom sequence.

Suggested caption: "Every setting in one place - changes apply live to a
running slideshow."

(There's also a dark-mode variant at `docs/screenshots/options-dark.png` if you
want a third tile, and the website/README hero at `docs/slideshow-demo.png`.
Chrome Web Store promo tiles - small 440×280 and marquee 1400×560 - are at
`docs/promo/`.)

---

## 8. Single-purpose statement & per-host justification (Chrome)

**Single purpose (paste into the Chrome "single purpose" field):**

Reddit Slideshow Spectacular! has one purpose: to turn the Reddit feed the user is currently viewing into a full-screen, keyboard-driven media slideshow of that feed's images and videos.

**Host-permissions justification (Chrome's single field - max 1000 chars; paste the line below as-is. `downloads` is a separate per-permission field above):**

All host access serves one purpose: turning the Reddit feed the user is viewing into a media slideshow. old.reddit.com / www.reddit.com - read the page's listing JSON to build and paginate the slide queue, and on a keypress write to the user's account: up/down vote (`/api/vote`), block an author (`/api/block_user`), or friend/follow them (`/api/friend`). api.redgifs.com / media.redgifs.com / i.imgur.com / imgur.com, plus any streamable.com and giphy.com subdomain - resolve and fetch provider clips (Redgifs, Imgur .gifv, Streamable, Giphy) so they play as native video, and expand Imgur albums; all without cookies. v.redd.it - fetch a video's DASH manifest (without cookies) for its separate audio track so the clip plays with sound. i.redd.it / preview.redd.it / external-preview.redd.it - fetch Reddit images/previews (without cookies) to compute a local perceptual hash that skips re-uploaded duplicates (on by default); nothing leaves the device.

(Catbox files.catbox.moe loads directly in the page and needs no host permission, so it's not in the field above.)

## Downloads Justification

Used solely for the in-overlay "download" control. When the user clicks it, the extension saves the single image or video currently shown in the slideshow to the user's computer via chrome.downloads, with a filename derived from the post. It runs only on that explicit click — never automatically — uploads nothing, and does not read or collect the user's download history.

---

## 9. Review notes (paste into "Notes for reviewers")

This is a plain-JavaScript Manifest V3 WebExtension built with WXT; the same
source builds the Firefox and Chrome packages. There is NO minified, obscured,
remote, or eval'd code - all logic ships in readable JS, and no script is
loaded from a remote server. No developer backend exists; the extension talks
only to Reddit, Reddit's media hosts, and the content providers a post links to
(Imgur, Redgifs, Streamable, Giphy, Catbox), to fetch the media being viewed.
Settings are stored locally via storage.local.

How to test: sign in to Reddit, open any media-heavy feed on
old.reddit.com or www.reddit.com (e.g.
https://old.reddit.com/r/SlideShowSpectacular/, which has one post of every
supported media type), and click the "Reddit Slideshow Spectacular!" toolbar
icon (or press Alt+Shift+S). A
full-screen slideshow opens over the page. Use Left/Right to navigate, Space
to play/pause, M to mute, F for fullscreen, and Esc to close. The gear icon
opens settings, which apply live. Re-upload detection (the perceptual hash that
fetches i.redd.it / preview.redd.it images) is on by default and can be turned
off with the "Also skip re-uploaded images" setting.

Source: https://github.com/Rio517/reddit-slideshow-spectacular

---

## 10. Source-code submission (AMO)

AMO requires source because the build bundles and minifies (WXT, which uses Vite + esbuild). Upload the sources zip WXT emits at .output/reddit-slideshow-<version>-sources.zip (also attached to the matching GitHub release); it contains package-lock.json, build.sh, and BUILD.md.

Build instructions (also in BUILD.md inside the source zip — paste into the reviewer build field):

Operating system: Linux (Ubuntu 24.04 in CI) or macOS; no OS-specific steps.
Node.js: 20.x LTS recommended; also builds on Node 24 (the AMO reviewer default). Install from https://nodejs.org/ or with nvm: nvm install 20 && nvm use 20. npm ships with Node (10+); no other global tools.
Build: from the project root run ./build.sh (which runs `npm ci` then `npm run zip`). The submitted add-on is .output/reddit-slideshow-<version>-firefox.zip.
All source is plain, readable, JSDoc-typed JavaScript — no obfuscation and no remote or eval'd code; the only minification is the standard WXT/Vite production build, for which this source is provided.

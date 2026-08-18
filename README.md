# Reddit Slideshow Spectacular!

**[Visit the site →](https://rio517.github.io/reddit-slideshow-spectacular/)**

A full-screen, keyboard-driven slideshow of the images and videos in **your own
Reddit** - the feed you're already looking at. Open your Home feed, a community
you've joined, one of your Custom Feeds (multireddits), any subreddit, your saved
posts, or a search on `old.reddit.com` or `www.reddit.com`. Open with the toolbar icon
or keyboard shortcut, and that exact view becomes the slideshow.

**Private, and built on your existing setup.** It reuses your logged-in Reddit
session - no API keys, no separate account, nothing to re-subscribe to - and runs
entirely in your browser. No analytics, no tracking, no developer servers (there
are none); your settings stay on your computer. It plays direct images, galleries,
Reddit-hosted video, Redgifs, Imgur, Streamable, Giphy, Catbox, and crossposts.

**Made for the big screen.** Pop the slideshow out into its own window, then
AirPlay or Chromecast that window to your TV for a hands-off, lean-back feed.

<a href="docs/slideshow-demo.png">
  <img src="docs/slideshow-demo.png" width="820"
    alt="A full-screen slideshow over r/SlideShowSpectacular showing a golden-retriever puppy bounding through a sunlit meadow: the position counter top-left, the control rail (prev/play/next, mute, fullscreen, open-in-window, help, settings) down the right, and a bottom-left byline reading /u/rio517 to /r/SlideShowSpectacular from i.redd.it at 1122×1482 with open-original and download buttons">
</a>

## Features

- Launch from any `old.reddit.com` or `www.reddit.com` feed via the toolbar icon
  or **Alt+Shift+S** (changeable in the extension's preferences) - it starts at
  the top of the current feed (its own sort).
- Auto-advance on a timer or arrow through manually; videos advance when they end.
- Pages forever - follows Reddit's pagination so the show keeps going.
- Per-kind rendering: `<img>` for images/galleries and native `<video>` for
  `v.redd.it`, Redgifs, Imgur, Streamable, Giphy, and Catbox - with Reddit-video
  **audio** (a companion track synced to the silent fallback clip).
- Skips duplicates (reposts, crossposts, repeated galleries) and broken media -
  duplicates are filtered before they show.
- **Upvote/downvote** the current post with the **↑/↓** keys, through your
  logged-in session - the arrow at the head of the title shows your vote.
- **Download** the current media, or open the original post, from the overlay.
- **Block** an author (**I**) or **friend / follow** them (**A**) - through your
  logged-in session.
- A byline under each slide - `/u/author to /r/subreddit`, with the source
  (`{domain} • {W}×{H}`) on its own line.
- Lots to tune from the overlay's gear, applied live with no reload - see
  [Settings](#settings).

## Settings

Tune it from the gear in the overlay or the full options page - changes apply
live, no reload:

- **Seconds per image** - and how long to wait for slow media before skipping it
- **Slide transition** - fade, slide, push, zoom, flip, or none
- **Top countdown bar** - on video slides, every slide, or never
- **Autoplay videos** and **start muted**
- **Toggle NSFW** - follows your logged-in Reddit session by default
- **Skip duplicates** - reposts, crossposts, repeated galleries, and (on by
  default) the same image re-uploaded under a new link, via a local perceptual
  hash
- **Pan & zoom** for images too big to see at once - a slow push-in and drift
  across, with full control of the sequence
- **Always show the count & skips** - keep the position counter and
  skipped-count badge up even after the controls fade, so a gap from a skipped
  item stays explained
- **Always show the title & byline** - keep the post's title and byline up even
  after the controls fade

## Install

**[Add to Chrome](https://chromewebstore.google.com/detail/reddit-slideshow-spectacu/pcfajhfnnkkpadnfedkgjfgclffeoenp)**
— free, from the Chrome Web Store (also Edge, Brave, and other Chromium
browsers). It runs entirely in **your** browser, on your real (logged-in) Reddit
session.

**[Add to Firefox](https://addons.mozilla.org/firefox/addon/reddit-slideshow-spectacular/)**
— free, from Firefox Add-ons. Same private, local, logged-in-session behavior
as the Chrome build.

### Languages

The interface is available in English, Spanish, French, German, Italian, and
Arabic. It follows your browser's language by default, or pick one explicitly
under **Language** on the options page. Arabic renders right-to-left.

### Build from source

Prefer to build it yourself — or want the Firefox build now? First build it:

```sh
npm install
npm run build         # Firefox → .output/firefox-mv3/
npm run build:chrome  # Chrome  → .output/chrome-mv3/
```

#### Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…** and pick
   `.output/firefox-mv3/manifest.json`.
3. After code changes, re-run `npm run build` and click **Reload**.

Temporary add-ons are removed when you restart Firefox - just load it again. For
a permanent install, use Firefox Developer Edition / Nightly / ESR, set
`xpinstall.signatures.required` to `false` in `about:config`, then install the
`npm run zip:firefox` package from `about:addons` → **Install Add-on From File…**.

#### Chrome (unpacked, for development)

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (toggle, top-right).
3. Click **Load unpacked** and select the **folder** `.output/chrome-mv3/`
   (the folder itself, not a file inside it).
4. Click the toolbar's puzzle-piece icon and pin **Reddit Slideshow Spectacular!**.
5. After code changes, re-run `npm run build:chrome` and click the **↻ reload**
   icon on the extension's card in `chrome://extensions`.

Unlike a Firefox temporary add-on, a Chrome unpacked extension stays installed
across restarts (Chrome shows a "disable developer-mode extensions" prompt on
startup that you can dismiss).

## Use

- New here? Open **[r/slideshowspectacular](https://old.reddit.com/r/slideshowspectacular)** -
  a small demo feed (and where new releases are announced) - and launch the
  slideshow to see it run.
- Open any `old.reddit.com` or `www.reddit.com` feed, then click the toolbar
  icon or press **Alt+Shift+S** (changeable in the extension's preferences).
- Keys: **←/→** previous/next, **↑/↓** upvote/downvote, **Space** play/pause,
  **M** mute, **F** fullscreen, **D** download, **I** block the author (and skip
  their post), **A** friend/follow the author, **Esc** close. You can also click
  the dark backdrop to close.
- Open settings from the **gear** in the overlay's control rail (or the
  extension's options page); changes apply to the running slideshow immediately.

## Commands

```sh
npm run dev          # WXT dev runner (fresh Firefox profile - not logged in)
npm run build        # build BOTH → .output/firefox-mv3/ and .output/chrome-mv3/
npm run build:firefox # Firefox MV3 only
npm run build:chrome # Chrome MV3 only
npm run zip          # build BOTH zips → .output/ (Firefox + sources, Chrome)
npm run zip:firefox  # packaged zip (Firefox / AMO)
npm run zip:chrome   # packaged zip (Chrome Web Store)
npm run icons        # regenerate PNG icons from public/icon.svg (Bash + librsvg/rsvg-convert; macOS/Linux)
npm test             # Vitest unit tests (fast; offline)
npm run test:prod    # e2e: build Chrome + drive the loaded extension in Chromium
npm run typecheck    # tsc --noEmit over JSDoc-typed JS
npm run lint         # ESLint (incl. unsafe-DOM checks)
npm run format       # Prettier check
npm run webext:lint  # Mozilla addons-linter on the built (Firefox) output
```

The same source builds both browsers; WXT emits a Chrome `service_worker`
background and a Firefox event page from one `defineBackground`.

`npm test` is the fast offline unit suite. `npm run test:prod` is the slow e2e
batch (kept out of `npm test`): it loads the built Chrome extension into a real
Chromium (Playwright, `--headless=new`) and drives the actual slideshow over a
mocked listing, so it exercises content-script injection, background messaging,
and the overlay render that the unit tests can't. It needs the Chromium binary
(`npx playwright install chromium`); CI runs it as its own job.

The PNG icons in `public/icon/` are committed and are the source of truth for
the manifest (ADR 0009), so a normal build needs no extra tooling. `npm run
icons` only re-rasterizes them from `public/icon.svg` and requires Bash plus
librsvg (`rsvg-convert`), so it runs on macOS/Linux (or WSL), not bare Windows.

`npm run dev` launches a clean Firefox profile that is **not** logged into
Reddit, so prefer the temporary-add-on flow above for real testing.

## Regenerating Screenshots

> Maintainer note: `npm run screenshots` regenerates the add-on-store assets - a
> slideshow shot plus the options page in light and dark. The Chromium binary
> isn't fetched by `npm install`, so run `npx playwright install chromium` once
> first.

## Publishing

Both stores take the `wxt zip` output; submission is manual (no automated
release yet). Bump `version` in `package.json` before each release - both
stores reject a re-used version.

The store listing copy - the marketing text plus each version's "what's new" /
release notes - lives in `docs/store-listing/<lang>.md`, one file per locale.
Update it alongside the release, then paste it into each store's per-locale
listing and release-notes fields at submission. The GitHub release body is
written when the release is published (**New** / **Fixed** sections; see the
v1.2.0 release for the format).

**Firefox (AMO):**

1. `npm run zip:firefox` → a `.zip` in `.output/` (built extension + a sources zip).
2. Submit it as a new version at
   [addons.mozilla.org/developers](https://addons.mozilla.org/developers/).
   This extension requests only `storage` plus scoped Reddit/Redgifs hosts and
   ships no remote code, which keeps review straightforward.
3. To self-distribute instead of listing, choose **On your own** to get a
   signed `.xpi`.

**Chrome Web Store:**

1. `npm run zip:chrome` → a `-chrome.zip` in `.output/`.
2. Upload it at the
   [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole),
   complete the listing, and submit for review.

## Project layout

```
entrypoints/      background, content script, options page (WXT entrypoints)
lib/              framework-free core: slides, queue, controller, overlay,
                  dedup, settings, session orchestration
assets/           overlay.css
public/           extension icon
tests/            Vitest unit tests + offline fixtures; e2e/ drives the
                  loaded extension in Chromium (npm run test:prod)
docs/             product spec, research, and ADRs
```

The core logic in `lib/` is DOM/extension-agnostic and unit-tested; the
`entrypoints/` are thin bindings to the browser.

## Docs

- Architecture decisions: `docs/adr/` (see `docs/README.md` for the index).
- Product spec and research: `docs/product/`, `docs/research/`.
- Store listing & release-notes copy: `docs/store-listing/` (one file per locale).
- Current status and next steps: `NEXT_STEP.md`.

## Status

v1 is feature-complete and unit-tested, and published on both the
[Chrome Web Store](https://chromewebstore.google.com/detail/reddit-slideshow-spectacu/pcfajhfnnkkpadnfedkgjfgclffeoenp)
and [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/reddit-slideshow-spectacular/).

## Privacy

No analytics, no tracking, no developer servers - the extension fetches only the
Reddit feed and the media you are viewing (including clips resolved from Redgifs,
Imgur, Streamable, Giphy, and Catbox), plus, for re-upload detection, the image
bytes it hashes locally on your computer. The actions that write to your Reddit
account are voting (**↑/↓**), blocking an author (**I**), and friending/following
an author (**A**) - each only when you press the key. Your Reddit cookies go to
Reddit only; every provider request is cookie-less. Settings are stored locally.
See [PRIVACY.md](PRIVACY.md).

## License

[MIT](LICENSE) © Mario Olivio Flores

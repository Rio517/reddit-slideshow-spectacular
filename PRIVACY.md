# Privacy Policy - Reddit Slideshow Spectacular!

_Last updated: 2026-08-18_

**Short version: Reddit Slideshow Spectacular! collects nothing, sends nothing to
the developer, and has no analytics, tracking, ads, or accounts. Everything it
does happens locally in your browser.** The extension turns a Reddit feed you are
already viewing into a full-screen media slideshow.

## What the extension stores

Only your own settings - the per-image timer, slide transition, timer-bar
mode, autoplay, start-muted, Include-NSFW, the two de-duplication toggles, the
max-load-wait, the pan & zoom options, and your interface language. These are
saved with the browser's local extension storage (`storage.local`) **on your
computer**. They are not synced, uploaded, or shared, and contain no personal
information. Removing the extension removes them.

## Network requests the extension makes

Requests go only to Reddit, Reddit's own media servers, and the content providers
a post links to (Imgur, Redgifs, Streamable, Giphy, Catbox). Never to any server
operated by the developer (there is none):

- **Feed data.** To build the slideshow, the extension fetches the JSON for
  the feed you are on (`old.reddit.com` / `www.reddit.com`). This request
  includes your existing Reddit session cookies (`credentials: "include"`) so it
  returns exactly what you can already see while logged in - including over-18
  content only if your own Reddit account/session allows it. The request is made
  from the extension's background context; your cookies are sent **to Reddit
  only** and are never read, stored, or transmitted elsewhere by the extension.
- **Media.** Images and videos are loaded directly by your browser from wherever
  the post links - Reddit's own hosts (`i.redd.it`, `v.redd.it`), Catbox
  (`files.catbox.moe`), and other image hosts - the same way they would load on
  Reddit itself.
- **Reddit-video audio.** `v.redd.it` clips carry their audio as a separate
  stream, so the background fetches that clip's small DASH manifest from
  `v.redd.it` (**without cookies**) to find the audio track's URL, which your
  browser then plays alongside the silent video.
- **Account actions (only when you press a key).** A few keys write to your
  Reddit account through your logged-in session, sending your Reddit session
  cookies to Reddit (and `/api/me.json`, for the required CSRF token) - and to
  Reddit only:
  - **↑/↓** casts an upvote/downvote on the current post (`/api/vote`).
  - **I** blocks the current post's author (`/api/block_user`), then skips past
    their post.
  - **A** adds the author as a friend, or follows them (`/api/friend`).

  These are the **only** actions the extension takes that write to your Reddit
  account, and each happens **only** when you press its key. Nothing is sent
  anywhere but Reddit.

- **Download.** The download control saves the current media to your computer with
  the browser's downloads API; the file is fetched from its host (without cookies)
  and saved locally - nothing is uploaded.
- **Provider clips.** For some providers the extension first resolves a directly-
  playable video URL - from the provider's API (`api.redgifs.com`,
  `api.streamable.com`) or by rewriting the link (Imgur, Giphy). Your browser then
  plays the clip **directly** as native video from the provider's media host
  (`media.redgifs.com`, `i.imgur.com`, `*.streamable.com`, `*.giphy.com`), the same
  way it loads any media. On new Reddit (`www.reddit.com`), whose page security
  policy blocks some cross-origin video, the extension's background instead fetches
  that clip's bytes from the same media host and plays them locally as a fallback.
  All of these requests - the API resolves and any byte fallback - are made
  **without cookies** (`credentials: "omit"`) and with no referrer; each provider
  receives only what any request to load that clip would (e.g. your IP address and
  standard request data), subject to that provider's own privacy policy (e.g.
  [Redgifs'](https://www.redgifs.com/privacy)). The extension sends no account
  information or tracking of its own. (If Redgifs or Streamable can't be reached,
  the clip falls back to the provider's standard `<iframe>` embed, loaded by your
  browser the same way Reddit embeds it.)
- **Re-upload detection (on by default).** To catch the same image re-posted
  under a new link (which the basic skip can't see), the extension fetches the
  image and its previews from `i.redd.it` / `preview.redd.it` /
  `external-preview.redd.it` to compute a local perceptual hash. These fetches
  are made **without cookies** (`credentials: "omit"`), the hashing happens
  entirely in your browser, and no image or hash leaves your computer. You can turn
  this off with the "Also skip re-uploaded images" setting.

## Permissions and why they are needed

- **`storage`** - to save your settings locally (above).
- **Host access to `old.reddit.com`, `www.reddit.com`** - to read the listing
  JSON for the page you are on. (Reddit video on `v.redd.it` and external image
  hosts load directly in the page and need no permission.)
- **Host access to `i.redd.it`, `preview.redd.it`, `external-preview.redd.it`** -
  so the background can fetch Reddit-hosted images and previews to compute the
  local perceptual hash used for on-by-default re-upload detection. These fetches
  are made without cookies; nothing leaves your computer.
- **Host access to `v.redd.it`** - so the background can fetch a Reddit video's
  DASH manifest (without cookies) to find its separate audio track. The video and
  audio themselves load directly in the page and need no permission.
- **Host access to `api.redgifs.com`, `media.redgifs.com`, `imgur.com`,
  `i.imgur.com`, `*.streamable.com`, `*.giphy.com`** - so the background can
  resolve and fetch provider clips (Redgifs, Imgur, Streamable, Giphy) and play
  them as native video, and expand an Imgur album into its images via Imgur's
  keyless album endpoint. These fetches are made without cookies.
- **`downloads`** - so the download control can save the media you are viewing to
  your computer, with a sensible filename.

The extension requests no other permissions: no browsing history, no bookmarks,
no access to other sites, and no remote code.

## What the extension does NOT do

- No analytics, telemetry, crash reporting, or usage tracking.
- No advertising and no selling or sharing of data.
- No developer-operated servers; nothing is ever sent to the author.
- No accounts, sign-in, or collection of personal information.

## Contact

Questions about this policy: **mario@knyflores.com**, or open an issue at
<https://github.com/Rio517/reddit-slideshow-spectacular/issues>.

## Changes

If this policy changes, the "Last updated" date above will change and the new
version will be committed to this repository.

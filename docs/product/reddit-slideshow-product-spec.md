# Reddit Slideshow Spectacular! - Product Spec Draft

Date: 2026-05-29
Status: Draft

## Problem

Old Reddit is efficient for browsing, but media-heavy feeds still require opening posts, galleries, image URLs, and external media sites one at a time. The desired extension should turn the current old Reddit feed into a full-screen slideshow that uses the signed-in Reddit session already present in Firefox.

## Primary User

A Firefox user who browses `old.reddit.com`, uses Reddit Enhancement Suite, and wants a lightweight slideshow over the current feed or subreddit without leaving old Reddit.

## Goals

- Start a slideshow from the current old Reddit listing page.
- Walk through media posts in Reddit order.
- Support direct Reddit images, Reddit galleries, Reddit-hosted videos/GIF-like media, and Redgifs as a first-class external provider.
- Fetch additional listing pages automatically so the slideshow can continue beyond the currently visible page.
- Use full-resolution media where practical, preferring `i.redd.it` assets over lower-resolution preview URLs.
- Provide keyboard navigation with left/right arrows.
- Advance images on a configurable timer such as 3, 5, or 10 seconds.
- Continue automatic advancement after manual arrow-key navigation.
- Let video/GIF-like media advance when playback completes.
- Provide a persisted muted/audio behavior setting for video providers.
- Coexist with Reddit Enhancement Suite.

## Non-Goals For Version 1

- Replacing or modifying RES itself.
- Supporting every external media host.
- Requiring Reddit API app credentials.
- Rebuilding Reddit's browsing, commenting, or moderation workflows (a single
  up/down-vote shortcut on the current post aside).
- Syncing settings across browsers unless it comes nearly free through WebExtension storage.

## Core Experience

The extension adds a browser action and/or lightweight old Reddit page control to start the slideshow from the current feed. When launched, it opens a full-window overlay on top of old Reddit.

The overlay shows one media item at a time. Left and right arrow keys move backward and forward through the queue. The image timer remains active even when the user manually advances, so pressing right does not pause the slideshow. For videos and animated clips, completion advances to the next item when reliable playback events are available.

The overlay should expose minimal controls: close, previous, next, play/pause slideshow, timer choice, mute/unmute, and source/open-original. Settings should avoid covering the media.

## Queue Behavior

The queue begins from the current old Reddit context: front page, subreddit, multireddit, search, or other listing-like page where feasible. The first queue can be seeded from the DOM, but the durable source of truth should be Reddit listing JSON for pagination.

When the queue nears the end, the extension fetches the next listing page using Reddit listing pagination and appends supported media in the same order Reddit returns it.

If a post has multiple media items, such as a Reddit gallery, each media item becomes its own slide while preserving the post-level context.

The queue is **media-only by definition.** Text/self posts, outbound article links, stickied/announcement posts, and promoted/ad posts are dropped from the queue, not shown as placeholder slides - a linear auto-advancing slideshow that lands on non-media breaks the lean-back experience. Placeholder slides are reserved for the rare case of a _resolution failure on something that should have rendered_ (e.g. a blocked Redgifs clip). This "skip anything not renderable" behavior is core to v1, not a configurable filter. Because most of a listing page can be non-media, pagination must be triggered on _posts scanned_, not _slides produced_, so a sparse page does not cause back-to-back fetches.

## Media Support

### Reddit-hosted images

Direct image posts should resolve to full-size `i.redd.it` URLs when available. Preview URLs should be fallback only. The resolver should preserve the original image dimensions so the renderer can make good decisions for 4K and other high-resolution displays.

### Reddit galleries

Gallery posts should resolve through Reddit listing data, using gallery item order and media metadata to derive full-resolution image URLs.

### Reddit-hosted videos and GIF-like media

Reddit-hosted videos should use playable video URLs from listing media metadata when available. Playback completion should advance the slideshow.

v.redd.it is DASH/HLS with separated tracks. The listing's `secure_media.reddit_video` carries `fallback_url` (a plain `.mp4`), `dash_url`, `hls_url`, `duration`, dimensions, `is_gif`, and `has_audio`. The resolver reports `audioAvailable` from `has_audio` (false for `is_gif` clips). The `fallback_url` plays in a plain `<video>` and is video-only; the separate audio track is recovered from the DASH manifest and played from a companion `<audio>` synced to the silent video, so the mute/unmute control governs real Reddit-video sound (ADR 0018).

### Redgifs

Redgifs is a first-class provider - the single most common media domain on real
NSFW feeds. It plays as **native `<video>`** (ADR 0016):

- Parse the id from `redgifs.com/watch/<id>` (or `/ifr/<id>`). The background
  resolves the clip's direct mp4 plus `duration` and `hasAudio` from the Redgifs
  API (`api.redgifs.com`, token cached, concurrency-limited and timed out).
- On Firefox the clip plays **directly** from `media.redgifs.com`. That CDN 403s
  a reddit `Referer`, so the `<video>` carries `referrerpolicy="no-referrer"`,
  which Firefox honors on a media element. On Chrome that attribute is a no-op on
  media elements, so the Chrome build plays every Redgifs clip through the blob
  proxy below instead. Either way this gives correct timing (advances on the real
  clip end), global mute/unmute, and no per-clip unmute.
- The blob proxy serves all Chrome playback and the `www.reddit` CSP fallback: on
  a page whose CSP blocks cross-origin media the Firefox direct load fails too,
  and the slide falls back to the proxy. The background fetches the bytes (no
  Referer, no cookies, byte-capped) and the content script plays them as a
  `blob:` URL the CSP allows.
- If resolution fails (API down, timeout), the slide falls back to the Redgifs
  first-party iframe embed (`<iframe src="…/ifr/<id>">`), which carries the
  Origin/Referer Redgifs whitelists and needs no host permission.

Unresolvable or removed Redgifs items degrade gracefully to a placeholder slide
with title/source context and an action to open the original Redgifs page.

### Other hosts

Shipped providers beyond Redgifs: Imgur `.gifv` and albums, Streamable, Giphy,
and Catbox direct files (ADRs 0011-0015). Further hosts follow the same
provider pattern: detection in `lib/slides.js`, a background resolver where a
network resolve is needed, a scoped host permission, and an ADR.

## Settings

- Image timer: 1 second to 5 minutes on a slider with fine-at-the-low-end
  stops (default 5s), plus a max-load-wait for slow media.
- Slide transition (none/fade/slide/push/zoom/flip) and the top timer-bar mode
  (video slides / every slide / never).
- Start muted: on/off (governs Reddit-video audio and provider clips with sound).
- Autoplay slideshow: on/off (off starts the slideshow paused).
- Include NSFW: follow Reddit / always hide. **Default: follow Reddit** - show over-18 content only insofar as the signed-in session already exposes it. This is the least-surprising default and avoids the extension becoming an NSFW-unlocking tool.
- Duplicate skipping: URL-level dedup plus content-based re-upload detection
  (perceptual hash, on by default).
- Pan & zoom for large images, with the full phase sequence configurable and
  the zoom scale adapting to each image's resolution.
- Interface Language (auto → browser language, or an explicit pick) and a
  configurable launch shortcut (default Alt+Shift+S).

## Permissions

Install-time host permissions are scoped to the hosts the extension actually
fetches from (see ADR 0004 and the manifest in `wxt.config.ts`):

- `https://old.reddit.com/*`, `https://www.reddit.com/*` - listing JSON for both
  frontends (ADR 0008), and the keypress-driven account writes (vote/block/friend).
- `https://i.redd.it/*`, `https://preview.redd.it/*`,
  `https://external-preview.redd.it/*` - fetch Reddit images/previews to hash
  for re-upload detection.
- `https://v.redd.it/*` - fetch the DASH manifest for the separate audio track.
- `https://api.redgifs.com/*`, `https://media.redgifs.com/*` - resolve native
  Redgifs video and fetch its bytes for the CSP fallback (ADR 0016).
- `https://imgur.com/*`, `https://i.imgur.com/*` - `.gifv` mp4 fetch and the
  keyless album expansion (ADRs 0011, 0015).
- `https://*.streamable.com/*`, `https://*.giphy.com/*` - resolve and fetch
  provider clips (ADRs 0013, 0014). Catbox files load directly in the page and
  need no host permission (ADR 0012).

Plus the `storage` API permission for settings and `downloads` for the
save-media control (ADR 0017). No all-URLs or broad host access is requested.

## Error Handling

- Unsupported media: show a placeholder slide with source/open-original action.
- Provider blocked or failed: show a recoverable error for that slide, then continue.
- Pagination exhausted: stop at the end and show an end state.
- Reddit request rate-limited or failed: retry conservatively, then pause pagination with a visible message.
- Autoplay blocked: show a play button and keep navigation available.

## Accessibility And Controls

- Left / right arrow: previous / next slide (Shift+Right skips to the next post).
- Up / down arrow: upvote / downvote the current post (through the session).
- Page Up / Page Down: jump back / ahead 10.
- Space: pause/resume timer or video playback.
- M: mute / unmute. F: fullscreen. ?: keyboard-shortcut help. Escape: close (or
  dismiss an open panel first).
- D: download the current media. I: block the author (then skip their post). A:
  friend / follow the author (all through the session).
- Controls must be keyboard accessible; the modal traps focus and makes the page
  `inert` while open, with an obvious close path (top-right ×, backdrop, Escape).

## Compatibility

Primary target is Firefox on desktop. The extension should coexist with Reddit Enhancement Suite by using isolated content scripts, avoiding global page mutations where possible, and namespacing injected DOM/classes.

## Backlog

Work intentionally outside the current build. (Downloading the current media,
pan & zoom, and Reddit-video audio shipped - see ADRs 0017, 0010, 0018.)

### Higher-resolution inspection

The byline already shows each slide's source dimensions, and slides track
original-vs-preview quality (`i.redd.it` original vs a `preview.redd.it`
fallback). The remaining idea is an explicit "downscaled preview" indicator and,
where Reddit exposes one, a path to the full-resolution original.

### Streaming the blob-proxy playback

Parked - the proxied path buffers the whole clip before playing. Streaming it
(MediaSource) would need an in-browser remuxer for a narrow Chrome-only win; see
`docs/research/proxy-streaming-mediasource.md`.

## Open Questions

- Beyond the core media-only queue, should v1 add optional refinements such as images-only / videos-only?
- Should an auto-advancing NSFW slide behave differently (e.g. require a tap to reveal) than a SFW one?
- Should the queue include posts that RES has hidden or filtered on the current page?
- Should the extension start from only the visible sort/filter state, or support special pages like saved, user profiles, and search in v1?

## Validation Spikes

Run these against live Firefox and real Reddit before committing to the full build; each is a go/no-go:

- **Reddit listing access:** a background fetch of paginated `.json` listings using the existing session, without OAuth, at slideshow-realistic request volume, survives rate limits and returns expected shapes.
- **v.redd.it video:** `secure_media.reddit_video.fallback_url` plays inside the overlay (muted), and the separate-audio-track behavior is understood.
- **Redgifs iframe:** `https://www.redgifs.com/ifr/<id>` embeds and plays from the extension overlay in Firefox without a `redgifs.com` host permission.
- **RES coexistence:** the prototype overlay alongside RES on a real old Reddit page has no arrow-key/keyboard capture or DOM-mutation conflicts.
- **Field-shape capture:** real captured fixtures (not hand-authored) for galleries (`gallery_data` order + `media_metadata`), Reddit video, crossposts (`crosspost_parent_list[0]`), and Redgifs match the resolver's assumptions.

## Acceptance Criteria

Feature criteria:

- From an old Reddit subreddit listing, the user can launch a full-screen slideshow.
- Direct `i.redd.it` image posts display as full-resolution slides.
- Reddit galleries are expanded into sequential slides.
- The queue contains only renderable media; text/link/stickied/promoted posts are dropped.
- Right and left arrow navigation works.
- Image slides advance using the selected timer.
- Manual navigation does not disable the running slideshow timer.
- Reddit-hosted video advances when playback ends; Redgifs slides play inline and advance on a duration timer.
- The queue fetches at least one additional Reddit listing page when nearing the end, with a visible loading state and a distinct end-of-queue state.
- Settings persist between sessions.

Outcome criteria (what "good" means for a lean-back tool):

- Time-to-first-slide after launch is under ~1 second on a typical listing.
- The fraction of feed media posts that render (vs fall back) is high; the fallback rate is visible and explainable.
- Slide-to-slide transitions are smooth - a preloaded next slide (1-2 ahead) is ready before its turn, so advancing does not stutter.
- A position/progress affordance lets the user tell where they are and whether more is loading.

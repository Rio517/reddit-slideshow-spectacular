# ADR 0015: Imgur Albums Via The Keyless `ajaxalbums` Endpoint

Date: 2026-06-01
Status: Accepted

## Context

Imgur album and gallery links arrive in Reddit listings as a bare page URL with
`post_hint: "link"` and no media payload:

- `https://imgur.com/a/<id>`
- `https://imgur.com/gallery/<slug>-<id>` (or `/gallery/<id>`)

The listing JSON carries only the link - no image list, no thumbnails we can use.
A bare Imgur album link carries no direct media, so the generic image path (which
rejects a non-image URL) yields no slides; an album needs explicit member
expansion to contribute its multiple images.

### Official API: rejected

The documented way to expand an album is `GET api.imgur.com/3/album/<id>`, which
requires an `Authorization: Client-ID <key>` header. We do **not** use it:

- **Key registration is closed.** Imgur has disabled new application
  registration, so we cannot obtain a Client-ID at all. This is not a
  preference - the door is shut.
- **A shipped key is a shared quota we'd own.** Even if registration reopened, a
  Client-ID baked into a published extension is a single application credential
  whose rate limit is shared across every install. We would be on the hook for a
  pooled quota we cannot meter. (The Client-**Secret** must never ship; only the
  Client-ID is public - but that is moot while registration is closed.)
- **Per-IP is what actually governs.** Imgur's practical rate limiting is
  per-client-IP for the front-end endpoints, which is why long-lived consumers
  like RES have hotlinked Imgur for years without owning an app quota. Each
  user's browser makes its own requests from its own IP.

### Keyless endpoint

Imgur's own album page fetches its images from an unauthenticated front-end
endpoint that needs no key and no special header:

```
GET https://imgur.com/ajaxalbums/getimages/<id>/hit.json
```

Verified behavior (real album `2orxIa1`, captured in
`tests/fixtures/imgur/album-2orxIa1.json`):

- **Success:** HTTP 200, `Content-Type: application/json`. Body shape:
  `{ "data": { "count": N, "images": [ … ], "include_album_ads": false },
"success": true, "status": 200 }`. Each image carries `hash`, `ext`
  (e.g. `".jpg"`), `width`, `height`, `animated`, `prefer_video`, plus metadata.
  A **video** member has `ext: ".mp4"` with `animated`/`prefer_video`/`looping`
  true and a `has_sound` flag. The direct file is `https://i.imgur.com/<hash><ext>`.
- **No header required.** A plain GET returns the full JSON; an
  `X-Requested-With: XMLHttpRequest` header makes no difference.
- **Empty / invalid album does not error.** A missing id still returns HTTP 200
  with `{ "data": [], "success": true, "status": 200 }`. The discriminator is the
  **type of `data`**: an object (with `images[]`) means a real album; an empty
  **array** means nothing to show. HTTP status and `success` are useless for
  detecting emptiness.
- **Direct hotlinking works from a Reddit page.** `i.imgur.com/<hash><ext>`
  returns HTTP 200 (`image/jpeg` for images, `video/mp4` for `.mp4`) whether the
  request carries no `Referer`, a `www.reddit.com` `Referer`, or an
  `old.reddit.com` `Referer` - no redirect to a "removed" placeholder. So an
  image member renders directly in an `<img>` and a `.mp4` member in a `<video>`;
  no blob proxy is needed on a referer-free CDN like this. (Imgur `.gifv` → `.mp4`,
  ADR 0011, is the separate single-clip path whose binary CDN does 403 a referer;
  `i.imgur.com` mp4 album files do not, so they play direct with the blob proxy
  only as the CSP fallback - ADR 0011/0013/0014's direct-with-proxy-fallback.)

## Decision

Expand an Imgur album link into its member images in the background, before the
content script ever sees the slides - mirroring how Redgifs/Streamable resolve,
but as a **1 → N expansion** rather than a 1 → 1 upgrade.

- **Detection (`lib/slides.js`).** A post on `imgur.com` (or a `*.imgur.com`
  host that is not the `i.` media host) whose path is `/a/<id>` or
  `/gallery/<…-><id>` emits a single **placeholder** slide with a new
  `provider: "imgur-album"` marker. The placeholder carries the album id (via its
  `sourceUrl`) and the post's display context (title, NSFW, permalink) but no
  renderable media - it exists only to be expanded.
- **Resolver (`lib/imgur.js`).** A background resolver fetches the `ajaxalbums`
  JSON and returns the member list. `resolveImgurAlbumSlides` replaces each
  `imgur-album` placeholder with N member slides
  (`https://i.imgur.com/<hash><ext>`, `provider: "imgur"`), numbered with
  `galleryIndex`/`galleryTotal` when N > 1 so the jump list disambiguates them
  (same treatment as a native Reddit gallery). A `.jpg`/`.png`/… member becomes
  an `image` slide; a `.mp4` member becomes a direct `video` slide
  (`durationMode: "media"`, `audioAvailable` from `has_sound`, and `isGif` -
  filling/looping - only when it is a silent looping clip). It is
  concurrency-limited and timed out via the shared `lib/async-pool.js`.
- **Background wiring (`entrypoints/background.js`).** `fetchQueuePageWithProviders`
  runs the album expansion alongside the Redgifs/Streamable upgrades, so the
  content script receives a fully expanded, ready-to-render queue.
- **Host permission (`wxt.config.ts`).** Add `https://imgur.com/*` for the
  `ajaxalbums` fetch. The image bytes live on `i.imgur.com`, which is already
  permitted (ADR 0011). The fetch is a plain background `fetch` gated only by the
  host permission - it does not go through the proxy-fetch byte allowlist, since
  the images load directly in an `<img>`.

### Fail-soft behavior

A placeholder whose album resolves to **zero images** (empty array) or whose
lookup **fails** (network, timeout, malformed JSON) is **dropped** - the post
contributes no slides. We do not synthesize a broken slide or a skip entry,
because no media load was ever attempted; there is nothing the user could act on.
The drop is logged.

## Consequences

Benefits:

- Multi-image Imgur albums/galleries play inline as a numbered image run, with no
  API key, no shared quota, and no per-image proxy.
- The expansion is invisible to the content script - it consumes the same
  ready-to-render queue it always has.

Costs / limits:

- **Imgur images participate in Layer-2 perceptual dedup.** `i.imgur.com` is on
  the hashable-host allowlist (`HASHABLE_HOSTS`), so the background hashes album
  images the same way it hashes reddit images - an album picture re-uploaded
  standalone (on reddit or imgur) is caught as a perceptual duplicate, not just
  by the exact-URL Layer-1 key. The hash fetch is the privileged byte path
  (host-gated in `background-router.js`), distinct from the direct `<img>`
  display load. Cost: hashing background-fetches each Imgur image (capped, like
  reddit images) when content dedup is on.
- **Unofficial endpoint.** `ajaxalbums` is undocumented and could change or
  vanish. The fail-soft path degrades to "album shows nothing" rather than a
  broken slideshow, and the placeholder/resolver split means a future official
  path could be swapped in behind the same `imgur-album` marker.
- **A `.mp4` member plays as a direct `<video>`** (Chrome and Firefox), with the
  blob proxy as the CSP fallback. An animated **`.gif`** member still renders as
  an `<img>` GIF rather than its `.mp4` twin - acceptable, since the gif loops
  fine in an `<img>`; it could later be upgraded via the `prefer_video` hint.

## Implementation Guidance

- Detect a real album by `data` being an **object** with a non-empty `images`
  array; treat `data` being an array (or absent/empty `images`) as "no images".
- Construct image URLs as `https://i.imgur.com/<hash><ext>` and validate the
  host before trusting them, matching the discipline of the other resolvers.
- Keep the resolver concurrency-limited and timed out; one slow album must not
  hold up the page.
- Image members hotlink directly in an `<img>`; `.mp4` members play directly in a
  `<video>` (`i.imgur.com` is a `DIRECT_VIDEO_HOST`), with the background blob
  proxy used only as the CSP fallback - both verified from a reddit referer.

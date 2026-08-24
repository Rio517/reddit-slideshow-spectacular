# ADR 0022: Reddit Gif Posts as Native Video

Date: 2026-08-24
Status: Accepted

## Context

A `.gif` post - reddit's own upload (`i.redd.it/<id>.gif`) or a link to an
external gif - carries `post_hint: "image"`, so the dispatch in `lib/slides.js`
resolved it through the image path: an `<img>` slide with
`durationMode: "timer"`. An `<img>` has no duration and fires no `ended`, which
made a gif behave like a still photo:

- no countdown bar, since the default `timerBar: "video"` mode shows it only for
  `durationMode: "media"` slides;
- the dwell was the flat per-image timer, so a longer gif was cut off part-way
  and a short one held the screen after it had looped.

Reddit transcodes every gif post to an mp4 and ships it in the listing at
`preview.images[0].variants.mp4.source.url`, on `preview.redd.it` (own uploads)
or `external-preview.redd.it` (linked gifs). It is the same pixels at the source
resolution, far smaller than the gif, and it is what reddit's own player uses.

## Decision

Detect a gif post in the `lib/slides.js` dispatch (URL path ends `.gif`, and the
mp4 variant is present on reddit's preview CDN) and emit a **direct** native-video
slide from the transcode: `kind: "video"`, `durationMode: "media"`,
`isGif: true` (so it fills the viewport and loops, like every other gif-shaped
clip), `audioAvailable: false`. A post with no mp4 variant, or one whose variant
sits on an unexpected host, falls through to the image path unchanged.

`preview.redd.it` and `external-preview.redd.it` join the direct-video host
allowlist (`REDDIT_PREVIEW_HOSTS` in `lib/provider-hosts.js`, already the hashable
hosts). No new `host_permission`: the bytes load as a page resource, and
www.reddit's logged-in CSP is `media-src *.redd.it`.

The slide keeps its ties to the original gif: `sourceUrl` (so the jump list still
reads `i.redd.it`), `downloadUrl` (the save control writes the `.gif`, not the
transcode), and `hashUrl` (the still preview, so Layer-2 dedup still catches a
repost). The Layer-1 identity key is unchanged either way - it is the reddit
basename, which the gif and its transcode share.

A clip's duration is not in the listing, so the overlay reports the element's own
`loadedmetadata` duration through `onMediaDuration`, and the session records it on
the slide. That fills the same gap for Imgur `.gifv` and Catbox clips, whose
dwell previously fell back to the image timer too.

## Consequences

Benefits:

- A gif gets a countdown bar and a dwell that runs the clip out.
- Playback is a decoded video rather than an animated gif: smaller transfer,
  hardware decode, no long main-thread gif decodes.
- Any clip whose provider gave no duration now dwells for its real length.

Costs:

- A gif post whose transcode 404s is skipped as broken media, where before the
  gif itself would have shown. Reddit serves these from its own CDN (verified
  back to 2020 posts), and a missing variant already falls back to the image.
- Only the first upcoming clip is preloaded (the video preload rule), so a
  gif-heavy feed warms one slide ahead instead of two. The transcode is much
  smaller than the gif it replaces, so the net is still faster.

## Implementation Guidance

- Keep the sink gated to the exact preview hosts; the variant URL comes from
  untrusted listing data.
- Read the variant only for a `.gif` post - other post kinds have their own
  resolvers ahead of it in the dispatch.
- `downloadUrl` exists for exactly this split (play one URL, save another); leave
  it unset wherever the two are the same.

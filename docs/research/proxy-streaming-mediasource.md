# Research: streaming the proxy fallback needs a remuxer

Status: investigated, not implemented (June 2026). Captured here so the decision
isn't re-litigated from scratch.

## Proposed streaming path

On the **blob-proxy** playback path the background fetches the whole mp4, hands
the bytes to the content script, which plays them as a single `blob:` URL - so a
large clip fully downloads before the first frame, and the whole file sits in
memory. That path is used for **Redgifs on Chrome** (where `referrerpolicy` is a
no-op on `<video>`, so the CDN 403s the reddit Referer and the bytes must come
through the background) and for the **www.reddit CSP fallback**. Streaming it
(MediaSource + range requests) would start playback sooner and drop the
whole-file buffer.

Firefox direct play already streams the mp4 natively, so this only affects the
Chrome-proxied and www.reddit-CSP-fallback cases; the primary (Firefox) target
gains nothing.

## Blocker: MediaSource needs fragmented mp4, the clips are progressive

A Playwright/Chromium probe settled it. Two clips built with ffmpeg (same codecs,
H.264 Constrained Baseline + AAC-LC) were appended to a real `SourceBuffer`:

| input mp4               | `movflags`                                    | result                          |
| ----------------------- | --------------------------------------------- | ------------------------------- |
| progressive (faststart) | `+faststart`                                  | `sourcebuffer-error` (rejected) |
| fragmented              | `+frag_keyframe+empty_moov+default_base_moof` | `appended-ok`                   |

MediaSource's ISO-BMFF byte-stream format requires an init segment plus `moof`
media segments. A progressive mp4 has a single `moov` describing all samples and
no `moof`, so `appendBuffer` errors. The proxied CDN clips (redgifs / imgur /
giphy) are progressive, so **range-fetch + `appendBuffer` cannot play them**.

Streaming them therefore needs an in-browser **remuxer** (mp4box.js / mux.js, a
few hundred KB) to convert progressive→fragmented on the fly before feeding
MediaSource.

## Integration hazard: `sourceopen` fires only after attach

A MediaSource only fires `sourceopen` once its object URL is attached to the
`<video>` `src` - so you can't probe "will this stream?" without committing the
element. If the first `appendBuffer` then fails (codec mismatch), the element
fires `error`, which the overlay's handler turns into a **skip** - before any
whole-blob fallback can run. A safe stream-or-blob fallback therefore requires
restructuring the proxied branch in `lib/overlay-ui.js` so the `error` /
`loadeddata` listeners attach only **after** the strategy commits.

## Verdict: not worth it for now

Not worth it for now: a few-hundred-KB third-party remuxer (multiplying the
content-script bundle) plus a delicate playback-path restructure, for a narrow
Chrome-only "starts a couple seconds sooner" win that doesn't touch Firefox.

If revisited: validate end to end in Chromium via Playwright (it drives a real
MediaSource); start from a range-fetch background message, remux with mp4box.js,
feed MediaSource, and keep the whole-blob path as the committed-only fallback.

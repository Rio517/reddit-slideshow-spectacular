# Firefox zoom raster jank on very large images

Research into why manually zooming a very large image janks in Firefox but
not Chrome, and what options exist. Measurements come from
`scripts/zoom-jank-experiment.mjs` (real Firefox/Chromium over the real
overlay, longest rAF gap per wheel-zoom step).

## The behavior

Zooming an image via a CSS `transform: scale()` makes the browser rasterize
the element at its effective scale. On a scale _change_, the two engines
schedule that work differently:

- **Chromium** locks the layer's raster resolution (honoring
  `will-change: transform`) and re-rasterizes progressively on background
  tiles - content is briefly soft, then sharpens; the main thread never
  blocks. The cost is GPU memory growth at deep zoom.
- **Gecko/WebRender** re-rasterizes at the new scale before presenting the
  crisp frame, and that pass re-reads the entire decoded source bitmap. The
  frame blocks for a time proportional to source megapixels.
  `will-change: transform` does not lock the raster resolution in Firefox.

Measured per-step stalls (viewport 1200x800, wheel steps):

| Source              | Firefox     | Chromium |
| ------------------- | ----------- | -------- |
| 21 MP (4000x5333)   | ~25-50 ms   | ~18-37ms |
| 108 MP (9000x12000) | ~100-160 ms | ~18-34ms |

CSS-level mitigations tested and **ineffective** in Firefox:
`will-change: transform` on the media, on the frame, and removing the zoom
transition. This is engine scheduling, not something a style hint changes.
The same trade-off (Firefox re-rasters and janks, Chrome locks resolution
and eats memory) is a known pain point for map/design-tool style zooming.

## Options

1. **Canvas level-of-detail layer** (recommended). While a very large image
   is manually zoomed, render it into a viewport-sized `<canvas>` instead of
   transform-scaling the `<img>`:
   - Build a mip chain once per slide, asynchronously, with
     `createImageBitmap(img, { resizeWidth, resizeHeight })` (each level half
     the previous; total cost ~1.3x one full read, off the zoom's critical
     path). Firefox supports `resizeWidth`/`resizeHeight` (added in
     bug 1733559); only `resizeQuality` is unimplemented (bug 1363861), so
     the default scaler applies. The known crop+resize combination bug
     (bug 2010125) is irrelevant - mips resize the full image.
   - Each frame, `drawImage` the visible source window from the smallest
     level that still covers the needed resolution: zoomed out reads a small
     mip; zoomed in reads a viewport-sized _window_ of the original. Every
     frame's read is bounded near viewport size, on both engines.
   - The canvas is a viewport-sized surface with no scale transform, so
     WebRender never rasterizes a huge surface at all.
   - Engage it only above a source-area threshold (~30-40 MP): below that
     the current transform zoom is measured smooth in both engines, and the
     plain path keeps its simplicity.
2. **Reddit preview derivatives as ready-made levels.** Listings carry a
   `preview.images[].resolutions` ladder (the smallest is already used for
   dedup hashing). Could serve as the zoomed-out level without local mip
   building - but it is Reddit-only (imgur/catbox originals have no
   derivatives), needs extra fetches, and still needs the windowed-original
   path for deep zoom. A possible refinement of option 1, not a substitute.
3. **OpenSeadragon-style tile pyramid.** The standard for gigapixel viewers
   (DZI/IIIF tile sources). Needs pre-tiled sources or a tiling server -
   neither exists for arbitrary Reddit media - and a heavyweight dependency
   against this project's zero-dependency content script. Rejected.
4. **Upstream Gecko fix.** File the re-raster stall with the profiler
   capture. Worth doing for the ecosystem; no help on any useful timeline.

## Main-thread decode (second round)

With the canvas LOD in place, profiling still showed sub-second stalls whose
CPU went to progressive-JPEG decode (`decode_mcu_AC_refine`) and Skia
resampling on the content main thread. Cause: Gecko snapshots an
element-sourced `createImageBitmap` on the main thread, and it does not
cache decoded surfaces of very large images - so the mip build and any draw
from the original re-decode the (progressive, slow) JPEG synchronously.
Blob-sourced `createImageBitmap` decodes off-main (`DecodeImageAsync`,
bug 1420223 context).

In place now: reddit slides carry the largest preview; very large sources
render it first (fast decode - the slide swap never waits on the original)
and upgrade in place; the mip build runs at `requestIdleCallback`; deep zoom
samples one retained full-resolution bitmap instead of re-decoding per draw.

The byte-fetch lever is in place: the background proxies the original's
bytes (host permissions bypass CORS; base64 over runtime messaging), and
every LOD build sources `createImageBitmap` from that Blob - decoded off
the main thread - falling back to the element. Sources over 40 MP are
never decoded at full size anywhere (preview stays on display; deep zoom
sharpens from bounded window crops).

## Decision

Option 1, engaged only for very large sources, keeping today's transform
zoom for everything else. `scripts/zoom-jank-experiment.mjs` is the
benchmark to validate the implementation against (target: 108 MP steps at
or under the 21 MP baseline).

Sources:

- https://firefox-source-docs.mozilla.org/gfx/RenderingOverview.html
- https://hacks.mozilla.org/2017/10/the-whole-web-at-maximum-fps-how-webrender-gets-rid-of-jank/
- https://lists.w3.org/Archives/Public/public-css-archive/2022Oct/0266.html
- https://bugzilla.mozilla.org/show_bug.cgi?id=1363861
- https://bugzilla.mozilla.org/show_bug.cgi?id=2010125
- https://developer.mozilla.org/en-US/docs/Web/API/Window/createImageBitmap
- https://openseadragon.github.io/

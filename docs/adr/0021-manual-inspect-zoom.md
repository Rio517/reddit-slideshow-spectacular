# ADR 0021: Manual inspect-zoom on a paused slide

Date: 2026-08-20
Status: Accepted

## Context

A paused slide is where viewers stop to look closely, but the only zoom was
the automatic Ken Burns motion (ADR 0010). Users want to zoom into a detail
themselves - with the mouse wheel or keys, anchored at the pointer so the spot
under the cursor stays put.

## Decision

While the show is **paused**, the current slide can be zoomed manually:

- **Mouse wheel** (and trackpad pinch, which arrives as a wheel event) zooms
  about the pointer; **`+` / `-`** (and their unshifted `=` / `_`) step the
  zoom about the last pointer position; **dragging** pans the zoomed slide
  (clamped so no gap opens on an axis the content overfills, and the content
  stays on screen on an axis it doesn't). **Escape** peels the zoom off first
  and only closes the show when nothing is zoomed or open on top (the zoom is
  the bottom-most layer in `dismissTopLayer`'s order - dismissed only when no
  panel is open above it). Modified keys (Ctrl/Cmd/Alt combos) are left to
  the browser everywhere in the key handler, so page zoom and bookmarks keep
  working.
- The math lives in `lib/manual-zoom.js` as pure functions: state
  `{ scale, tx, ty }` applied as `translate() scale()` with origin `0 0`, the
  anchor-invariance solved in closed form, the scale capped per media (below),
  and a snap to identity at scale 1 so zooming out at an off-center anchor
  cannot leave the image displaced. Wheel deltas are normalized across delta
  modes (Firefox mouse wheels report lines) and bounded per event.
- The scale cap is **per media**, not a constant: the browser rasterizes the
  zoomed frame at its effective scale - the whole scaled element, not just
  the visible part - so an unbounded zoom on a large source allocates
  gigabytes of texture tiles and stalls the GPU machine-wide. `manualZoomMax`
  takes the tighter of two bounds, under a hard ceiling of 8: twice the
  source's native 1:1 detail (pixel-peeping headroom; floored at 2x) and a
  rasterized-surface budget of sixteen viewport areas, all in device pixels.
  The first zoom of a very large source still pays a one-time rasterization;
  the budget keeps that a brief hitch rather than a stall.
- Very large images (>= 24 MP) zoom through a **viewport-sized canvas**
  instead of transform-scaling the media: Gecko re-rasterizes a
  transform-scaled element by re-reading the whole decoded bitmap, janking in
  proportion to source size (docs/research/firefox-zoom-raster-jank.md).
  Pausing pre-builds a halved mip chain (`createImageBitmap`); once ready,
  the canvas paints the visible window from the smallest sufficient level
  (deep zoom reads a window of the original) while the frame transform keeps
  driving geometry, clamps, and anchors unchanged. Below the threshold - and
  while levels are still building - the plain transform path carries the
  zoom. Canvas-backed zoom is bounded by construction, so the surface budget
  does not apply and such images reach the full detail cap.
- Engaging the zoom on a slide with a paused pan & zoom hold first **rewinds
  the hold** to its whole-image frame (`currentTime = 0`; the animation
  object survives, so advance-on-finish still works after resume, replaying
  the motion from the top). Without the rewind the two scales compound - the
  browser rasterizes at the product - and a hold near native 1:1 would leave
  the manual zoom no headroom under the surface budget. Starting from the
  whole image gives it the full range; the cap stays as the backstop for any
  oversized media box that slips through.
- The transform goes on the **slide frame** (`.rs-slide`), not the media, so
  it composes with (and never fights) the media's own pan & zoom animation -
  a paused Ken Burns frame zooms like anything else. The frame's finished
  entrance animation (`fill: both`) would override an inline transform, so its
  transition classes are shed on first zoom. A small transform transition
  (`.rs-slide--zoomed`) makes wheel steps glide.
- The zoom is a paused-only mode: resuming play, changing slides, closing, or
  a viewport change (fullscreen toggle, window resize - the translation would
  be anchored against a stale frame position) resets it. The controller's
  paused state gates both input paths - the keys directly in the session, the
  wheel through a read-through `isPaused` handler (never a cached copy).
  Iframe embeds are excluded: wheel/pointer events over a cross-origin iframe
  go to the embed, never to the overlay, so the zoom could not anchor there.
  On videos, the native controls stay hidden while zoomed so a drag-to-pan
  never fights the scrub bar.
- A drag's release also fires a `click`; press and release land on different
  elements, so the browser targets that click at their common ancestor -
  which the backdrop-close handler reads as a backdrop click. The drag
  suppresses that one click. Below a small movement threshold a press stays
  an ordinary click, and only the dragging pointer's own events move or end
  its drag (a second touch mid-drag is ignored). Native image drag is
  prevented while zoomed (Firefox would otherwise start one mid-pan), and the
  drag transition is disabled so the frame tracks the pointer.

## Consequences

- Paused inspection of any image or video frame, symmetric across Firefox and
  Chrome, verified in both real browsers (wheel anchor, key steps, drag-pan,
  Escape).
- Open panels keep native wheel scrolling: the handler yields to them.

## Alternatives Considered

- **Zoom the media element:** fights the Ken Burns WAAPI animation for the
  `transform` property (animations beat inline styles). The frame-level
  transform sidesteps the conflict entirely. Rejected.
- **Always-on wheel zoom (not just paused):** scroll would then hijack a
  playing show and fight the automatic motion. Paused-only matches the
  "stopped to look closer" intent. Rejected.

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
  zoom about the last pointer position. **Escape** peels the zoom off first
  and only closes the show when nothing is zoomed or open on top (it joins
  `dismissTopLayer` as the bottom layer).
- The math lives in `lib/manual-zoom.js` as pure functions: state
  `{ scale, tx, ty }` applied as `translate() scale()` with origin `0 0`, the
  anchor-invariance solved in closed form, scale clamped to 1-8, and a snap to
  identity at scale 1 so zooming out at an off-center anchor cannot leave the
  image displaced. Wheel deltas are normalized across delta modes (Firefox
  mouse wheels report lines) and bounded per event.
- The transform goes on the **slide frame** (`.rs-slide`), not the media, so
  it composes with (and never fights) the media's own pan & zoom animation -
  a paused Ken Burns frame zooms like anything else. The frame's finished
  entrance animation (`fill: both`) would override an inline transform, so its
  transition classes are shed on first zoom. A small transform transition
  (`.rs-slide--zoomed`) makes wheel steps glide.
- The zoom is a paused-only mode: resuming play, changing slides, or closing
  resets it. Playing state gates both the wheel (overlay) and the keys
  (session), and iframe embeds are excluded.

## Consequences

- Paused inspection of any image or video frame, symmetric across Firefox and
  Chrome, verified in both real browsers (wheel anchor, key steps, Escape).
- Open panels keep native wheel scrolling: the handler yields to them.
- Panning while zoomed means zooming out and back in at a new anchor; a
  drag-to-pan could be added later if inspection turns out to need it.

## Alternatives Considered

- **Zoom the media element:** fights the Ken Burns WAAPI animation for the
  `transform` property (animations beat inline styles). The frame-level
  transform sidesteps the conflict entirely. Rejected.
- **Always-on wheel zoom (not just paused):** scroll would then hijack a
  playing show and fight the automatic motion. Paused-only matches the
  "stopped to look closer" intent. Rejected.

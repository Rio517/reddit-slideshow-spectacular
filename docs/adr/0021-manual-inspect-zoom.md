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

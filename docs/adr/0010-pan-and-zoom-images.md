# ADR 0010: Ken Burns pan & zoom for image slides

Date: 2026-05-31
Status: Accepted

## Context

Static images dwell for a fixed number of seconds and then cut to the next.
High-resolution images (the motivating case) have detail a full-frame static
view never reveals. A "Ken Burns" motion - show the whole image, zoom in, pan
top → bottom, zoom out, show the whole image again - surfaces that detail and
makes a lean-back slideshow feel less static. It must be opt-in (a checkbox) and
fully configurable (per-phase durations), and it must not desync from the
auto-advance.

Two implementation questions drove the decision:

1. **How to render the motion.** A pixel-accurate pan needs the image's rendered
   fit size and the container size to compute translate offsets per image and
   per viewport - measurement that varies with aspect ratio and resize.
2. **How to keep the advance in sync** with a multi-phase animation, given image
   slides have no `ended` event.

## Decision

Animate the image with `transform: scale()` plus `transform-origin` moving from
top (`50% 0%`) to bottom (`50% 100%`), and let the slide frame (`.rs-slide`,
`overflow: hidden`) clip the overflow. The pan needs **no DOM measurement**: the
origin shift pans the visible window from top to bottom at any aspect ratio. The
keyframes are built in `lib/pan-zoom.js` and run via the **Web Animations API**
(`element.animate`), which takes fractional `offset`s computed from the phase
durations.

The five phases and their durations are settings (`panZoomShowSeconds`,
`panZoomZoomInSeconds`, `panZoomPanSeconds`, `panZoomZoomOutSeconds`,
`panZoomShowEndSeconds`). The zoom magnitude is **resolution-aware**
(`resolutionAwareScale`): each image pushes in toward its own native 1:1 pixel
density, computed from the slide's source dimensions and the device-pixel
viewport size, so a high-res image zooms much harder than a barely-oversized
one, capped at `panZoomScale` (the configurable maximum, default 6) and never
past 1:1. The source dimensions are already known from the oversize gate, so
this adds no measurement. The whole feature is gated by `panZoom` (off by
default).

**Only "UHD" images move.** It runs only on images whose longest side is at
least `panZoomMinOversize` × the display window's longest side (in device
pixels; default 1.5×, range 1.25-3 - configurable). An image that already fits
the screen has no extra detail to reveal, so it shows for the normal image timer
instead. The gate uses the slide's source dimensions, so it's known before the
image loads.

**Advance:** a pan-zoomed image advances on the animation's `finish` event. The
session simply does not start the controller's per-image dwell timer for that
slide (it skips `onMediaReady`), so there is no second timer and no
double-advance race - the animation is the single source of truth. The visual
countdown bar uses the same total (sum of the phase durations). Non-oversized
images keep the ordinary dwell timer. Videos and embeds are unaffected.

## Consequences

- No pixel math, no `ResizeObserver`; the effect is correct at any aspect ratio
  and survives viewport resize.
- The animation and the auto-advance share one source of truth (the phase
  durations), so they cannot drift apart.
- Requires the Web Animations API. It is universally available in current
  Firefox/Chrome (the only targets); the call is feature-guarded so a missing
  implementation degrades to a normal static image, and unit tests (happy-dom,
  no WAAPI) exercise the pure keyframe/timing logic rather than the animation.
- Pausing the slideshow pauses the animation; changing the toggle or durations
  mid-session applies to subsequently rendered images.
- The pan direction is fixed (top → bottom) and the zoom anchors to the top;
  these are deliberately not configurable yet to keep the settings surface small.

## Alternatives Considered

- **Pixel-measured translate (`scale` + `translateY(px)`):** the most precise
  framing, but needs the rendered fit size and container size per image and on
  resize. More code and failure modes for no visible benefit over the
  origin-shift approach. Rejected.
- **CSS `@keyframes` classes:** keyframe percentages depend on the per-render
  phase durations, so the rules would have to be generated dynamically into a
  `<style>` tag. WAAPI takes computed offsets directly and is cleaner. Rejected.
- **Global dwell = animation total (advance on the controller timer):** simpler,
  but it forces every image to the same long dwell, so non-oversized images would
  sit static for the whole sequence. Replaced by per-image gating + advancing on
  the animation `finish` (and not starting a dwell timer for pan-zoomed images,
  which avoids the double-advance the global-dwell approach was meant to dodge).
- **Configurable pan direction / random Ken Burns paths:** deferred to keep the
  settings surface small; the path is fixed (top → bottom, zoom anchored top).

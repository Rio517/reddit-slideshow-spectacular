/**
 * Ken Burns pan & zoom for image slides.
 *
 * The sequence, per the configurable phase durations:
 *   1. show the whole image
 *   2. zoom in (anchored to the top)
 *   3. pan top → bottom (while zoomed)
 *   4. zoom out
 *   5. show the whole image again, then advance
 *
 * The motion needs no per-image DOM measurement: we animate `transform` only
 * (scale plus a percentage translateY, origin fixed) so the whole sequence can
 * run on the compositor, and let the stage clip the overflow at the viewport,
 * so the zoomed image spreads into any letterbox space instead of staying
 * cropped to its own fit box. The zoom magnitude is resolution-aware
 * (`resolutionAwareScale`),
 * derived from the slide's known source dimensions rather than from layout. The
 * total duration equals the sum of the phases, which is also the image's dwell,
 * so the visual and the auto-advance stay in lock-step.
 */

/**
 * @typedef {object} PanZoomConfig
 * @property {number} scale Zoom factor (> 1).
 * @property {number} showSeconds
 * @property {number} zoomInSeconds
 * @property {number} panSeconds
 * @property {number} zoomOutSeconds
 * @property {number} showEndSeconds
 */

/**
 * @param {PanZoomConfig} c
 * @returns {number} Total sequence length in seconds.
 */
export function panZoomTotalSeconds(c) {
  return (
    c.showSeconds +
    c.zoomInSeconds +
    c.panSeconds +
    c.zoomOutSeconds +
    c.showEndSeconds
  );
}

/**
 * Build Web Animations API keyframes + options for the sequence.
 *
 * @param {PanZoomConfig} c
 * @returns {{ keyframes: Keyframe[], options: KeyframeAnimationOptions }}
 */
export function panZoomAnimation(c) {
  const total = panZoomTotalSeconds(c);
  const at = (/** @type {number} */ seconds) =>
    total > 0 ? seconds / total : 0;
  const z = c.scale;

  // Everything is expressed in `transform` with a CONSTANT origin (top
  // center), because `transform-origin` is not a compositable property:
  // animating it drags every frame through the main thread, which shows up as
  // jitter. With the origin fixed, scale(z) pins the top edge; translating by
  // (1 - z) x 100% of the element's own height pins the bottom edge instead
  // (translate applies after scale, and percentages resolve against the
  // unscaled box). Scale and translate interpolate with the same easing per
  // segment, so the pinned edge holds exactly throughout each phase.
  const origin = "50% 0%";
  const round = (/** @type {number} */ v) => Number(v.toFixed(3));
  const whole = "translateY(0%) scale(1)";
  const zoomedTop = `translateY(0%) scale(${z})`;
  const zoomedBottom = `translateY(${round((1 - z) * 100)}%) scale(${z})`;
  const t1 = c.showSeconds;
  const t2 = t1 + c.zoomInSeconds;
  const t3 = t2 + c.panSeconds;
  const t4 = t3 + c.zoomOutSeconds;

  const keyframes = [
    { offset: 0, transform: whole, transformOrigin: origin },
    { offset: at(t1), transform: whole, transformOrigin: origin },
    { offset: at(t2), transform: zoomedTop, transformOrigin: origin },
    { offset: at(t3), transform: zoomedBottom, transformOrigin: origin },
    { offset: at(t4), transform: whole, transformOrigin: origin },
    { offset: 1, transform: whole, transformOrigin: origin },
  ];

  return {
    keyframes,
    options: {
      duration: total * 1000,
      easing: "ease-in-out",
      fill: "both",
    },
  };
}

// Zoom for an image whose source dimensions are unknown: a gentle push-in,
// since we can't tell how much detail it holds beyond the display.
const UNKNOWN_SIZE_FALLBACK_SCALE = 2;

/**
 * Zoom factor for one image, scaled to how much detail it carries beyond the
 * display. The peak maps one source pixel onto one device pixel (native 1:1),
 * so a barely-oversized image zooms a little while a high-res one zooms much
 * harder - never past 1:1, and never above `maxScale`. Honors device pixel
 * ratio, so a HiDPI screen reaches 1:1 sooner.
 *
 * @param {{
 *   sourceWidth?: number,
 *   sourceHeight?: number,
 *   viewportWidth: number,
 *   viewportHeight: number,
 *   dpr: number,
 *   maxScale: number,
 * }} a
 * @returns {number}
 */
export function resolutionAwareScale({
  sourceWidth,
  sourceHeight,
  viewportWidth,
  viewportHeight,
  dpr,
  maxScale,
}) {
  const viewW = viewportWidth * (dpr || 1);
  const viewH = viewportHeight * (dpr || 1);
  if (!sourceWidth || !sourceHeight || viewW <= 0 || viewH <= 0) {
    return Math.min(maxScale, UNKNOWN_SIZE_FALLBACK_SCALE);
  }
  // The image fits the frame on its tighter axis (object-fit: contain); zoom
  // until that axis hits native density.
  const native = Math.max(sourceWidth / viewW, sourceHeight / viewH);
  return Math.min(Math.max(native, 1), maxScale);
}

/**
 * Extract the pan-zoom config from settings.
 * @param {import("./settings.js").Settings} s
 * @returns {PanZoomConfig}
 */
export function panZoomConfig(s) {
  return {
    scale: s.panZoomScale,
    showSeconds: s.panZoomShowSeconds,
    zoomInSeconds: s.panZoomZoomInSeconds,
    panSeconds: s.panZoomPanSeconds,
    zoomOutSeconds: s.panZoomZoomOutSeconds,
    showEndSeconds: s.panZoomShowEndSeconds,
  };
}

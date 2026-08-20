/**
 * Manual inspect-zoom for a paused slide: `+`/`-` keys or the mouse wheel
 * scale the current frame about the pointer, so the spot under the cursor
 * stays put while everything grows around it.
 *
 * Pure math only - the overlay owns the DOM. The state is applied as
 * `translate(tx, ty) scale(s)` with `transform-origin: 0 0`, so the frame's
 * layout top-left is recoverable from its on-screen rect: base = rect - t.
 */

export const MANUAL_ZOOM_MAX = 8;
// Per key press; wheel events derive their factor from the scroll delta.
export const MANUAL_ZOOM_KEY_STEP = 1.3;

// Safety valve: the zoomed frame is rasterized WHOLE at its effective scale,
// so unbounded zoom on a large source allocates GPU memory in the gigabytes
// and stalls the machine.
const SURFACE_BUDGET_VIEWPORTS = 16;
// Zoom range past native 1:1, for pixel-peeping.
const DETAIL_HEADROOM = 2;
const MIN_INSPECT_RANGE = 2;

/**
 * Largest safe manual scale for the media: twice its native 1:1 detail
 * (floored at 2x), within the rasterized-surface budget, under the hard max.
 * Sizes are device pixels; `media*` is the on-screen box at manual scale 1.
 * Degenerate geometry falls back to the hard max.
 *
 * @param {{
 *   sourceWidth: number,
 *   sourceHeight: number,
 *   mediaWidth: number,
 *   mediaHeight: number,
 *   viewWidth: number,
 *   viewHeight: number,
 * }} a
 * @returns {number}
 */
export function manualZoomMax({
  sourceWidth,
  sourceHeight,
  mediaWidth,
  mediaHeight,
  viewWidth,
  viewHeight,
}) {
  if (!(mediaWidth > 0 && mediaHeight > 0 && viewWidth > 0 && viewHeight > 0)) {
    return MANUAL_ZOOM_MAX;
  }
  const surfaceCap = Math.sqrt(
    (viewWidth * viewHeight * SURFACE_BUDGET_VIEWPORTS) /
      (mediaWidth * mediaHeight),
  );
  const detailCap =
    sourceWidth > 0 && sourceHeight > 0
      ? Math.max(
          MIN_INSPECT_RANGE,
          DETAIL_HEADROOM *
            Math.max(sourceWidth / mediaWidth, sourceHeight / mediaHeight),
        )
      : Infinity;
  return Math.min(
    MANUAL_ZOOM_MAX,
    Math.max(1, Math.min(surfaceCap, detailCap)),
  );
}

/**
 * @typedef {object} ManualZoom
 * @property {number} scale
 * @property {number} tx Translation in px, applied before the scale.
 * @property {number} ty
 */

/** @returns {ManualZoom} */
export function identityZoom() {
  return { scale: 1, tx: 0, ty: 0 };
}

/** @param {ManualZoom} state */
export function isZoomed(state) {
  return state.scale > 1;
}

/**
 * Zoom by `factor` keeping the content under the anchor point stationary.
 * `rectLeft`/`rectTop` are the frame's CURRENT on-screen position (its
 * bounding rect, which already includes the state's translation).
 * Returning to scale 1 snaps to identity so zoom-out at an off-center anchor
 * can't leave the image displaced.
 *
 * @param {ManualZoom} state
 * @param {number} factor
 * @param {number} anchorX
 * @param {number} anchorY
 * @param {number} rectLeft
 * @param {number} rectTop
 * @param {number} [maxScale] Per-media cap (see manualZoomMax).
 * @returns {ManualZoom}
 */
export function zoomAtPoint(
  state,
  factor,
  anchorX,
  anchorY,
  rectLeft,
  rectTop,
  maxScale = MANUAL_ZOOM_MAX,
) {
  const scale = Math.min(maxScale, Math.max(1, state.scale * factor));
  if (scale <= 1.0001) return identityZoom();
  // The content point under the anchor, in the frame's unscaled coordinates.
  const localX = (anchorX - rectLeft) / state.scale;
  const localY = (anchorY - rectTop) / state.scale;
  // Keep it there: world = base + t' + s'·local, with base = rect - t.
  const baseLeft = rectLeft - state.tx;
  const baseTop = rectTop - state.ty;
  return {
    scale,
    tx: anchorX - baseLeft - scale * localX,
    ty: anchorY - baseTop - scale * localY,
  };
}

/**
 * Zoom factor for one wheel event. Delta-proportional (a fast flick zooms
 * more) but bounded, so one jumpy event can't teleport the zoom. Line/page
 * delta modes (Firefox mouse wheels report lines) are normalized to pixels.
 *
 * @param {number} deltaY
 * @param {number} deltaMode 0 = pixels, 1 = lines, 2 = pages.
 * @returns {number}
 */
export function wheelZoomFactor(deltaY, deltaMode) {
  // px per delta unit, indexed by deltaMode: pixels, lines, pages.
  const PX_PER_UNIT = [1, 16, 360];
  const px = deltaY * (PX_PER_UNIT[deltaMode] ?? 1);
  // 0.0022 tunes feel: a normal ~100px mouse tick ≈ 1.25x. The per-event cap
  // is symmetric so zooming out is never slower than zooming in.
  const MAX_STEP = 1.7;
  return Math.min(MAX_STEP, Math.max(1 / MAX_STEP, Math.exp(-px * 0.0022)));
}

/**
 * Drag-pan a zoomed state by (dx, dy), clamped per axis: where the scaled
 * content exceeds the viewport its edges can't be dragged past the viewport
 * edges (no gap opens); where it's smaller it stays fully on screen. `rect*`
 * describe the frame's CURRENT on-screen box (before this step). Identity
 * (not zoomed) never pans.
 *
 * @param {ManualZoom} state
 * @param {number} dx
 * @param {number} dy
 * @param {{
 *   rectLeft: number,
 *   rectTop: number,
 *   rectWidth: number,
 *   rectHeight: number,
 *   viewWidth: number,
 *   viewHeight: number,
 * }} bounds
 * @returns {ManualZoom}
 */
export function panBy(state, dx, dy, bounds) {
  if (!isZoomed(state)) return identityZoom();
  return {
    scale: state.scale,
    tx:
      state.tx +
      clampAxisDelta(dx, bounds.rectLeft, bounds.rectWidth, bounds.viewWidth),
    ty:
      state.ty +
      clampAxisDelta(dy, bounds.rectTop, bounds.rectHeight, bounds.viewHeight),
  };
}

/**
 * One axis of the pan clamp: bound the NEW leading edge (left/top), then
 * convert back to a delta. `slack` is the viewport room left over - negative
 * when the content overfills it, so the edge ranges over [slack, 0] (edges
 * can't leave a gap); positive when it fits, so [0, slack] (stays on screen).
 *
 * @param {number} delta
 * @param {number} edge
 * @param {number} size
 * @param {number} view
 * @returns {number}
 */
function clampAxisDelta(delta, edge, size, view) {
  const slack = view - size;
  const minEdge = Math.min(0, slack);
  const maxEdge = Math.max(0, slack);
  return Math.min(maxEdge, Math.max(minEdge, edge + delta)) - edge;
}

/**
 * CSS transform for the state; empty at identity so the style attribute can
 * be cleared rather than pinned to a no-op transform.
 * @param {ManualZoom} state
 * @returns {string}
 */
export function zoomTransform(state) {
  if (!isZoomed(state)) return "";
  return `translate(${state.tx}px, ${state.ty}px) scale(${state.scale})`;
}

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
 * @returns {ManualZoom}
 */
export function zoomAtPoint(
  state,
  factor,
  anchorX,
  anchorY,
  rectLeft,
  rectTop,
) {
  const scale = Math.min(MANUAL_ZOOM_MAX, Math.max(1, state.scale * factor));
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
  const px = deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? 360 : 1);
  return Math.min(1.7, Math.max(0.55, Math.exp(-px * 0.0022)));
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
  const axis = (
    /** @type {number} */ delta,
    /** @type {number} */ edge,
    /** @type {number} */ size,
    /** @type {number} */ view,
  ) => {
    const lo = size >= view ? view - size : 0;
    const hi = size >= view ? 0 : view - size;
    return Math.min(hi, Math.max(lo, edge + delta)) - edge;
  };
  return {
    scale: state.scale,
    tx:
      state.tx + axis(dx, bounds.rectLeft, bounds.rectWidth, bounds.viewWidth),
    ty:
      state.ty + axis(dy, bounds.rectTop, bounds.rectHeight, bounds.viewHeight),
  };
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

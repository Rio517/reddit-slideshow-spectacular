/**
 * Level-of-detail math for manually zooming very large images. Gecko
 * re-rasterizes a transform-scaled element by re-reading the whole decoded
 * bitmap (docs/research/firefox-zoom-raster-jank.md), so above the threshold
 * the overlay draws the visible window into a viewport-sized canvas from a
 * pre-built mip chain instead. Pure math only - the overlay owns the DOM.
 */

// Below this source area the plain transform zoom is measured smooth in both
// engines; above it the canvas path takes over.
export const LOD_MIN_SOURCE_PIXELS = 24e6;
// Mip levels halve until they drop under this area.
const MIP_FLOOR_PIXELS = 1e6;

/**
 * @param {number} sourceWidth
 * @param {number} sourceHeight
 */
export function needsLod(sourceWidth, sourceHeight) {
  return (
    sourceWidth > 0 &&
    sourceHeight > 0 &&
    sourceWidth * sourceHeight >= LOD_MIN_SOURCE_PIXELS
  );
}

/**
 * Halving chain of level sizes (largest first, original excluded).
 * @param {number} sourceWidth
 * @param {number} sourceHeight
 * @returns {Array<{ width: number, height: number }>}
 */
export function mipPlan(sourceWidth, sourceHeight) {
  const levels = [];
  let w = sourceWidth;
  let h = sourceHeight;
  for (;;) {
    w = Math.max(1, Math.round(w / 2));
    h = Math.max(1, Math.round(h / 2));
    if (w * h < MIP_FLOOR_PIXELS) return levels;
    levels.push({ width: w, height: h });
  }
}

/**
 * Index of the smallest level that still covers `targetWidth` source-detail
 * pixels; -1 when only the original is sharp enough.
 * @param {Array<{ width: number }>} levels Largest first.
 * @param {number} targetWidth
 */
export function pickLevel(levels, targetWidth) {
  for (let i = levels.length - 1; i >= 0; i -= 1) {
    if (levels[i].width >= targetWidth) return i;
  }
  return -1;
}

/**
 * The drawImage window for one frame: the on-screen media rect intersected
 * with the viewport, mapped back to source coordinates. All values CSS px;
 * source coordinates are in ORIGINAL image pixels (scale them by the chosen
 * level's ratio). Null when nothing is visible.
 *
 * @param {{
 *   rectLeft: number,
 *   rectTop: number,
 *   rectWidth: number,
 *   rectHeight: number,
 *   viewWidth: number,
 *   viewHeight: number,
 *   sourceWidth: number,
 *   sourceHeight: number,
 * }} a
 * @returns {{ sx: number, sy: number, sw: number, sh: number,
 *             dx: number, dy: number, dw: number, dh: number } | null}
 */
export function drawWindow({
  rectLeft,
  rectTop,
  rectWidth,
  rectHeight,
  viewWidth,
  viewHeight,
  sourceWidth,
  sourceHeight,
}) {
  const left = Math.max(rectLeft, 0);
  const top = Math.max(rectTop, 0);
  const right = Math.min(rectLeft + rectWidth, viewWidth);
  const bottom = Math.min(rectTop + rectHeight, viewHeight);
  if (right <= left || bottom <= top || !(rectWidth > 0) || !(rectHeight > 0)) {
    return null;
  }
  return {
    sx: ((left - rectLeft) / rectWidth) * sourceWidth,
    sy: ((top - rectTop) / rectHeight) * sourceHeight,
    sw: ((right - left) / rectWidth) * sourceWidth,
    sh: ((bottom - top) / rectHeight) * sourceHeight,
    dx: left,
    dy: top,
    dw: right - left,
    dh: bottom - top,
  };
}

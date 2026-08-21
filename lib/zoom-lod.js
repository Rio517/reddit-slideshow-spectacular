/**
 * Level-of-detail math for manually zooming very large images. Gecko
 * re-rasterizes a transform-scaled element by re-reading the whole decoded
 * bitmap (docs/research/firefox-zoom-raster-jank.md), so above the threshold
 * the overlay draws the visible window into a viewport-sized canvas from a
 * pre-built mip chain instead. Pure math only - the overlay owns the DOM.
 */

// Below this source area the plain transform zoom is cheap; above it the
// detail cap already allows rasterized GPU surfaces in the hundreds of MB
// (profiled as GPU-driver stalls), so the canvas path takes over.
export const LOD_MIN_SOURCE_PIXELS = 8e6;
// Above this source area the original is never fully decoded anywhere: the
// preview stays on display and deep zoom reads cropped windows. Decoded
// monsters stack up (display + levels + preloads) into gigabytes of pixel
// buffers and freeze the machine via memory pressure.
export const FULL_DECODE_MAX_PIXELS = 40e6;
// Mip levels halve until they drop under this area.
const MIP_FLOOR_PIXELS = 1e6;
// No level ever exceeds this area: a 200 MP source must not spawn a 50 MP
// bitmap (the level memory stays bounded regardless of the source).
const MIP_CAP_PIXELS = 24e6;

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
 * Halving chain of level sizes (largest first, original excluded). The top
 * level is additionally clamped to MIP_CAP_PIXELS so a giant source cannot
 * spawn giant levels.
 * @param {number} sourceWidth
 * @param {number} sourceHeight
 * @returns {Array<{ width: number, height: number }>}
 */
export function mipPlan(sourceWidth, sourceHeight) {
  const levels = [];
  let w = Math.max(1, Math.round(sourceWidth / 2));
  let h = Math.max(1, Math.round(sourceHeight / 2));
  if (w * h > MIP_CAP_PIXELS) {
    const shrink = Math.sqrt(MIP_CAP_PIXELS / (w * h));
    w = Math.max(1, Math.floor(w * shrink));
    h = Math.max(1, Math.floor(h * shrink));
  }
  for (;;) {
    if (w * h < MIP_FLOOR_PIXELS) return levels;
    levels.push({ width: w, height: h });
    w = Math.max(1, Math.round(w / 2));
    h = Math.max(1, Math.round(h / 2));
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

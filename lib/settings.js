import { browser } from "wxt/browser";

/**
 * @typedef {object} Settings
 * @property {number} imageTimerSeconds
 * @property {boolean} startMuted
 * @property {boolean} autoplay
 * @property {boolean} includeNsfw
 * @property {boolean} dedupe
 * @property {boolean} contentDedup
 * @property {boolean} alwaysShowCount Keep the position counter and the
 *   skipped-count badge visible even when the controls auto-hide on idle, so a
 *   gap in the count from a skipped item stays explained.
 * @property {boolean} alwaysShowMeta Keep the post's title and byline visible
 *   even when the controls auto-hide on idle.
 * @property {number} maxLoadWaitSeconds
 * @property {string} transition Slide-change animation: one of TRANSITIONS.
 * @property {string} timerBar Top timer-bar visibility: one of TIMER_BAR_MODES.
 * @property {boolean} panZoom Ken Burns pan & zoom on image slides.
 * @property {number} panZoomScale Zoom factor (> 1).
 * @property {number} panZoomShowSeconds Show the whole image.
 * @property {number} panZoomZoomInSeconds Zoom-in transition.
 * @property {number} panZoomPanSeconds Pan top → bottom.
 * @property {number} panZoomZoomOutSeconds Zoom-out transition.
 * @property {number} panZoomShowEndSeconds Show the whole image again.
 * @property {number} panZoomMinOversize Only pan & zoom when the image's longest
 *   side exceeds the display window's by at least this factor.
 * @property {string} locale UI language: "auto" (follow the browser) or a
 *   supported locale code.
 */

export const TIMER_MIN_SECONDS = 1;
export const TIMER_MAX_SECONDS = 300;
// Non-linear stops for the per-image timer slider: 1s steps at the low end (so
// 1-2s are trivial to hit), coarsening toward the 5-minute max. The slider is an
// index into this list (equal travel per stop), so it snaps to these values.
export const IMAGE_TIMER_STOPS = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 30, 40, 50, 60, 90, 120, 150, 180,
  210, 240, 270, 300,
];
export const LOAD_WAIT_MIN_SECONDS = 1;
export const LOAD_WAIT_MAX_SECONDS = 30;
// Slide-change transitions, in the order shown in the options page.
export const TRANSITIONS = ["none", "fade", "slide", "push", "zoom", "flip"];
// Top timer-bar visibility: never, video slides only, or every slide.
export const TIMER_BAR_MODES = ["none", "video", "all"];
// UI language options: "auto" follows the browser; the rest are the shipped
// locales. Mirrors the catalogs in locales/.
export const UI_LOCALES = ["auto", "en", "es", "fr", "de", "it", "ar"];
export const PAN_ZOOM_PHASE_MAX_SECONDS = 30;
export const PAN_ZOOM_SCALE_MIN = 1.1;
export const PAN_ZOOM_SCALE_MAX = 5;
// 1 = apply pan & zoom to every image ("All images"); above 1 = only images
// that many times larger than the window.
export const PAN_ZOOM_OVERSIZE_MIN = 1;
export const PAN_ZOOM_OVERSIZE_MAX = 3;

/** @type {Settings} */
export const DEFAULT_SETTINGS = Object.freeze({
  imageTimerSeconds: 5,
  startMuted: true,
  autoplay: true,
  // Follow Reddit: show over-18 content only insofar as the session exposes it.
  includeNsfw: true,
  // Skip media already shown this session (ADR 0006, identity-key layer).
  dedupe: true,
  // Perceptual-hash dedup of re-uploads (ADR 0006 Layer 2). On by default - it's
  // what catches the same image re-posted under a new id (solo vs in a gallery),
  // which the identity layer can't. Left as a toggle so a rare false match can
  // be turned off. Its reddit image-host access is an install-time permission.
  contentDedup: true,
  // Keep the position counter + skipped badge pinned past the idle fade.
  alwaysShowCount: true,
  // Keep the title + byline pinned past the idle fade.
  alwaysShowMeta: true,
  // How long to wait for slow media to load before moving on.
  maxLoadWaitSeconds: 5,
  // Animation when advancing between slides (the incoming frame is held until
  // its media decodes, so any choice is gap-free).
  transition: "fade",
  // Show the top countdown bar on video slides only by default.
  timerBar: "video",
  // Ken Burns pan & zoom on image slides (off by default). When on, the image
  // dwell becomes the sum of the phase durations below.
  panZoom: false,
  panZoomScale: 2,
  panZoomShowSeconds: 2,
  panZoomZoomInSeconds: 2,
  panZoomPanSeconds: 6,
  panZoomZoomOutSeconds: 2,
  panZoomShowEndSeconds: 2,
  // Only pan & zoom images whose longest side is at least this many times the
  // display window's longest side - i.e. genuinely too big for the view.
  panZoomMinOversize: 1.5,
  // UI language; "auto" follows the browser's language.
  locale: "auto",
});

/**
 * @param {unknown} value
 * @returns {number}
 */
function normalizeTimer(value) {
  const seconds = Math.round(Number(value));
  if (!Number.isFinite(seconds)) return DEFAULT_SETTINGS.imageTimerSeconds;
  return Math.min(TIMER_MAX_SECONDS, Math.max(TIMER_MIN_SECONDS, seconds));
}

/**
 * Nearest stop index for a seconds value (positions the non-linear timer slider).
 * @param {number} seconds
 * @returns {number}
 */
export function imageTimerStopIndex(seconds) {
  const s = normalizeTimer(seconds);
  let best = 0;
  for (let i = 1; i < IMAGE_TIMER_STOPS.length; i++) {
    const closer =
      Math.abs(IMAGE_TIMER_STOPS[i] - s) <
      Math.abs(IMAGE_TIMER_STOPS[best] - s);
    if (closer) best = i;
  }
  return best;
}

/**
 * Seconds for a slider index (clamped into range).
 * @param {number | string} index
 * @returns {number}
 */
export function imageTimerStopSeconds(index) {
  const n = Math.round(Number(index));
  // Bad input falls back to the default dwell, not the 1s minimum (index 0).
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.imageTimerSeconds;
  const i = Math.min(IMAGE_TIMER_STOPS.length - 1, Math.max(0, n));
  return IMAGE_TIMER_STOPS[i];
}

/**
 * Compact duration label for the timer value: "5s", "1m 30s", "5m".
 * @param {number} seconds
 * @returns {string}
 */
export function formatImageTimer(seconds) {
  const s = Math.round(Number(seconds) || 0);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem ? `${m}m ${rem}s` : `${m}m`;
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function normalizeLoadWait(value) {
  const seconds = Math.round(Number(value));
  if (!Number.isFinite(seconds)) return DEFAULT_SETTINGS.maxLoadWaitSeconds;
  return Math.min(
    LOAD_WAIT_MAX_SECONDS,
    Math.max(LOAD_WAIT_MIN_SECONDS, seconds),
  );
}

/**
 * @param {unknown} value
 * @param {number} fallback
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clampNumber(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * @param {unknown} value
 * @param {boolean} fallback
 * @returns {boolean}
 */
function boolOr(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

/**
 * @param {Partial<Settings> | Record<string, unknown>} [input]
 * @returns {Settings}
 */
export function normalizeSettings(input = {}) {
  return {
    imageTimerSeconds: normalizeTimer(input.imageTimerSeconds),
    startMuted: boolOr(input.startMuted, DEFAULT_SETTINGS.startMuted),
    autoplay: boolOr(input.autoplay, DEFAULT_SETTINGS.autoplay),
    includeNsfw: boolOr(input.includeNsfw, DEFAULT_SETTINGS.includeNsfw),
    dedupe: boolOr(input.dedupe, DEFAULT_SETTINGS.dedupe),
    contentDedup: boolOr(input.contentDedup, DEFAULT_SETTINGS.contentDedup),
    // Migration: an explicit alwaysShowCount wins; otherwise carry the pre-split
    // alwaysShowMeta value (so a user who turned the single toggle off keeps both
    // off); otherwise the default.
    alwaysShowCount: boolOr(
      input.alwaysShowCount,
      boolOr(input.alwaysShowMeta, DEFAULT_SETTINGS.alwaysShowCount),
    ),
    alwaysShowMeta: boolOr(
      input.alwaysShowMeta,
      DEFAULT_SETTINGS.alwaysShowMeta,
    ),
    maxLoadWaitSeconds: normalizeLoadWait(input.maxLoadWaitSeconds),
    transition:
      typeof input.transition === "string" &&
      TRANSITIONS.includes(input.transition)
        ? input.transition
        : DEFAULT_SETTINGS.transition,
    timerBar:
      typeof input.timerBar === "string" &&
      TIMER_BAR_MODES.includes(input.timerBar)
        ? input.timerBar
        : DEFAULT_SETTINGS.timerBar,
    panZoom: boolOr(input.panZoom, DEFAULT_SETTINGS.panZoom),
    panZoomScale: clampNumber(
      input.panZoomScale,
      DEFAULT_SETTINGS.panZoomScale,
      PAN_ZOOM_SCALE_MIN,
      PAN_ZOOM_SCALE_MAX,
    ),
    panZoomShowSeconds: clampNumber(
      input.panZoomShowSeconds,
      DEFAULT_SETTINGS.panZoomShowSeconds,
      0,
      PAN_ZOOM_PHASE_MAX_SECONDS,
    ),
    panZoomZoomInSeconds: clampNumber(
      input.panZoomZoomInSeconds,
      DEFAULT_SETTINGS.panZoomZoomInSeconds,
      0,
      PAN_ZOOM_PHASE_MAX_SECONDS,
    ),
    panZoomPanSeconds: clampNumber(
      input.panZoomPanSeconds,
      DEFAULT_SETTINGS.panZoomPanSeconds,
      0,
      PAN_ZOOM_PHASE_MAX_SECONDS,
    ),
    panZoomZoomOutSeconds: clampNumber(
      input.panZoomZoomOutSeconds,
      DEFAULT_SETTINGS.panZoomZoomOutSeconds,
      0,
      PAN_ZOOM_PHASE_MAX_SECONDS,
    ),
    panZoomShowEndSeconds: clampNumber(
      input.panZoomShowEndSeconds,
      DEFAULT_SETTINGS.panZoomShowEndSeconds,
      0,
      PAN_ZOOM_PHASE_MAX_SECONDS,
    ),
    panZoomMinOversize: clampNumber(
      input.panZoomMinOversize,
      DEFAULT_SETTINGS.panZoomMinOversize,
      PAN_ZOOM_OVERSIZE_MIN,
      PAN_ZOOM_OVERSIZE_MAX,
    ),
    locale:
      typeof input.locale === "string" && UI_LOCALES.includes(input.locale)
        ? input.locale
        : DEFAULT_SETTINGS.locale,
  };
}

export async function getSettings() {
  const stored = await browser.storage.local.get(DEFAULT_SETTINGS);
  return normalizeSettings(stored);
}

/**
 * @param {Partial<Settings>} patch
 * @returns {Promise<Settings>}
 */
export async function saveSettings(patch) {
  const current = await getSettings();
  const next = normalizeSettings({ ...current, ...patch });
  await browser.storage.local.set(next);
  return next;
}

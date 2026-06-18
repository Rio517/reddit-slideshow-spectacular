import { shouldFetchNextPage } from "./queue.js";

/**
 * @typedef {import("./slides.js").Slide} Slide
 */

const DEFAULT_DWELL_SECONDS = 5;
// Media slides advance on their own `ended` event, but a slightly longer timer
// guarantees forward progress if a video stalls, errors, or never fires `ended`.
const MEDIA_SAFETY_BUFFER_SECONDS = 2;
// Cap how many already-shown slides are retained for back-navigation, so a long
// session does not accumulate every slide object forever (see ADR 0007). Large
// enough to rewind deep into a marathon session; each retained slide is light
// metadata (~1-2 KB), so ~2000 stays a few MB.
const DEFAULT_MAX_BACK_HISTORY = 2000;

/**
 * @typedef {object} QueuePageInput
 * @property {Slide[]} slides
 * @property {string | null | undefined} [after]
 * @property {boolean} [exhausted]
 * @property {number} [postsScanned]
 */

/**
 * Headless slideshow state machine: queue position, pagination triggering, and
 * timer-based auto-advance. DOM-free so it can be unit-tested; the content
 * script supplies `onRender` (paint a slide) and `onRequestNextPage` (fetch).
 */
export class SlideshowController {
  /**
   * @param {{
   *   imageTimerSeconds?: number,
   *   maxBackHistory?: number,
   *   onRender: (slide: Slide, position: { index: number, total: number, exhausted: boolean }) => void,
   *   onRequestNextPage: (after: string) => void,
   *   onEnd?: () => void,
   * }} options
   */
  constructor(options) {
    this.options = options;
    this.maxBackHistory = options.maxBackHistory ?? DEFAULT_MAX_BACK_HISTORY;
    /** @type {Slide[]} */
    this.slides = [];
    this.index = -1;
    // Count of slides dropped from the front so absolute position survives
    // eviction.
    this.evicted = 0;
    /** @type {string | null} */
    this.after = null;
    this.exhausted = false;
    this.postsScannedSinceFetch = 0;
    this.paused = false;
    // True when advance hit the end of a loaded-but-not-exhausted queue and is
    // waiting for the next page so it can resume.
    this.waiting = false;
    /** @type {ReturnType<typeof setTimeout> | null} */
    this.timer = null;
  }

  get imageTimerSeconds() {
    return this.options.imageTimerSeconds ?? DEFAULT_DWELL_SECONDS;
  }

  /** @returns {Slide | null} */
  get current() {
    return this.index >= 0 ? (this.slides[this.index] ?? null) : null;
  }

  get position() {
    // Absolute (eviction-invariant): the retained window is a moving slice.
    return {
      index: this.evicted + this.index,
      total: this.evicted + this.slides.length,
      exhausted: this.exhausted,
    };
  }

  /**
   * Seed the first page and render the first slide.
   * @param {QueuePageInput} page
   */
  start(page) {
    this.append(page);
    return this.current;
  }

  /**
   * Append a fetched page; renders the first slide if nothing is shown yet.
   * @param {QueuePageInput} page
   */
  append(page) {
    this.slides.push(...(page.slides ?? []));
    this.after = page.after ?? null;
    this.exhausted = Boolean(page.exhausted) || !this.after;
    this.postsScannedSinceFetch = page.postsScanned ?? 0;

    const hasUnshown = this.index < this.slides.length - 1;
    if (this.index === -1 && this.slides.length > 0) {
      this.index = 0;
      this.renderCurrent();
      return;
    }
    if (this.waiting && hasUnshown) {
      this.next();
      return;
    }
    // No renderable slide became available (initial empty page, or an
    // all-filtered page arrived while waiting). Keep paging if more exist,
    // otherwise end gracefully instead of hanging.
    if (this.index === -1 || this.waiting) {
      if (!this.exhausted) {
        this.maybeFetchNext();
      } else {
        this.waiting = false;
        this.options.onEnd?.();
      }
    }
  }

  next() {
    // Step over slides already auto-skipped (broken media / duplicate) so
    // navigation never lands on one and re-processes it - a freshly-failed
    // slide is marked before this runs, so forward progress still works.
    for (let i = this.index + 1; i < this.slides.length; i += 1) {
      if (!this.slides[i]?.skipReason) {
        this.index = i;
        this.renderCurrent();
        return this.current;
      }
    }
    if (this.exhausted) {
      this.clearTimer();
      this.options.onEnd?.();
      return null;
    }
    // At the end of a loaded page but more exist: wait for the next page.
    this.waiting = true;
    this.clearTimer();
    this.maybeFetchNext();
    return this.current;
  }

  prev() {
    // Mirror next(): step back over skipped slides to the previous real one.
    for (let i = this.index - 1; i >= 0; i -= 1) {
      if (!this.slides[i]?.skipReason) {
        this.index = i;
        this.renderCurrent();
        return this.current;
      }
    }
    return this.current;
  }

  /**
   * Jump to a loaded slide by its position in the retained window (the jump
   * list). Out-of-range indices are ignored.
   * @param {number} i
   */
  goTo(i) {
    if (i < 0 || i >= this.slides.length || i === this.index)
      return this.current;
    this.index = i;
    this.renderCurrent();
    return this.current;
  }

  /**
   * Jump by n slides (negative = back), clamped to the loaded window. A coarse
   * positional seek (PageUp/PageDown): it lands on a raw index - which may be a
   * skipped slide - like the jump list, rather than counting shown slides.
   * `goTo` no-ops when the clamped target is already current.
   * @param {number} n
   */
  skip(n) {
    if (this.index < 0 || this.slides.length === 0) return this.current;
    const target = Math.min(
      Math.max(this.index + n, 0),
      this.slides.length - 1,
    );
    return this.goTo(target);
  }

  /**
   * Bail out of the current post (e.g. a gallery): jump to the next loaded slide
   * belonging to a different post, skipping any auto-skipped ones. If the rest
   * of the loaded window is the same post, fall through to next() from its last
   * slide so it ends or paginates rather than stepping the remaining items.
   */
  skipPostGroup() {
    if (this.index < 0) return this.current;
    const postId = this.current?.postId;
    for (let i = this.index + 1; i < this.slides.length; i += 1) {
      const slide = this.slides[i];
      if (slide && !slide.skipReason && slide.postId !== postId) {
        this.index = i;
        this.renderCurrent();
        return this.current;
      }
    }
    this.index = this.slides.length - 1;
    return this.next();
  }

  /** A playing video/iframe finished - advance like the timer would. */
  mediaEnded() {
    this.next();
  }

  pause() {
    this.paused = true;
    this.clearTimer();
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    // Held on a broken slide's failure card (paused-fail): move on at once
    // rather than waiting out a full dwell on it.
    if (this.current?.skipReason) this.next();
    else this.scheduleAdvance();
  }

  togglePause() {
    if (this.paused) this.resume();
    else this.pause();
  }

  destroy() {
    this.clearTimer();
  }

  renderCurrent() {
    this.trim();
    const slide = this.current;
    if (!slide) return;
    this.waiting = false;
    this.clearTimer();
    this.options.onRender(slide, this.position);
    this.maybeFetchNext();
  }

  /**
   * Drop already-shown slides more than `maxBackHistory` behind the current one.
   * `index` and `evicted` move together, so absolute position is unchanged and
   * pagination (which works on the retained window) is unaffected.
   */
  trim() {
    const excess = this.index - this.maxBackHistory;
    if (excess > 0) {
      this.slides.splice(0, excess);
      this.index -= excess;
      this.evicted += excess;
    }
  }

  /**
   * Begin the current slide's dwell. Called once the media is actually ready,
   * so a slow-loading image does not burn its timer while still loading.
   */
  markReady() {
    this.scheduleAdvance();
  }

  /**
   * Update the per-image dwell live (the user changed it in preferences) and
   * restart the current timer-based slide's countdown so the new value takes
   * effect without a page reload. Media (video) slides keep their own duration,
   * so they are left running.
   * @param {number} seconds
   */
  setImageTimerSeconds(seconds) {
    this.options.imageTimerSeconds = seconds;
    const slide = this.current;
    if (slide && slide.durationMode !== "media") {
      this.scheduleAdvance();
    }
  }

  scheduleAdvance() {
    this.clearTimer();
    const slide = this.current;
    if (!slide || this.paused) return;
    // Videos advance on their own `ended` event; the timer is a safety net so a
    // stalled or broken clip cannot freeze the slideshow.
    const seconds =
      slide.durationMode === "media"
        ? (slide.durationSeconds ?? this.imageTimerSeconds) +
          MEDIA_SAFETY_BUFFER_SECONDS
        : this.imageTimerSeconds;
    this.timer = setTimeout(() => this.next(), seconds * 1000);
  }

  /**
   * Upcoming slides, for preloading.
   * @param {number} [count]
   * @returns {Slide[]}
   */
  peekNext(count = 2) {
    return this.slides.slice(this.index + 1, this.index + 1 + count);
  }

  clearTimer() {
    if (this.timer != null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  maybeFetchNext() {
    if (this.exhausted || !this.after) return;
    const needed = shouldFetchNextPage({
      after: this.after,
      currentIndex: this.index,
      slideCount: this.slides.length,
      postsScannedSinceFetch: this.postsScannedSinceFetch,
    });
    if (!needed) return;
    const after = this.after;
    // Lock until the page arrives so we do not fire duplicate fetches.
    this.after = null;
    this.options.onRequestNextPage(after);
  }
}

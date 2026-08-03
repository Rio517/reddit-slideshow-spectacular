import { SlideshowController } from "./slideshow.js";
import { DuplicateTracker } from "./dedup.js";
import {
  panZoomTotalSeconds,
  panZoomConfig,
  resolutionAwareScale,
} from "./pan-zoom.js";
import { mediaUrlIsSafe, isGifImage } from "./overlay-render.js";
import { hostnameOf } from "./url-utils.js";
import {
  PROXY_MEDIA_HOSTS,
  PROXY_MEDIA_HOST_SUFFIXES,
  hostMatches,
} from "./provider-hosts.js";
import { createLogger } from "./log.js";
import { t } from "./i18n.js";

const log = createLogger("session");

// Cap retained skipped slides so a long session can't grow the list unbounded
// (it pins otherwise-evicted slides alive); the badge still shows the true total.
const MAX_SKIPPED_RETAINED = 200;

// Sentinel appended on a failed mid-session next-page fetch so the controller
// ends cleanly instead of hanging. Never mutated by append.
const EXHAUSTED_PAGE = {
  slides: [],
  after: null,
  exhausted: true,
  postsScanned: 0,
};

/**
 * @typedef {import("./slides.js").Slide} Slide
 * @typedef {ReturnType<typeof import("./overlay-ui.js").createOverlay>} Overlay
 */

/**
 * Orchestrates the slideshow: wires the controller to the overlay, applies the
 * NSFW/dedup filters, drives pagination, and handles navigation keys. All
 * browser/DOM specifics are injected so this is testable without an extension.
 *
 * @param {{
 *   doc: Document,
 *   createOverlay: (handlers: any) => Overlay,
 *   getSettings: () => Promise<import("./settings.js").Settings>,
 *   saveSettings: (patch: object) => Promise<unknown>,
 *   requestPage: (after?: string) => Promise<any>,
 *   getStartCursor?: () => string | undefined,
 *   openUrl: (url: string) => void,
 *   openPreferences?: () => void,
 *   openPopout?: () => void,
 *   resolveMedia?: (url: string) => Promise<string | null>,
 *   downloadMedia?: (url: string, filename: string) => void,
 *   resolveRedgifs?: (slide: Slide) => Promise<Slide | null>,
 *   resolveRedditAudio?: (slide: Slide) => Promise<string | null>,
 *   vote?: (id: string, dir: 1 | 0 | -1) => Promise<{ ok?: boolean }>,
 *   frontend?: "old" | "new",
 *   block?: (name: string) => Promise<{ ok?: boolean }>,
 *   friend?: (name: string) => Promise<{ ok?: boolean }>,
 *   createImage: () => { src: string, decoding?: string },
 *   createVideo?: () => { src: string, preload?: string, muted?: boolean },
 *   computeImageHash?: (url: string) => Promise<string | null>,
 *   controllerFactory?: (opts: any) => SlideshowController,
 * }} deps
 */
export function createSlideshowSession(deps) {
  const controllerFactory =
    deps.controllerFactory ?? ((opts) => new SlideshowController(opts));

  /** @type {Overlay | null} */
  let overlay = null;
  /** @type {SlideshowController | null} */
  let controller = null;
  let starting = false;
  // True once the queue is exhausted and the end card is showing, so the next
  // forward press replays from the top instead of no-oping.
  let ended = false;
  let muted = true;
  let savedOverflow = "";
  let contentDedup = false;
  /** @type {import("./settings.js").Settings | null} */
  let currentSettings = null;
  /** @type {DuplicateTracker | null} */
  let tracker = null;
  // Slide ids already enqueued for the content-dedup hash, so revisiting a slide
  // (Back / jump) doesn't re-hash it and match it against its own stored hash.
  const hashedIds = new Set();
  // Content-dedup hashing runs through one serial worker draining this FIFO, so
  // the order hashes are recorded matches queue order (the first copy is
  // recorded before a later copy is checked against it) and upcoming duplicates
  // are marked skipped before they are shown.
  /** @type {Slide[]} */
  const hashQueue = [];
  let hashing = false;
  // Direct videos we re-rendered via the background blob proxy after the direct
  // load failed - tracked so a failing fallback isn't retried forever.
  const proxyFallbackTried = new Set();
  // Redgifs embed slide ids already sent for lazy native-video resolution, so a
  // slide in the preload window is only resolved once.
  const resolvedProviderIds = new Set();
  // v.redd.it slide ids already sent for separate-audio-track resolution.
  const audioAttemptedIds = new Set();
  // Local vote state per post fullname (1 up, 0 none, -1 down), so the up/down
  // keys toggle correctly within a session. Seeded from the post's `likes`.
  /** @type {Map<string, 1 | 0 | -1>} */
  const voteState = new Map();
  /** @type {Slide[]} */
  let skipped = [];
  // True skip count; `skipped` keeps only the most recent MAX_SKIPPED_RETAINED.
  let skippedCount = 0;
  // Bumped on every start(); late async callbacks from a prior run compare
  // against it so a restart-while-open can't let two runs drive one overlay.
  let runId = 0;
  /** @type {Map<string, { src: string }>} */
  const preloads = new Map();

  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = deps.createOverlay({
      onPrev: () => back(),
      onNext: () => advance(),
      onTogglePlay: togglePlay,
      onClose: close,
      onOpenOriginal: (/** @type {Slide} */ slide) => {
        const url = slide.permalink ?? slide.sourceUrl;
        if (url && isHttpUrl(url)) deps.openUrl(url);
      },
      onMediaEnded: () => controller?.mediaEnded(),
      onMediaReady: () => controller?.markReady(),
      onToggleMute: toggleMute,
      isMuted: () => muted,
      onAutoMuted: () => {
        // Autoplay was forced muted in the overlay; keep the owner in sync so
        // subsequent slides honor it (without persisting startMuted).
        muted = true;
      },
      onOpenPreferences: () => deps.openPreferences?.(),
      onChangeSetting: (/** @type {Record<string, unknown>} */ patch) => {
        // Persist (fire-and-forget), and apply live to the running slideshow.
        void Promise.resolve(deps.saveSettings(patch)).catch(() => {});
        applyLiveSettings(
          /** @type {any} */ ({ ...(currentSettings ?? {}), ...patch }),
        );
      },
      onMediaFailed: (
        /** @type {Slide} */ slide,
        /** @type {string} */ reason,
      ) => {
        // A direct CDN video that fails - e.g. www.reddit's CSP blocks the
        // cross-origin <video> - can fall back to the background blob proxy
        // (which a CSP that allows blob: still permits). Tried once.
        const host = hostnameOf(slide.mediaUrl);
        if (
          !slide.proxied &&
          host &&
          hostMatches(host, {
            hosts: PROXY_MEDIA_HOSTS,
            suffixes: PROXY_MEDIA_HOST_SUFFIXES,
          }) &&
          !proxyFallbackTried.has(slide.id)
        ) {
          proxyFallbackTried.add(slide.id);
          slide.proxied = true;
          controller?.renderCurrent();
          return;
        }
        // Broken media (404, dead host, unfetchable proxy) - record it with the
        // specific cause. If the user paused an autoplaying show, hold on the
        // failure card instead of auto-advancing past their pause (resume or Next
        // moves on). In manual mode (autoplay off) broken media still auto-skips,
        // so stepping through never lands on a dead slide.
        recordSkip(slide, reason || t("skipReasonUnavailable"));
        if (currentSettings?.autoplay && controller?.paused) {
          overlay?.showFailed?.(slide);
        } else {
          controller?.next();
        }
      },
      onJumpTo: (/** @type {number} */ i) => controller?.goTo(i),
      // Save the displayed media via the background downloads API. Only
      // image/video slides have a concrete file; an unresolved provider embed
      // has none (the control is disabled for it too).
      onDownload: downloadCurrent,
      // Hand off to the popout window, then close this tab's slideshow.
      onPopout: () => {
        deps.openPopout?.();
        close();
      },
      resolveMedia: deps.resolveMedia,
    });
    // Mount the shadow host (the overlay lives in its shadow root) as a sibling
    // of <body>, so making <body> inert on show() can't also inert the overlay.
    deps.doc.documentElement.append(overlay.host);
    return overlay;
  }

  // Record an auto-skipped slide with the reason it was skipped. The reason
  // rides on the slide object (the same reference lives in the controller's
  // window), so both the jump list and the skipped list can show it.
  /**
   * @param {Slide} slide
   * @param {string} reason
   */
  function recordSkip(slide, reason) {
    // Idempotent: a slide reached again (e.g. clicked in the jump list) must not
    // be counted or listed twice.
    if (slide.skipReason) return;
    slide.skipReason = reason;
    skippedCount += 1;
    skipped = [...skipped, slide].slice(-MAX_SKIPPED_RETAINED);
    overlay?.setSkipped(skipped, skippedCount);
  }

  // Forward (Next / Right): replay from the top once the end card is up,
  // otherwise advance one slide.
  function advance() {
    if (ended) {
      void start();
      return;
    }
    overlay?.notifyManualNav();
    controller?.next();
  }

  // Back (Prev / Left): from the end card, drop back into the last slide;
  // otherwise step back one.
  function back() {
    if (ended) {
      ended = false;
      controller?.renderCurrent();
      return;
    }
    overlay?.notifyManualNav();
    controller?.prev();
  }

  // Page Down / Page Up: coarse ±10 seek (clamped to the loaded window). A no-op
  // on the end card so it can't trigger the replay the way Right does.
  function skipForward() {
    if (ended) return;
    overlay?.notifyManualNav();
    controller?.skip(10);
  }
  function skipBack() {
    if (ended) return;
    overlay?.notifyManualNav();
    controller?.skip(-10);
  }

  // Shift+Right: bail out of the current post/gallery to the next post.
  function skipGallery() {
    if (ended) return;
    overlay?.notifyManualNav();
    controller?.skipPostGroup();
  }

  function togglePlay() {
    if (!controller || !overlay) return;
    controller.togglePause();
    overlay.setPlaying(!controller.paused);
  }

  function toggleMute() {
    muted = !muted;
    overlay?.setMuted(muted);
    void Promise.resolve(deps.saveSettings({ startMuted: muted })).catch(
      () => {},
    );
  }

  /** @param {boolean | null | undefined} likes @returns {1 | 0 | -1} */
  function dirFromLikes(likes) {
    return likes === true ? 1 : likes === false ? -1 : 0;
  }

  // Up/down keys vote on the current post through the logged-in session. Toggles
  // like Reddit: pressing the same direction again clears the vote. Optimistic -
  // the UI flashes the new state at once and reverts only if the write fails.
  /** @param {1 | -1} dir */
  function castVote(dir) {
    const slide = controller?.current;
    const id = slide?.postId;
    if (!slide || !id || !deps.vote) return;
    const prev = voteState.has(id)
      ? voteState.get(id)
      : dirFromLikes(slide.likes);
    const next = /** @type {1 | 0 | -1} */ (prev === dir ? 0 : dir);
    voteState.set(id, next);
    slide.likes = next === 1 ? true : next === -1 ? false : null;
    overlay?.flashVote?.(next);
    overlay?.setVote?.(slide.likes);
    void Promise.resolve(deps.vote(id, next))
      .then((res) => {
        if (res && res.ok === false) throw new Error("vote rejected");
      })
      .catch(() => {
        // Revert the optimistic state and tell the user it didn't take - unless
        // a later vote on the same post already superseded this one.
        if (voteState.get(id) !== next) return;
        if (prev === undefined) voteState.delete(id);
        else voteState.set(id, prev);
        slide.likes = prev === 1 ? true : prev === -1 ? false : null;
        overlay?.setVote?.(slide.likes);
        overlay?.flashVote?.("error");
      });
  }

  // Save the displayed media via the background downloads API. Only image/video
  // slides have a concrete file; unresolved embeds have none. Used by both the
  // overlay download button and the D key.
  function downloadCurrent() {
    const slide = controller?.current;
    if (!slide || !(slide.kind === "image" || slide.kind === "video")) return;
    if (slide.mediaUrl && isHttpUrl(slide.mediaUrl) && deps.downloadMedia) {
      deps.downloadMedia(slide.mediaUrl, slide.filenameHint ?? "");
      overlay?.flashMessage?.(t("uiDownloadStarted"));
    }
  }

  // Block the current author through the session, then skip past their post.
  // Optimistic: flash + advance at once, correcting to an error flash if the
  // write fails. The block itself is reversible in Reddit settings.
  function blockAuthor() {
    const slide = controller?.current;
    const name = slide?.author;
    if (!slide || !name || name === "[deleted]" || !deps.block) return;
    overlay?.flashMessage?.(t("uiBlocked", [name]));
    controller?.skipPostGroup();
    void Promise.resolve(deps.block(name))
      .then((res) => {
        if (res && res.ok === false) throw new Error("block rejected");
      })
      .catch(() => overlay?.flashMessage?.(t("uiActionError"), "error"));
  }

  // Friend (old.reddit) / follow (new reddit) the current author. Optimistic
  // flash; the write is identical on both frontends, only the wording differs.
  function friendAuthor() {
    const slide = controller?.current;
    const name = slide?.author;
    if (!slide || !name || name === "[deleted]" || !deps.friend) return;
    overlay?.flashMessage?.(
      t(deps.frontend === "old" ? "uiFriended" : "uiFollowing", [name]),
    );
    void Promise.resolve(deps.friend(name))
      .then((res) => {
        if (res && res.ok === false) throw new Error("friend rejected");
      })
      .catch(() => overlay?.flashMessage?.(t("uiActionError"), "error"));
  }

  function lockScroll() {
    savedOverflow = deps.doc.documentElement.style.overflow;
    deps.doc.documentElement.style.overflow = "hidden";
  }
  function unlockScroll() {
    deps.doc.documentElement.style.overflow = savedOverflow;
  }

  function close() {
    ended = false;
    controller?.destroy();
    controller = null;
    overlay?.hide();
    unlockScroll();
    cancelPreloads();
  }

  function cancelPreloads() {
    for (const img of preloads.values()) img.src = "";
    preloads.clear();
  }

  // Warm the browser cache for upcoming media; cancel preloads that leave the
  // window. Images (up to 2 ahead) plus the nearest direct video are fetched so
  // a manual Next renders without a visible load. A proxied video is skipped -
  // its blob is built on demand at render time, not cacheable from here.
  function preloadUpcoming() {
    if (!controller) return;
    /** @type {{ url: string, kind: "image" | "video" }[]} */
    const wanted = [];
    let videoQueued = false;
    for (const slide of controller.peekNext(2)) {
      if (!mediaUrlIsSafe(slide)) continue;
      if (slide.kind === "image") {
        wanted.push({ url: slide.mediaUrl, kind: "image" });
      } else if (slide.kind === "video" && !slide.proxied && !videoQueued) {
        // Just the first upcoming clip - buffering several ahead would burn
        // bandwidth on slides the user may never reach.
        wanted.push({ url: slide.mediaUrl, kind: "video" });
        videoQueued = true;
      }
    }
    const wantedUrls = new Set(wanted.map((w) => w.url));
    for (const [url, el] of preloads) {
      if (!wantedUrls.has(url)) {
        el.src = "";
        preloads.delete(url);
      }
    }
    for (const { url, kind } of wanted) {
      if (preloads.has(url)) continue;
      if (kind === "video") {
        const video = (deps.createVideo ?? defaultCreateVideo)();
        video.preload = "auto";
        video.muted = true;
        video.src = url;
        preloads.set(url, video);
      } else {
        const img = deps.createImage();
        img.decoding = "async";
        img.src = url;
        preloads.set(url, img);
      }
    }
  }

  function defaultCreateVideo() {
    return deps.doc.createElement("video");
  }

  // How many slides ahead to lazily resolve redgifs embeds, so a clip is native
  // video by the time the show reaches it (the page ships with iframe embeds).
  const PROVIDER_RESOLVE_AHEAD = 2;

  /**
   * Lazily upgrade redgifs iframe embeds in the preload window to native video.
   * The page is delivered with embeds (no blocking resolve); each is resolved on
   * approach and upgraded in place. A failure keeps the iframe embed.
   * @param {number} myRun
   */
  function resolveProviderEmbeds(myRun) {
    if (!deps.resolveRedgifs || !controller) return;
    for (const slide of [
      controller.current,
      ...controller.peekNext(PROVIDER_RESOLVE_AHEAD),
    ]) {
      if (!slide || slide.kind !== "embed" || slide.provider !== "redgifs") {
        continue;
      }
      if (resolvedProviderIds.has(slide.id)) continue;
      resolvedProviderIds.add(slide.id); // resolve each embed at most once
      void Promise.resolve(deps.resolveRedgifs(slide))
        .then((upgraded) => {
          if (myRun !== runId || !upgraded) return;
          const wasCurrent = controller?.current?.id === slide.id;
          Object.assign(slide, upgraded);
          // If the on-screen slide just became native video, re-render so the
          // viewer gets the timed/unmutable clip in place of the iframe.
          if (wasCurrent && controller?.current?.id === slide.id) {
            controller.renderCurrent();
          }
        })
        .catch(() => {});
    }
  }

  /**
   * Resolve the separate audio track for v.redd.it videos in the preload window
   * (the fallback mp4 we play is silent) and attach it. An upcoming video gets
   * it at render time; the current one is attached live (no restart).
   * @param {number} myRun
   */
  function resolveUpcomingAudio(myRun) {
    if (!deps.resolveRedditAudio || !controller) return;
    for (const slide of [
      controller.current,
      ...controller.peekNext(PROVIDER_RESOLVE_AHEAD),
    ]) {
      if (!slide || slide.provider !== "reddit-video") continue;
      if (!slide.audioAvailable || !slide.dashUrl || slide.audioUrl) continue;
      if (audioAttemptedIds.has(slide.id)) continue;
      audioAttemptedIds.add(slide.id); // resolve each at most once
      void Promise.resolve(deps.resolveRedditAudio(slide))
        .then((audioUrl) => {
          if (myRun !== runId || !audioUrl) return;
          slide.audioUrl = audioUrl;
          // Already on screen: attach to the live video so it gains sound
          // without restarting.
          if (controller?.current?.id === slide.id) {
            overlay?.addCurrentAudio?.(audioUrl);
          }
        })
        .catch(() => {});
    }
  }

  // How many slides past the current one to hash each render. Hashing the
  // preload window (not just the current slide) lets a duplicate be marked
  // skipped before it is shown, instead of flashing then being skipped.
  const HASH_AHEAD = 2;

  /**
   * Layer 2 dedup (ADR 0006): enqueue the current slide and its preload window
   * for hashing, then drain the queue. Async + best-effort.
   * @param {number} myRun
   */
  function hashPreloadWindow(myRun) {
    if (!contentDedup || !tracker || !deps.computeImageHash || !controller) {
      return;
    }
    for (const slide of [
      controller.current,
      ...controller.peekNext(HASH_AHEAD),
    ]) {
      if (!slide || slide.kind !== "image") continue;
      if (slide.skipReason || hashedIds.has(slide.id)) continue;
      hashedIds.add(slide.id); // claim so it's enqueued at most once
      hashQueue.push(slide);
    }
    if (!hashing) void drainHashQueue(myRun);
  }

  /**
   * Hash queued slides one at a time, in order. Recording in FIFO order keeps
   * the first copy ahead of any later duplicate; a duplicate still on screen
   * (its hash lagged past the window) skips and advances, while an upcoming one
   * is just pre-marked so next()/prev() step over it.
   * @param {number} myRun
   */
  async function drainHashQueue(myRun) {
    hashing = true;
    try {
      while (hashQueue.length && myRun === runId) {
        const slide = hashQueue.shift();
        if (!slide || slide.skipReason) continue;
        // Prefer reddit's pre-generated small preview over re-fetching the
        // full image just to shrink it for the dHash.
        const hash = await deps.computeImageHash?.(
          slide.hashUrl ?? slide.mediaUrl,
        );
        if (myRun !== runId) break;
        if (!hash) continue;
        if (tracker?.isDuplicateHash(hash)) markDuplicate(slide);
        else tracker?.addHash(hash);
      }
    } finally {
      hashing = false;
      // A restart while a hash was in flight can leave the latest run's slides
      // queued; pick them up under the current run.
      if (hashQueue.length) void drainHashQueue(runId);
    }
  }

  /** @param {Slide} slide */
  function markDuplicate(slide) {
    const isCurrent = controller?.current?.id === slide.id;
    recordSkip(slide, t("skipReasonDuplicate"));
    // A duplicate already on screen advances, unless a paused autoplaying viewer
    // is on it (don't yank them off a valid image; the recorded skip stands).
    // An upcoming duplicate is only pre-marked - it never becomes current.
    if (isCurrent && !(currentSettings?.autoplay && controller?.paused)) {
      controller?.next();
    }
  }

  /**
   * Whether the pan & zoom motion should run for this slide: the feature is on,
   * it's an image, and either the threshold is "all images" (panZoomMinOversize
   * ≤ 1) or the image is that many times bigger than the display window (longest
   * side ≥ panZoomMinOversize × the window's longest side in device px).
   * @param {Slide} slide
   * @param {import("./settings.js").Settings} s
   */
  function panZoomApplies(slide, s) {
    if (!s.panZoom || slide.kind !== "image") return false;
    // Animated gifs read as moving content (like a video) - don't pan/zoom them.
    if (isGifImage(slide)) return false;
    // "All images": move every image, regardless of size (or unknown size).
    if (s.panZoomMinOversize <= 1) return true;
    const longest = Math.max(slide.sourceWidth ?? 0, slide.sourceHeight ?? 0);
    if (!longest) return false;
    const win = deps.doc.defaultView;
    const dpr = win?.devicePixelRatio || 1;
    const winLongest =
      Math.max(win?.innerWidth ?? 0, win?.innerHeight ?? 0) * dpr;
    return winLongest > 0 && longest >= s.panZoomMinOversize * winLongest;
  }

  /**
   * Pan-zoom config for a slide, with the zoom scaled to the image's resolution:
   * a high-res image pushes in toward its native 1:1 density, a barely-oversized
   * one barely moves, capped at the configured maximum (`panZoomScale`).
   * @param {Slide} slide
   * @param {import("./settings.js").Settings} s
   */
  function panZoomConfigFor(slide, s) {
    const win = deps.doc.defaultView;
    return {
      ...panZoomConfig(s),
      scale: resolutionAwareScale({
        sourceWidth: slide.sourceWidth,
        sourceHeight: slide.sourceHeight,
        viewportWidth: win?.innerWidth ?? 0,
        viewportHeight: win?.innerHeight ?? 0,
        dpr: win?.devicePixelRatio || 1,
        maxScale: s.panZoomScale,
      }),
    };
  }

  /**
   * The dwell shown by the countdown bar. Pan-zoomed images run for the full
   * sequence (and advance on the animation's finish); everything else uses its
   * media duration or the plain image timer.
   * @param {Slide} slide
   * @param {SlideshowController} c
   * @param {import("./settings.js").Settings} s
   */
  function effectiveSeconds(slide, c, s) {
    if (slide.durationMode === "media") {
      return slide.durationSeconds ?? c.imageTimerSeconds;
    }
    if (panZoomApplies(slide, s)) {
      return panZoomTotalSeconds(panZoomConfig(s));
    }
    return c.imageTimerSeconds;
  }

  async function start() {
    if (starting) return;
    starting = true;
    // Tear down any previous run so its timers / in-flight fetches / hash work
    // can't keep driving the overlay (restart-while-open race).
    const myRun = ++runId;
    ended = false;
    hashedIds.clear();
    hashQueue.length = 0;
    resolvedProviderIds.clear();
    audioAttemptedIds.clear();
    // A fresh run re-seeds vote state from the new listing's `likes`, so a stale
    // optimistic vote can't shadow it; proxy-fallback tracking resets too.
    voteState.clear();
    proxyFallbackTried.clear();
    controller?.destroy();
    controller = null;
    cancelPreloads();
    try {
      const wasOpen = overlay?.isOpen() ?? false;
      const ui = ensureOverlay();
      ui.show();
      if (!wasOpen) lockScroll();
      skipped = [];
      skippedCount = 0;
      ui.setSkipped(skipped, skippedCount);
      ui.showLoading();

      const settings = await deps.getSettings();
      currentSettings = settings;
      ui.setSettings(settings);
      muted = settings.startMuted;
      ui.setMuted(muted);
      // No cursor → the listing starts from the top of the current page.
      const response = await deps.requestPage(deps.getStartCursor?.());
      if (!response?.ok) {
        ui.showStatus(
          response?.error?.message ?? "Could not load this listing.",
        );
        return;
      }
      const page = response.page;
      if (!page?.slides?.length) {
        ui.showStatus("No supported media on this page.");
        return;
      }

      tracker = settings.dedupe ? new DuplicateTracker() : null;
      contentDedup =
        settings.dedupe &&
        settings.contentDedup &&
        typeof deps.computeImageHash === "function";
      /** @param {{ slides: Slide[] }} p */
      const prepare = (p) => {
        // Read the live NSFW toggle so a mid-session change affects new pages.
        let slides = (currentSettings ?? settings).includeNsfw
          ? p.slides
          : p.slides.filter((slide) => !slide.over18);
        if (tracker) slides = tracker.filterNewByKey(slides);
        return { ...p, slides };
      };

      controller = controllerFactory({
        imageTimerSeconds: settings.imageTimerSeconds,
        onRender: (/** @type {Slide} */ slide, /** @type {any} */ position) => {
          if (!controller || myRun !== runId) return;
          const live = currentSettings ?? settings;
          const applies = panZoomApplies(slide, live);
          ui.renderCurrent(slide, {
            ...position,
            effectiveSeconds: effectiveSeconds(slide, controller, live),
            loadWaitMs: live.maxLoadWaitSeconds * 1000,
            playing: !controller.paused,
            transition: live.transition,
            panZoom: applies ? panZoomConfigFor(slide, live) : null,
          });
          // The jump list shows the loaded (retained) window; baseNumber is the
          // absolute 1-based position of its first slide.
          ui.setJumpList(
            controller.slides,
            controller.index,
            position.index - controller.index + 1,
          );
          preloadUpcoming();
          hashPreloadWindow(myRun);
          resolveProviderEmbeds(myRun);
          resolveUpcomingAudio(myRun);
        },
        onRequestNextPage: async (/** @type {string} */ after) => {
          ui.setBuffering(true);
          try {
            const next = await deps.requestPage(after);
            if (myRun !== runId) return;
            if (next?.ok && next.page) {
              controller?.append(prepare(next.page));
            } else {
              controller?.append(EXHAUSTED_PAGE);
            }
          } catch (err) {
            log.warn("next-page fetch failed", err);
            // A stale rejection after a restart must not append onto the new run.
            if (myRun !== runId) return;
            controller?.append(EXHAUSTED_PAGE);
          } finally {
            if (myRun === runId) ui.setBuffering(false);
          }
        },
        onEnd: () => {
          ended = true;
          ui.showEnd();
        },
      });
      if (!settings.autoplay) controller.pause();
      controller.start(prepare(page));
    } finally {
      starting = false;
    }
  }

  /**
   * Apply changed preferences to the running slideshow without a page reload.
   * The per-image dwell, autoplay, and mute apply immediately; NSFW and load-wait
   * apply to subsequently loaded pages/slides; dedup toggles take effect on the
   * next run.
   * @param {import("./settings.js").Settings} next
   */
  function applyLiveSettings(next) {
    const prev = currentSettings;
    currentSettings = next;
    overlay?.setSettings(next);
    if (!controller || !overlay) return;

    // Per-image dwell: update and restart the current timer-based slide. A
    // pan-zoomed image advances on its animation, not this timer, so leave its
    // running countdown alone (the change applies to the next image).
    controller.setImageTimerSeconds(next.imageTimerSeconds);
    const slide = controller.current;
    if (
      slide &&
      slide.durationMode !== "media" &&
      !panZoomApplies(slide, next)
    ) {
      overlay.restartTimer(
        effectiveSeconds(slide, controller, next),
        !controller.paused,
      );
    }

    // Autoplay and mute only change when the setting itself flips, so a manual
    // pause/unmute isn't clobbered by an unrelated settings change.
    if (prev && prev.autoplay !== next.autoplay) {
      if (next.autoplay && controller.paused) controller.resume();
      else if (!next.autoplay && !controller.paused) controller.pause();
      overlay.setPlaying(!controller.paused);
    }
    if (prev && prev.startMuted !== next.startMuted) {
      muted = next.startMuted;
      overlay.setMuted(muted);
    }
  }

  const HANDLED_KEYS = new Set([
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "ArrowDown",
    "PageUp",
    "PageDown",
    " ",
    "Escape",
    "m",
    "M",
    "f",
    "F",
    "?",
    "d",
    "D",
    "i",
    "I",
    "a",
    "A",
  ]);

  // Action keys that must not auto-repeat while a key is held: download, block,
  // and friend/follow each act once per press (see handleKeydown).
  const REPEAT_GUARDED_KEYS = new Set(["d", "D", "i", "I", "a", "A"]);

  /**
   * @param {KeyboardEvent} event
   */
  function handleKeydown(event) {
    if (!event.isTrusted) return; // ignore synthetic events; page JS must not drive account writes
    if (!overlay || overlay.isOpen() !== true) return;
    if (!HANDLED_KEYS.has(event.key)) return;
    // Inside an open panel/popover, or on a form input/select, yield every key
    // but Escape: the panel/slider needs the arrows (to scroll or change a
    // value) and Space/Enter (to activate), and only Escape should still close.
    const target = /** @type {Element | null} */ (event.target);
    const inLayer = target?.closest?.(
      "input, select, [role=dialog], .rs-confirm, .rs-jump-panel, .rs-skipped-panel, .rs-settings-panel, .rs-help-panel",
    );
    if (inLayer && event.key !== "Escape") return;
    // On a bare chrome button/link, only Space/Enter activate it; the global
    // shortcuts (arrows, M, F) still work.
    if (
      target?.closest?.("button, a") &&
      (event.key === " " || event.key === "Enter")
    ) {
      return;
    }
    // Capture phase + stopImmediatePropagation so RES and old Reddit do not also
    // act on these keys while the slideshow is open.
    event.preventDefault();
    event.stopImmediatePropagation();
    // A held key auto-repeats. Swallow the repeat for the account-write / save
    // actions so they fire once per press - holding I would otherwise block a
    // cascade of authors (it advances after each block). Nav/toggle keys still
    // repeat normally.
    if (event.repeat && REPEAT_GUARDED_KEYS.has(event.key)) return;
    switch (event.key) {
      case "ArrowLeft":
        back();
        break;
      case "ArrowRight":
        if (event.shiftKey) skipGallery();
        else advance();
        break;
      case "ArrowUp":
        castVote(1);
        break;
      case "ArrowDown":
        castVote(-1);
        break;
      case "PageDown":
        skipForward();
        break;
      case "PageUp":
        skipBack();
        break;
      case " ":
        togglePlay();
        break;
      case "m":
      case "M":
        toggleMute();
        break;
      case "f":
      case "F":
        overlay?.toggleFullscreen();
        break;
      case "?":
        overlay?.toggleHelp();
        break;
      case "d":
      case "D":
        downloadCurrent();
        break;
      case "i":
      case "I":
        blockAuthor();
        break;
      case "a":
      case "A":
        friendAuthor();
        break;
      case "Escape":
        // Close an open panel/popover first; only close the show when nothing
        // is open on top.
        if (!overlay?.dismissTopLayer()) close();
        break;
    }
  }

  return {
    start,
    handleKeydown,
    close,
    applyLiveSettings,
    isOpen: () => overlay?.isOpen() === true,
  };
}

/**
 * HTTPS only - "open original" should never navigate to a cleartext (or
 * `javascript:`/`data:`) URL from a post's permalink/source field.
 * @param {string} url
 * @returns {boolean}
 */
function isHttpUrl(url) {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

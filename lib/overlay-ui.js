import { renderSlide, mediaUrlIsSafe } from "./overlay-render.js";
import { createSettingsPanel } from "./overlay-settings.js";
import { createHelpPanel } from "./overlay-help.js";
import { panZoomAnimation } from "./pan-zoom.js";
import {
  MANUAL_ZOOM_KEY_STEP,
  identityZoom,
  isZoomed,
  wheelZoomFactor,
  zoomAtPoint,
  zoomTransform,
} from "./manual-zoom.js";
import { hostnameOf } from "./url-utils.js";
import { t, tn, currentLocale, localeDirection } from "./i18n.js";
import {
  SPECTACULAR_PATH,
  SPECTACULAR_VIEWBOX,
} from "./wordmark-spectacular.js";

/**
 * @typedef {import("./slides.js").Slide} Slide
 */

const SVG_NS = "http://www.w3.org/2000/svg";
// If media never signals load/error, advance anyway after this long (default;
// overridable per render via info.loadWaitMs).
const READY_FALLBACK_MS = 5000;

// Native video controls are revealed only while the pointer is active over the
// clip, then re-hidden this long after it stops/leaves (so they never linger at
// the start or end of playback).
const VIDEO_CONTROLS_IDLE_MS = 2000;

// Slide-change transitions. The incoming frame is held off-screen until its
// media is decoded (so a UHD image can't flash black mid-swap), then revealed
// with one of these while the outgoing frame animates out. Keep in sync with
// the rs-tx-* / rs-dir-* rules in assets/overlay.css.
const TRANSITIONS = ["none", "fade", "slide", "push", "zoom", "flip"];
const DEFAULT_TRANSITION = "fade";
// Matches the --rs-tx-dur in overlay.css; used to retire the outgoing frame if
// its animationend never fires (e.g. transition: none on the host).
const TRANSITION_MS = 450;

/** @param {unknown} name */
function normalizeTransition(name) {
  return typeof name === "string" && TRANSITIONS.includes(name)
    ? name
    : DEFAULT_TRANSITION;
}

/**
 * The host the slide's media comes from, for the jump-list "domain" column
 * (e.g. `i.redd.it`, `redgifs.com`). `www.` is dropped for readability.
 * @param {Slide} slide
 * @returns {string}
 */
function slideDomain(slide) {
  const host = hostnameOf(slide.sourceUrl) || hostnameOf(slide.mediaUrl) || "";
  return host.replace(/^www\./, "");
}

/**
 * A short label for what kind of media the slide is, for the jump-list "type"
 * column. Looping clips (gifs, gifv, giphy) read as "gif" whether they render as
 * an `<img>` or a `<video>`.
 * @param {Slide} slide
 * @returns {string}
 */
function slideAssetType(slide) {
  if (slide.isGif || slide.mimeType === "image/gif") return "gif";
  if (slide.kind === "video") return "video";
  if (slide.kind === "embed") return "embed";
  return "image";
}

// Cohesive media-player glyphs. `paths` are filled; `strokePaths` are stroked.
/** @type {Record<string, { paths?: string[], strokePaths?: string[] }>} */
const ICONS = {
  prev: { paths: ["M6 5.5h2.2v13H6z", "M18.5 6v12l-9.6-6z"] },
  next: { paths: ["M5.5 6v12l9.6-6z", "M15.8 5.5H18v13h-2.2z"] },
  play: { paths: ["M7.5 5.3v13.4L19 12z"] },
  pause: { paths: ["M7 5.5h3.2v13H7z", "M13.8 5.5H17v13h-3.2z"] },
  unmute: {
    paths: ["M11 5 6 9.5H4v5h2L11 19z"],
    strokePaths: ["M14.5 9.2a4 4 0 0 1 0 5.6", "M16.8 7a7 7 0 0 1 0 10"],
  },
  mute: {
    paths: ["M11 5 6 9.5H4v5h2L11 19z"],
    strokePaths: ["M15.5 9.5l5 5", "M20.5 9.5l-5 5"],
  },
  open: {
    paths: [
      "M13 4a1 1 0 0 0 0 2h2.59l-6.3 6.29a1 1 0 0 0 1.42 1.42L17 7.41V10a1 1 0 0 0 2 0V5a1 1 0 0 0-1-1z",
      "M6 7a1 1 0 0 1 1-1h3a1 1 0 0 1 0 2H8v8h8v-2a1 1 0 0 1 2 0v3a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1z",
    ],
  },
  prefs: {
    paths: [
      "M19.14 12.94c.04-.31.06-.62.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7 7 0 0 0-1.62-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54a7 7 0 0 0-1.62.94l-2.39-.96a.5.5 0 0 0-.61.22L2.74 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.62-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .61.22l2.39-.96c.5.38 1.05.7 1.62.94l.36 2.54a.5.5 0 0 0 .5.42h3.84a.5.5 0 0 0 .5-.42l.36-2.54a7 7 0 0 0 1.62-.94l2.39.96a.5.5 0 0 0 .61-.22l1.92-3.32a.5.5 0 0 0-.12-.64zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z",
    ],
  },
  help: {
    paths: [
      "M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z",
    ],
  },
  fullscreen: {
    strokePaths: [
      "M4 8.5V4h4.5",
      "M20 8.5V4h-4.5",
      "M4 15.5V20h4.5",
      "M20 15.5V20h-4.5",
    ],
  },
  popout: {
    strokePaths: [
      "M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5",
      "M14 4h6v6",
      "M20 4l-8 8",
    ],
  },
  download: {
    strokePaths: ["M12 4v10", "M8 11l4 4 4-4", "M5 19h14"],
  },
  fullscreenExit: {
    strokePaths: [
      "M8.5 4v4.5H4",
      "M15.5 4v4.5H20",
      "M8.5 20v-4.5H4",
      "M15.5 20v-4.5H20",
    ],
  },
  close: {
    paths: [
      "M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4 17.6 5 12 10.6z",
    ],
  },
};

/**
 * Build the slideshow overlay chrome. DOM-only; the caller wires controller
 * callbacks through `handlers`.
 *
 * @param {{
 *   onPrev: () => void,
 *   onNext: () => void,
 *   onTogglePlay: () => void,
 *   onClose: () => void,
 *   onOpenOriginal: (slide: Slide) => void,
 *   onMediaEnded: () => void,
 *   onMediaReady: () => void,
 *   onToggleMute: () => void,
 *   isMuted?: () => boolean,
 *   onAutoMuted?: () => void,
 *   onOpenPreferences: () => void,
 *   onChangeSetting?: (patch: Record<string, unknown>) => void,
 *   onMediaFailed?: (slide: Slide, reason: string) => void,
 *   onJumpTo?: (index: number) => void,
 *   onPopout?: () => void,
 *   onDownload?: () => void,
 *   resolveMedia?: (url: string) => Promise<string | null>,
 * }} handlers
 * @param {Document} [doc]
 * @param {string} [styleText] Overlay CSS injected into the shadow root. The
 *   caller (content script / screenshot harness) passes the bundled stylesheet
 *   so the overlay is styled in isolation; omitted in unit tests.
 */
export function createOverlay(handlers, doc = document, styleText) {
  const root = doc.createElement("div");
  root.id = "reddit-slideshow-root";
  // Mirror the whole overlay under RTL locales (Arabic et al.); the CSS keys its
  // logical properties and the --rs-dir transform sign off this attribute.
  root.dir = localeDirection(currentLocale());
  root.hidden = true;
  // Modal dialog over the page; focus is moved in on show(), and the page is made
  // inert so focus is really trapped (see show()/hide()).
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-label", t("uiAriaLabel"));
  root.tabIndex = -1;

  // Mount the whole overlay inside a shadow root so host/RES page CSS can't reach
  // it (and our CSS can't leak out). `host` is what the caller attaches to the
  // page; `root` (and all the chrome below) lives in the shadow. Event listeners
  // stay on `root`, inside the shadow, so event.target isn't retargeted.
  const host = doc.createElement("div");
  host.id = "reddit-slideshow-host";
  const shadow = host.attachShadow({ mode: "open" });
  if (styleText) {
    const style = doc.createElement("style");
    style.textContent = styleText;
    shadow.append(style);
  }
  shadow.append(root);

  // Sub-panels (settings / help / jump / skipped / confirm) behave as dialogs:
  // opening one moves keyboard focus into it and remembers the control that
  // opened it; closing returns focus there. Without this a keyboard or
  // screen-reader user is stranded on a now-hidden control. Keyed per panel so a
  // mutual-exclusion close doesn't clobber another panel's return target.
  const LAYER_FOCUSABLE =
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  /** @type {WeakMap<Element, Element | null>} */
  const panelReturnFocus = new WeakMap();
  /**
   * @param {HTMLElement} panel
   * @param {Element | null} trigger Control to refocus when the panel closes.
   * @param {Element | null} [preferred] Focus this instead of the first focusable.
   */
  function focusIntoPanel(panel, trigger, preferred) {
    panelReturnFocus.set(panel, trigger);
    const target = /** @type {HTMLElement | null} */ (
      preferred ?? panel.querySelector(LAYER_FOCUSABLE) ?? panel
    );
    if (target === panel) panel.tabIndex = -1;
    target?.focus?.();
  }
  /** @param {HTMLElement} panel */
  function restorePanelFocus(panel) {
    const back = /** @type {HTMLElement | null} */ (
      panelReturnFocus.get(panel) ?? null
    );
    panelReturnFocus.delete(panel);
    if (back?.isConnected) back.focus?.();
  }

  // Visually-hidden polite live region announcing the current slide and skips.
  const liveRegion = doc.createElement("div");
  liveRegion.className = "rs-live";
  liveRegion.setAttribute("aria-live", "polite");
  liveRegion.setAttribute("aria-atomic", "true");

  const timerBar = doc.createElement("div");
  timerBar.className = "rs-timer";
  const timerFill = doc.createElement("div");
  timerFill.className = "rs-timer__fill";
  timerBar.append(timerFill);

  const stage = doc.createElement("div");
  stage.className = "rs-stage";

  const meta = doc.createElement("div");
  meta.className = "rs-meta";
  // The position counter doubles as the jump-to-post toggle.
  const counter = doc.createElement("button");
  counter.type = "button";
  counter.className = "rs-meta__counter";
  counter.title = t("uiJumpToPost");
  counter.setAttribute("aria-label", t("uiJumpToPost"));
  // Drop the pulse class when it finishes so a later manual nav can re-trigger it.
  counter.addEventListener("animationend", () =>
    counter.classList.remove("rs-meta__counter--pulse"),
  );
  const openMetaBtn = controlButton(doc, "open", t("uiOpenOriginal"), () => {
    if (current) handlers.onOpenOriginal(current);
  });
  openMetaBtn.classList.add("rs-meta__open");
  const downloadBtn = controlButton(doc, "download", t("uiDownload"), () =>
    handlers.onDownload?.(),
  );
  downloadBtn.classList.add("rs-meta__download");
  // The inline "loading next media" spinner sits at the end of the title row.
  const titleSpinner = doc.createElement("span");
  titleSpinner.className = "rs-meta__spinner";
  titleSpinner.setAttribute("aria-hidden", "true");

  // Vote indicator at the head of the title: an arrow tinted by the viewer's
  // current vote - orange up (upvoted), blue down (downvoted), soft grey up
  // (no vote). The triangle flips to point down via CSS in the downvote state.
  const voteArrow = doc.createElementNS(SVG_NS, "svg");
  voteArrow.setAttribute("viewBox", "0 0 24 24");
  voteArrow.setAttribute("aria-hidden", "true");
  voteArrow.setAttribute("class", "rs-meta__vote rs-meta__vote--none");
  const voteTri = doc.createElementNS(SVG_NS, "path");
  voteTri.setAttribute("d", "M12 5 20 18H4z");
  voteArrow.append(voteTri);

  // Title row: the vote arrow, the truncated title, then the open-original
  // arrow, the download control, and the loading spinner (only the title text
  // ellipsizes).
  const title = doc.createElement("div");
  title.className = "rs-meta__title";
  const titleText = doc.createElement("span");
  titleText.className = "rs-meta__title-text";
  title.append(voteArrow, titleText, openMetaBtn, downloadBtn, titleSpinner);

  // Byline: "/u/author to /r/subreddit" (domain + pixel size move to the source
  // line below). The author/subreddit tokens are LTR strings (u/alice, r/aww);
  // each wraps a <bdi> so it stays readable embedded in RTL byline text.
  const byline = doc.createElement("div");
  byline.className = "rs-meta__byline";
  // The author/subreddit links carry an inner <bdi> holding the LTR token text
  // (renderByline writes into it) so the anchor keeps its href + classes.
  const author = doc.createElement("a");
  author.className = "rs-meta__author";
  author.target = "_blank";
  author.rel = "noopener noreferrer";
  author.hidden = true;
  author.append(doc.createElement("bdi"));
  const subreddit = doc.createElement("a");
  subreddit.className = "rs-meta__subreddit";
  subreddit.target = "_blank";
  subreddit.rel = "noopener noreferrer";
  subreddit.hidden = true;
  subreddit.append(doc.createElement("bdi"));
  /** @param {string} text */
  const bylineSep = (text) => {
    const s = doc.createElement("span");
    s.className = "rs-meta__sep";
    s.textContent = text;
    s.hidden = true;
    return s;
  };
  const toSep = bylineSep(t("bylineSepTo"));
  byline.append(author, toSep, subreddit);

  // Source line, below the byline: the domain and pixel size, with a bullet
  // between them (no "from"/"at" words). Both are <bdi> LTR tokens in a mono
  // font; the whole line hides when the slide has neither.
  const source = doc.createElement("div");
  source.className = "rs-meta__source";
  const domainEl = doc.createElement("bdi");
  domainEl.className = "rs-meta__domain";
  domainEl.hidden = true;
  const resEl = doc.createElement("bdi");
  resEl.className = "rs-meta__res";
  resEl.hidden = true;
  const dotSep = bylineSep("•");
  source.append(domainEl, dotSep, resEl);

  const nsfw = doc.createElement("span");
  nsfw.className = "rs-meta__nsfw";
  nsfw.textContent = t("uiNsfw");
  nsfw.hidden = true;
  // Bottom-left stack, anchored at the bottom and growing up: NSFW on top, then
  // the title row, the byline, and the source line at the bottom. The counter
  // lives in the top-left cluster, not here.
  meta.append(nsfw, title, byline, source);

  // Jump-to-post list, toggled by clicking the counter.
  const jumpPanel = doc.createElement("div");
  jumpPanel.className = "rs-jump-panel";
  jumpPanel.hidden = true;

  const controls = doc.createElement("div");
  controls.className = "rs-controls";
  const prevBtn = controlButton(doc, "prev", t("uiPrev"), handlers.onPrev);
  const playBtn = controlButton(
    doc,
    "pause",
    t("uiPlayPause"),
    handlers.onTogglePlay,
  );
  playBtn.classList.add("rs-btn--primary");
  const nextBtn = controlButton(doc, "next", t("uiNext"), handlers.onNext);
  const muteBtn = controlButton(
    doc,
    "mute",
    t("uiMuteUnmute"),
    handlers.onToggleMute,
  );
  const fullscreenBtn = controlButton(
    doc,
    "fullscreen",
    t("uiFullscreen"),
    toggleFullscreen,
  );
  const popoutBtn = controlButton(doc, "popout", t("uiPopout"), () =>
    handlers.onPopout?.(),
  );
  // Toggle the shortcuts panel; also reachable via the `?` key (session keydown).
  function toggleHelp() {
    const show = helpPanel.root.hidden;
    helpPanel.root.hidden = !show;
    if (show) {
      // Help and settings are both centered cards; opening one closes the other
      // so they can't stack on top of each other.
      settingsPanel.root.hidden = true;
      focusIntoPanel(helpPanel.root, helpBtn);
    } else {
      restorePanelFocus(helpPanel.root);
    }
  }
  const helpBtn = controlButton(doc, "help", t("uiHelp"), toggleHelp);
  const prefsBtn = controlButton(doc, "prefs", t("uiSettings"), () => {
    const show = settingsPanel.root.hidden;
    settingsPanel.root.hidden = !show;
    if (show) {
      helpPanel.root.hidden = true;
      focusIntoPanel(settingsPanel.root, prefsBtn);
    } else {
      restorePanelFocus(settingsPanel.root);
    }
  });
  const closeBtn = controlButton(doc, "close", t("uiClose"), handlers.onClose);
  // The close button lives in the top-right corner, not the rail.
  closeBtn.classList.add("rs-close-top");
  controls.append(
    prevBtn,
    playBtn,
    nextBtn,
    muteBtn,
    fullscreenBtn,
    popoutBtn,
    helpBtn,
    prefsBtn,
  );

  function toggleFullscreen() {
    if (doc.fullscreenElement) doc.exitFullscreen?.();
    else root.requestFullscreen?.().catch(() => {});
  }
  // Keep the icon in sync whether fullscreen is toggled by the button, the F
  // key, or the browser's own Esc.
  doc.addEventListener("fullscreenchange", () => {
    setIcon(
      fullscreenBtn,
      doc.fullscreenElement ? "fullscreenExit" : "fullscreen",
      doc,
    );
    fullscreenBtn.title = doc.fullscreenElement
      ? t("uiFullscreenExit")
      : t("uiFullscreen");
  });

  // Transient toast confirming an up/down-key vote (keys-only, no buttons).
  const voteFlash = doc.createElement("div");
  voteFlash.className = "rs-vote-flash";
  voteFlash.hidden = true;
  voteFlash.setAttribute("aria-hidden", "true");
  /** @type {ReturnType<typeof setTimeout> | null} */
  let voteFlashTimer = null;
  /** @type {Record<string, { text: string, cls: string }>} */
  const VOTE_FLASH = {
    1: { text: t("uiVoteUp"), cls: "rs-vote-flash--up" },
    "-1": { text: t("uiVoteDown"), cls: "rs-vote-flash--down" },
    0: { text: t("uiVoteRemoved"), cls: "rs-vote-flash--none" },
    error: { text: t("uiVoteError"), cls: "rs-vote-flash--error" },
  };
  /** @param {string} text @param {string} cls */
  function showFlashToast(text, cls) {
    voteFlash.textContent = text;
    voteFlash.classList.remove("rs-vote-flash--on");
    void voteFlash.offsetWidth; // restart the animation on a rapid re-press
    voteFlash.className = `rs-vote-flash ${cls} rs-vote-flash--on`;
    voteFlash.hidden = false;
    announce(text);
    if (voteFlashTimer != null) clearTimeout(voteFlashTimer);
    voteFlashTimer = setTimeout(() => {
      voteFlash.classList.remove("rs-vote-flash--on");
      voteFlash.hidden = true;
    }, 1200);
  }
  /** @param {1 | 0 | -1 | "error"} state */
  function flashVote(state) {
    const def = VOTE_FLASH[String(state)] ?? VOTE_FLASH.error;
    showFlashToast(def.text, def.cls);
  }
  /**
   * Transient confirmation toast for keys-only actions (block/friend/download).
   * @param {string} text
   * @param {"info" | "error"} [variant]
   */
  function flashMessage(text, variant = "info") {
    showFlashToast(
      text,
      variant === "error" ? "rs-vote-flash--error" : "rs-vote-flash--none",
    );
  }

  const buffering = doc.createElement("div");
  buffering.className = "rs-buffering";
  buffering.hidden = true;
  const bufferingDot = doc.createElement("span");
  bufferingDot.className = "rs-buffering__dot";
  const bufferingLabel = doc.createElement("span");
  bufferingLabel.textContent = t("uiBuffering");
  buffering.append(bufferingDot, bufferingLabel);

  const loading = doc.createElement("div");
  loading.className = "rs-loading";
  loading.hidden = true;
  loading.append(doc.createElement("span"));

  // A small corner spinner shown only while the chrome is hidden and the next
  // media is loading - the title-row spinner is invisible then (see CSS).
  const loaddot = doc.createElement("div");
  loaddot.className = "rs-loaddot";
  loaddot.append(doc.createElement("span"));

  // Count of media that failed to load and was auto-skipped; click to list them.
  const skippedBtn = doc.createElement("button");
  skippedBtn.type = "button";
  skippedBtn.className = "rs-skipped";
  skippedBtn.hidden = true;
  const skippedPanel = doc.createElement("div");
  skippedPanel.className = "rs-skipped-panel";
  skippedPanel.hidden = true;

  // Top-left cluster: the position counter (which opens the jump list) with the
  // skipped badge to its right. Both share the meta-pin / idle-fade behavior.
  const topLeft = doc.createElement("div");
  topLeft.className = "rs-topleft";
  topLeft.append(counter, skippedBtn);

  // In-overlay settings, toggled by the gear control.
  const settingsPanel = createSettingsPanel(doc, {
    onChange: (patch) => handlers.onChangeSetting?.(patch),
    onOpenFullPreferences: () => handlers.onOpenPreferences(),
  });

  // In-overlay keyboard-shortcuts list, toggled by the (?) control.
  const helpPanel = createHelpPanel(doc);

  // Each panel's own × hides it (in its factory); also return focus to the
  // control that opened it, so a keyboard user isn't dropped onto a hidden ×.
  settingsPanel.root
    .querySelector(".rs-settings-panel__close")
    ?.addEventListener("click", () => restorePanelFocus(settingsPanel.root));
  helpPanel.root
    .querySelector(".rs-help-panel__close")
    ?.addEventListener("click", () => restorePanelFocus(helpPanel.root));

  // Confirm popover guarding an accidental backdrop click. Esc and the X close
  // immediately; a backdrop click asks here first.
  const confirmClose = doc.createElement("div");
  confirmClose.className = "rs-confirm";
  confirmClose.hidden = true;
  confirmClose.setAttribute("role", "alertdialog");
  confirmClose.setAttribute("aria-modal", "true");
  confirmClose.setAttribute("aria-labelledby", "rs-confirm-text");
  const confirmText = doc.createElement("p");
  confirmText.className = "rs-confirm__text";
  confirmText.id = "rs-confirm-text";
  confirmText.textContent = t("uiConfirmClose");
  const confirmActions = doc.createElement("div");
  confirmActions.className = "rs-confirm__actions";
  const confirmKeep = doc.createElement("button");
  confirmKeep.type = "button";
  confirmKeep.className = "rs-confirm__btn";
  confirmKeep.textContent = t("uiConfirmKeep");
  const confirmDo = doc.createElement("button");
  confirmDo.type = "button";
  confirmDo.className = "rs-confirm__btn rs-confirm__btn--danger";
  confirmDo.textContent = t("uiConfirmDo");
  confirmActions.append(confirmKeep, confirmDo);
  confirmClose.append(confirmText, confirmActions);
  const CONFIRM_SECONDS = 5;
  /** @type {ReturnType<typeof setInterval> | null} */
  let confirmTimer = null;
  function stopConfirmCountdown() {
    if (confirmTimer != null) {
      clearInterval(confirmTimer);
      confirmTimer = null;
    }
  }
  function hideConfirm() {
    confirmClose.hidden = true;
    stopConfirmCountdown();
    confirmKeep.textContent = t("uiConfirmKeep");
    restorePanelFocus(confirmClose);
  }
  // aria-modal: keep Tab inside the two buttons while the confirm is up.
  confirmClose.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    event.preventDefault();
    (shadow.activeElement === confirmKeep ? confirmDo : confirmKeep).focus?.();
  });
  // The popover self-dismisses (keeps watching) after a visible countdown shown
  // in the Keep-watching button, so an ignored prompt doesn't sit forever.
  function startConfirmCountdown() {
    stopConfirmCountdown();
    let remaining = CONFIRM_SECONDS;
    confirmKeep.textContent = t("uiConfirmKeepCountdown", [remaining]);
    confirmTimer = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        hideConfirm();
        return;
      }
      confirmKeep.textContent = t("uiConfirmKeepCountdown", [remaining]);
    }, 1000);
  }
  confirmKeep.addEventListener("click", hideConfirm);
  confirmDo.addEventListener("click", () => {
    hideConfirm();
    handlers.onClose();
  });

  root.append(
    timerBar,
    stage,
    meta,
    topLeft,
    jumpPanel,
    controls,
    closeBtn,
    buffering,
    loading,
    loaddot,
    voteFlash,
    skippedPanel,
    settingsPanel.root,
    helpPanel.root,
    confirmClose,
    liveRegion,
  );

  /** @type {Slide | null} */
  let current = null;
  /** @type {Slide[]} */
  let skippedSlides = [];
  // True skip count; `skippedSlides` may hold only the most recent subset.
  let skippedTotal = 0;
  /** @type {{ slides: Slide[], currentIndex: number, baseNumber: number }} */
  let jumpData = { slides: [], currentIndex: 0, baseNumber: 1 };
  // The element focused before the overlay opened, restored on hide().
  /** @type {Element | null} */
  let lastFocused = null;
  // Top timer-bar visibility: "none" | "video" | "all".
  let timerBarMode = "video";
  // Idle delay before the chrome auto-hides; mousemove resets it.
  const IDLE_HIDE_MS = 2600;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let idleTimer = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let readyFallback = null;
  /** @type {AbortController | null} */
  let mediaListeners = null;
  /** @type {Animation | null} */
  let panZoomAnim = null;
  // The frame holding the slide currently considered "live". A render layers the
  // next frame over it and only retires it once the new media is ready.
  /** @type {HTMLElement | null} */
  let shownFrame = null;
  // The last frame that actually committed (became visible). On a rapid 3rd
  // advance the pending (never-committed) frame must be retired, not held, so the
  // outgoing frame is always the visible one - keyed on commit, not shownFrame.
  /** @type {HTMLElement | null} */
  let committedFrame = null;
  // Absolute index of the last rendered slide, for transition direction.
  let lastIndex = -1;
  // Absolute index of the slide currently on screen, set synchronously on each
  // render (unlike lastIndex, which only moves once a frame commits). Drives the
  // "deep into the show" backdrop-close guard.
  let shownIndex = -1;
  // One-shot: the imminent render came from a manual Next/Prev (not the timer),
  // so it should give loading feedback over a still-held frame.
  let manualNavPending = false;
  // Manual inspect-zoom (paused): state for the committed frame's transform.
  let manualZoom = identityZoom();
  // Mirror of the play/pause state; manual zoom only engages while paused.
  let playingNow = true;
  // Last pointer position over the overlay: the anchor for key-driven zoom.
  /** @type {{ x: number, y: number } | null} */
  let lastPointer = null;
  // Bumped per renderCurrent so a stale retire-timeout from an earlier render
  // (or after hide()) no-ops instead of retiring the wrong/detached frame.
  let renderGen = 0;
  // Per-frame blob: URL (proxied video) to revoke when that frame is retired.
  /** @type {WeakMap<HTMLElement, string>} */
  const frameObjectUrls = new WeakMap();

  const TITLE_MAX = 50;
  /** @param {Slide} slide */
  function renderTitle(slide) {
    const full = slide.title ?? "";
    titleText.textContent =
      full.length > TITLE_MAX ? `${full.slice(0, TITLE_MAX).trimEnd()}…` : full;
    titleText.title = full; // hover shows the untruncated title
  }
  /**
   * Byline "/u/author to /r/subreddit" plus the source line "{domain} • {W}×{H}".
   * Each part (and the connective/bullet by it) hides when absent.
   * @param {Slide} slide
   */
  function renderByline(slide) {
    const origin = profileOrigin(slide.permalink);
    // Write the token text into the anchor's inner <bdi> so the bidi isolation
    // survives and the anchor keeps its href + classes.
    const authorBdi = author.firstElementChild;
    const subredditBdi = subreddit.firstElementChild;
    if (slide.author) {
      author.hidden = false;
      if (authorBdi) authorBdi.textContent = `/u/${slide.author}`;
      author.href = `${origin}/user/${encodeURIComponent(slide.author)}`;
    } else {
      author.hidden = true;
      author.removeAttribute("href");
      if (authorBdi) authorBdi.textContent = "";
    }
    if (slide.subreddit) {
      subreddit.hidden = false;
      if (subredditBdi) subredditBdi.textContent = `/r/${slide.subreddit}`;
      subreddit.href = `${origin}/r/${encodeURIComponent(slide.subreddit)}`;
    } else {
      subreddit.hidden = true;
      subreddit.removeAttribute("href");
      if (subredditBdi) subredditBdi.textContent = "";
    }
    const domain = slideDomain(slide);
    domainEl.hidden = !domain;
    domainEl.textContent = domain;
    const hasRes = Boolean(slide.sourceWidth && slide.sourceHeight);
    resEl.hidden = !hasRes;
    resEl.textContent = hasRes
      ? `${slide.sourceWidth}×${slide.sourceHeight}`
      : "";
    // "to" only between author and subreddit; the bullet only between a present
    // domain and resolution; the whole source line hides with neither.
    toSep.hidden = !(slide.author && slide.subreddit);
    dotSep.hidden = !(domain && hasRes);
    source.hidden = !(domain || hasRes);
  }

  /**
   * Tint the title's vote arrow to the viewer's current vote.
   * @param {boolean | null | undefined} likes true up, false down, null none.
   */
  function setVote(likes) {
    const state = likes === true ? "up" : likes === false ? "down" : "none";
    voteArrow.setAttribute("class", `rs-meta__vote rs-meta__vote--${state}`);
  }
  /** @param {string | undefined} permalink */
  function profileOrigin(permalink) {
    try {
      return new URL(permalink ?? "").origin;
    } catch {
      return "https://www.reddit.com";
    }
  }
  function showTitleSpinner() {
    titleSpinner.classList.add("rs-meta__spinner--on");
    loaddot.classList.add("rs-loaddot--on");
  }
  function hideTitleSpinner() {
    titleSpinner.classList.remove("rs-meta__spinner--on");
    loaddot.classList.remove("rs-loaddot--on");
  }

  function cancelPanZoom() {
    if (panZoomAnim) {
      panZoomAnim.cancel();
      panZoomAnim = null;
    }
  }

  // Stop a frame's <video> (so an unmuted clip can't keep playing), revoke its
  // blob, and detach it.
  /** @param {HTMLElement | null} frame */
  function retireFrame(frame) {
    if (!frame) return;
    const video = /** @type {HTMLVideoElement | null} */ (
      frame.querySelector("video")
    );
    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
    // Stop the companion audio track (v.redd.it) so it can't outlive its frame.
    const audio = /** @type {HTMLAudioElement | null} */ (
      frame.querySelector("audio")
    );
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load(); // abort any in-flight buffering, mirroring the video above
    }
    const url = frameObjectUrls.get(frame);
    if (url) {
      URL.revokeObjectURL(url);
      frameObjectUrls.delete(frame);
    }
    frame.remove();
  }

  function retireAllFrames() {
    for (const frame of stage.querySelectorAll(".rs-slide")) {
      retireFrame(/** @type {HTMLElement} */ (frame));
    }
    shownFrame = null;
    committedFrame = null;
  }

  // Strip the transition classes a frame kept from when it entered, so a later
  // exit animation can't collide with the stale enter one.
  /** @param {HTMLElement} frame */
  function clearTxClasses(frame) {
    frame.classList.remove(
      "rs-slide--enter",
      "rs-slide--exit",
      "rs-dir-fwd",
      "rs-dir-back",
    );
    for (const cls of [...frame.classList]) {
      if (cls.startsWith("rs-tx-")) frame.classList.remove(cls);
    }
  }

  // Auto-hide chrome after a brief idle. Hovering the controls, the counter
  // cluster, or any open panel keeps them up; going idle also dismisses any
  // open panel.
  let overChrome = false;
  function goIdle() {
    if (root.hidden) return; // don't mutate a closed overlay (mirrors wake())
    root.classList.add("rs-idle");
    settingsPanel.root.hidden = true;
    helpPanel.root.hidden = true;
    jumpPanel.hidden = true;
    skippedPanel.hidden = true;
  }
  // Selector for interactive chrome whose focus should keep the overlay awake.
  const CHROME_SELECTOR =
    ".rs-controls, .rs-close-top, .rs-meta, .rs-settings-panel, .rs-help-panel, .rs-jump-panel, .rs-skipped-panel, .rs-skipped, .rs-confirm";
  // True only while *keyboard* focus rests on the chrome, so the idle timer
  // can't fade controls out from under a keyboard user. Gated on :focus-visible
  // so a control still focused after a mouse click doesn't pin the chrome open.
  // Reads the shadow's activeElement (document-level focus retargets to host).
  function focusInChrome() {
    const active = shadow.activeElement;
    if (!active || !active.closest(CHROME_SELECTOR)) return false;
    // :focus-visible is the browser's keyboard-vs-pointer heuristic; an engine
    // that lacks it falls back to "keep awake" (the prior behavior).
    try {
      return active.matches(":focus-visible");
    } catch {
      return true;
    }
  }
  function wake() {
    if (root.hidden) return; // a queued mousemove must not reschedule after hide()
    // Only touch the DOM when actually idle - mousemove fires this constantly.
    if (root.classList.contains("rs-idle")) root.classList.remove("rs-idle");
    if (idleTimer != null) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (!overChrome && !focusInChrome()) goIdle();
    }, IDLE_HIDE_MS);
  }
  root.addEventListener("mousemove", wake);
  root.addEventListener("mouseleave", goIdle);
  // Keyboard focus entering the overlay wakes it; the idle timer then defers to
  // focusInChrome() so it won't fade out while a control is focused.
  root.addEventListener("focusin", wake);
  // Keep the chrome up while the pointer rests on the controls, the counter
  // cluster, or an open panel, even when it isn't moving - so browsing the jump
  // or skipped list (or the settings/help cards) isn't yanked closed by the
  // idle timer mid-read.
  for (const el of [
    controls,
    topLeft,
    settingsPanel.root,
    helpPanel.root,
    jumpPanel,
    skippedPanel,
  ]) {
    el.addEventListener("mouseenter", () => {
      overChrome = true;
      if (idleTimer != null) clearTimeout(idleTimer);
      root.classList.remove("rs-idle");
    });
    el.addEventListener("mouseleave", () => {
      overChrome = false;
      wake();
    });
  }

  // Click the backdrop (the black area, or any chrome that isn't an icon) to
  // close - like a lightbox. Clicks on a control button or the media itself are
  // left to their own handlers.
  root.addEventListener("click", (event) => {
    const target = /** @type {Element | null} */ (event.target);
    if (!target) return;
    if (
      target.closest(".rs-btn") || // a control button (incl. the X)
      target.closest(".rs-slide") || // the media frame
      target.closest(".rs-placeholder") || // the failure card (has its own button)
      target.closest(".rs-topleft") || // the counter + skipped badge cluster
      target.closest(".rs-skipped-panel") || // the skipped list
      target.closest(".rs-settings-panel") || // the inline settings
      target.closest(".rs-help-panel") || // the shortcuts list
      target.closest(".rs-meta") || // the bottom meta bar (open original / title)
      target.closest(".rs-jump-panel") || // the jump-to-post list
      target.closest(".rs-confirm") // the close-confirm popover
    ) {
      return;
    }
    // A backdrop click while the confirm is up dismisses it.
    if (!confirmClose.hidden) {
      hideConfirm();
      return;
    }
    // A backdrop click while a panel is open dismisses the panel, not the show.
    const panels = [
      settingsPanel.root,
      helpPanel.root,
      skippedPanel,
      jumpPanel,
    ];
    if (panels.some((p) => !p.hidden)) {
      for (const p of panels) {
        if (!p.hidden) {
          p.hidden = true;
          restorePanelFocus(p);
        }
      }
      return;
    }
    // Only guard an accidental backdrop click once the viewer is well into the
    // show (past 20 slides); earlier on, a misclick costs little, so close at once.
    if (shownIndex >= 20) {
      showConfirmAt(/** @type {MouseEvent} */ (event));
    } else {
      handlers.onClose();
    }
  });

  /**
   * Manual inspect-zoom: scale the committed frame about (x, y). Engages only
   * while paused, on an image/video frame. Returns true when it applied.
   * @param {number} factor
   * @param {number} x
   * @param {number} y
   */
  function applyManualZoom(factor, x, y) {
    const frame = committedFrame;
    const media = frame?.querySelector(".reddit-slideshow-media");
    if (playingNow || !frame || !media || media.tagName === "IFRAME") {
      return false;
    }
    // The finished entrance animation (fill: both) would override an inline
    // transform on the frame - shed the transition classes before zooming.
    for (const cls of [...frame.classList]) {
      if (
        cls === "rs-slide--enter" ||
        cls.startsWith("rs-tx-") ||
        cls.startsWith("rs-dir-")
      ) {
        frame.classList.remove(cls);
      }
    }
    const rect = frame.getBoundingClientRect();
    manualZoom = zoomAtPoint(manualZoom, factor, x, y, rect.left, rect.top);
    frame.style.transformOrigin = isZoomed(manualZoom) ? "0 0" : "";
    frame.style.transform = zoomTransform(manualZoom);
    frame.classList.toggle("rs-slide--zoomed", isZoomed(manualZoom));
    return true;
  }

  /** Clear any manual zoom. Returns true when there was one to clear. */
  function resetManualZoom() {
    const wasZoomed = isZoomed(manualZoom);
    manualZoom = identityZoom();
    if (wasZoomed && committedFrame) {
      committedFrame.style.transform = "";
      committedFrame.style.transformOrigin = "";
      committedFrame.classList.remove("rs-slide--zoomed");
    }
    return wasZoomed;
  }

  // Wheel over a paused slide zooms about the pointer (mouse wheel and
  // trackpad pinch alike). Open panels keep native scrolling.
  root.addEventListener(
    "wheel",
    (event) => {
      const target = /** @type {Element | null} */ (event.target);
      if (
        target?.closest?.(
          ".rs-jump-panel, .rs-skipped-panel, .rs-settings-panel, .rs-help-panel, .rs-confirm",
        )
      ) {
        return;
      }
      const applied = applyManualZoom(
        wheelZoomFactor(event.deltaY, event.deltaMode),
        event.clientX,
        event.clientY,
      );
      if (applied) {
        event.preventDefault();
        wake();
      }
    },
    { passive: false },
  );
  root.addEventListener("mousemove", (event) => {
    lastPointer = { x: event.clientX, y: event.clientY };
  });

  /** @param {MouseEvent} event */
  function showConfirmAt(event) {
    const view = doc.defaultView;
    const vw = view?.innerWidth ?? 0;
    const vh = view?.innerHeight ?? 0;
    // Place it under the click, clamped so it can't spill off the edges (half
    // the 300px width, plus headroom below for the taller card).
    const x = vw
      ? Math.min(Math.max(event.clientX || vw / 2, 160), vw - 160)
      : event.clientX;
    // Clamp the top too so the popover can't clip off the top or bottom edge.
    const y = vh
      ? Math.min(Math.max(event.clientY || vh / 2, 70), vh - 170)
      : Math.max(event.clientY, 70);
    confirmClose.style.left = `${x}px`;
    confirmClose.style.top = `${y}px`;
    confirmClose.hidden = false;
    startConfirmCountdown();
    // Move focus into the modal (default to "Keep watching") and remember where
    // to send it back when it closes.
    focusIntoPanel(confirmClose, shadow.activeElement, confirmKeep);
  }

  skippedBtn.addEventListener("click", () => {
    const opening = skippedPanel.hidden;
    if (opening) renderSkippedPanel();
    skippedPanel.hidden = !skippedPanel.hidden;
    if (opening) {
      // Both panels drop from the same top-left anchor, so don't stack them.
      jumpPanel.hidden = true;
      focusIntoPanel(skippedPanel, skippedBtn);
    } else {
      restorePanelFocus(skippedPanel);
    }
  });

  counter.addEventListener("click", () => {
    const opening = jumpPanel.hidden;
    if (opening) renderJumpPanel();
    jumpPanel.hidden = !jumpPanel.hidden;
    if (opening) {
      skippedPanel.hidden = true; // same anchor; don't stack
      // Scroll to the current post only once the panel is displayed -
      // scrollIntoView does nothing while it's still `display:none`.
      scrollJumpToCurrent();
      // Focus the current row (also brings it into view) so keyboard users land
      // on where they are, not the top of the list.
      const currentRow =
        jumpPanel.querySelector(".rs-jump-panel__item--current") ??
        jumpPanel.querySelector(".rs-jump-panel__item");
      focusIntoPanel(jumpPanel, counter, currentRow);
    } else {
      restorePanelFocus(jumpPanel);
    }
  });

  function scrollJumpToCurrent() {
    jumpPanel
      .querySelector(".rs-jump-panel__item--current")
      ?.scrollIntoView({ block: "nearest" });
  }

  function renderJumpPanel() {
    const { slides, currentIndex, baseNumber } = jumpData;
    const heading = doc.createElement("p");
    heading.className = "rs-jump-panel__title";
    heading.textContent = t("uiJumpToPost");
    const items = slides.map((slide, i) => {
      const item = doc.createElement("button");
      item.type = "button";
      item.className = "rs-jump-panel__item";
      if (i === currentIndex)
        item.classList.add("rs-jump-panel__item--current");
      const num = doc.createElement("span");
      num.className = "rs-jump-panel__num";
      num.textContent = String(baseNumber + i);
      // Primary line: the post title (CSS-ellipsized; full text on hover).
      const name = doc.createElement("span");
      name.className = "rs-jump-panel__name";
      name.textContent = slide.title ?? "";
      if (slide.title) name.title = slide.title;
      // Subline: where the media is from, and what kind it is.
      const sub = doc.createElement("span");
      sub.className = "rs-jump-panel__sub";
      const domain = doc.createElement("span");
      domain.className = "rs-jump-panel__domain";
      domain.textContent = slideDomain(slide);
      const sep = doc.createElement("span");
      sep.className = "rs-jump-panel__sep";
      sep.textContent = "·";
      sep.setAttribute("aria-hidden", "true");
      const type = doc.createElement("span");
      type.className = "rs-jump-panel__type";
      // Auto-skipped slides stay listed (so the numbering still lines up with
      // what played) but read as dimmed, with the type column showing the
      // specific skip reason in place of the asset kind.
      if (slide.skipReason) {
        item.classList.add("rs-jump-panel__item--skipped");
        type.classList.add("rs-jump-panel__type--reason");
        type.textContent = slide.skipReason;
      } else {
        type.textContent = slideAssetType(slide);
      }
      sub.append(domain, sep, type);
      const body = doc.createElement("span");
      body.className = "rs-jump-panel__body";
      body.append(name, sub);
      item.append(num, body);
      item.addEventListener("click", () => {
        jumpPanel.hidden = true;
        restorePanelFocus(jumpPanel);
        handlers.onJumpTo?.(i);
      });
      return item;
    });
    jumpPanel.replaceChildren(heading, ...items);
  }

  /**
   * @param {Slide[]} slides Loaded slides (the retained window).
   * @param {number} currentIndex Index of the current slide within `slides`.
   * @param {number} baseNumber Absolute 1-based number of the first slide.
   */
  function setJumpList(slides, currentIndex, baseNumber) {
    jumpData = { slides, currentIndex, baseNumber };
    if (!jumpPanel.hidden) {
      renderJumpPanel();
      scrollJumpToCurrent();
    }
  }

  function renderSkippedPanel() {
    const heading = doc.createElement("p");
    heading.className = "rs-skipped-panel__title";
    heading.textContent = t("uiSkippedTitle", [skippedTotal]);
    const items = skippedSlides.map((slide) => {
      const item = doc.createElement("button");
      item.type = "button";
      item.className = "rs-skipped-panel__item";
      const text = doc.createElement("span");
      text.className = "rs-skipped-panel__text";
      text.textContent =
        slide.title || slide.sourceUrl || t("uiSkippedUntitled");
      item.append(text);
      if (slide.skipReason) {
        const reason = doc.createElement("span");
        reason.className = "rs-skipped-panel__reason";
        reason.textContent = slide.skipReason;
        item.append(reason);
      }
      item.addEventListener("click", () => handlers.onOpenOriginal(slide));
      return item;
    });
    const nodes = [heading, ...items];
    if (skippedTotal > skippedSlides.length) {
      const note = doc.createElement("p");
      note.className = "rs-skipped-panel__note";
      note.textContent = t("uiSkippedNote", [skippedSlides.length]);
      nodes.push(note);
    }
    skippedPanel.replaceChildren(...nodes);
  }

  /**
   * @param {Slide[]} slides Retained skipped slides (most recent).
   * @param {number} [total] True skip count (defaults to slides.length).
   */
  function setSkipped(slides, total = slides.length) {
    // Announce only when the count grew (a fresh auto-skip), not on the reset
    // each run does at start.
    if (total > skippedTotal) {
      const last = slides[slides.length - 1];
      announce(
        last?.title
          ? t("uiSkippedAnnounceTitled", [last.title])
          : t("uiSkippedAnnounce"),
      );
    }
    skippedSlides = slides;
    skippedTotal = total;
    skippedBtn.hidden = total === 0;
    skippedBtn.textContent = tn("skipped", total, [total]);
    skippedBtn.title = tn("skippedTitle", total, [total]);
    if (!skippedPanel.hidden) renderSkippedPanel();
  }

  /**
   * @param {Slide} slide
   * @param {{ index: number, total: number, exhausted: boolean, effectiveSeconds?: number, loadWaitMs?: number, playing: boolean, transition?: string, panZoom?: import("./pan-zoom.js").PanZoomConfig | null }} info
   */
  function renderCurrent(slide, info) {
    current = slide;
    clearReadyFallback();
    // Any inspect-zoom belongs to the outgoing slide.
    resetManualZoom();
    renderGen += 1;
    const myGen = renderGen;
    // Drop the previous slide's media listeners so a detached video that fires
    // `ended` late cannot advance the queue.
    mediaListeners?.abort();
    mediaListeners = new AbortController();
    const { signal } = mediaListeners;
    cancelPanZoom();
    timerFill.style.animation = "none";
    timerBar.hidden = true;

    const transition = normalizeTransition(info.transition);
    const forward = info.index >= lastIndex;
    const dirClass = forward ? "rs-dir-fwd" : "rs-dir-back";

    // Flush every frame except the last committed (visible) one, which becomes
    // this render's outgoing frame. Keying on committedFrame (not shownFrame)
    // means a rapid 3rd advance retires the undecoded pending frame and holds the
    // visible one - no black gap.
    for (const f of stage.querySelectorAll(".rs-slide")) {
      if (f !== committedFrame) retireFrame(/** @type {HTMLElement} */ (f));
    }
    // Remove any loading splash / status card so it can't linger beneath the
    // slides - a render appends its frame rather than replacing the stage.
    for (const child of [...stage.children]) {
      if (!child.classList.contains("rs-slide")) child.remove();
    }
    const outgoing = committedFrame;
    // Pause the outgoing clip; its last frame stays visible under the incoming
    // one until the transition retires it.
    /** @type {HTMLVideoElement | null} */ (
      outgoing?.querySelector("video") ?? null
    )?.pause();

    const media = renderSlide(slide, doc);
    // The frame is "pending" (hidden) until its media is ready, so the entrance
    // animation never plays over an undecoded/blank image.
    const frame = doc.createElement("div");
    frame.className = "rs-slide rs-slide--pending";
    frame.append(media);
    stage.append(frame);
    shownFrame = frame;
    // Show before the media-load listeners run so the spinner is on during the
    // pending window even when an already-decoded image commits synchronously.
    showTitleSpinner();

    let readyFired = false;
    // Reveal the new frame and animate the old one out - once the media is
    // decoded/ready, so the swap is gap-free.
    const commit = () => {
      if (readyFired) return;
      readyFired = true;
      hideTitleSpinner();
      clearReadyFallback();
      loading.hidden = true;
      root.classList.remove("rs-nav-loading");
      // Record direction only once a frame goes live, so a failed/skipped render
      // can't advance it.
      lastIndex = info.index;
      committedFrame = frame;
      frame.classList.remove("rs-slide--pending");
      if (transition !== "none") {
        frame.classList.add("rs-slide--enter", `rs-tx-${transition}`, dirClass);
      }
      retireOutgoing(outgoing, transition, dirClass, myGen);
      if (shouldShowTimerBar(slide)) {
        startTimerBar(info.effectiveSeconds, info.playing);
      }
      // A pan-zoomed image advances when its animation finishes; everything
      // else advances on the controller's dwell timer (started by onMediaReady).
      const animating = startPanZoom(media, info, signal);
      if (!animating) handlers.onMediaReady();
    };
    /** @param {string} reason Specific cause, shown in the skipped list. */
    const fail = (reason) => {
      if (readyFired) return;
      readyFired = true;
      hideTitleSpinner();
      clearReadyFallback();
      loading.hidden = true;
      root.classList.remove("rs-nav-loading");
      // Skip broken media immediately (record it for the skipped list) rather
      // than dwelling on a placeholder. Falls back to the placeholder when no
      // skip handler is wired.
      if (handlers.onMediaFailed) {
        handlers.onMediaFailed(slide, reason);
      } else {
        retireAllFrames();
        showPlaceholder(slide);
      }
    };

    if (media.tagName === "VIDEO") {
      const video = /** @type {HTMLVideoElement} */ (media);
      // Mute state lives in the session (the owner); read it per render.
      video.muted = handlers.isMuted?.() ?? true;
      // Arm before any src so controls work the instant a proxied blob lands.
      armVideoControls(video, signal);
      // v.redd.it serves audio separately; play the resolved track from a
      // companion <audio> synced to this silent fallback video.
      if (slide.audioUrl) {
        attachSyncedAudio(video, slide.audioUrl, frame, doc, signal);
      }
      media.addEventListener("ended", handlers.onMediaEnded, { signal });
      media.addEventListener("error", () => fail(t("skipReasonVideo")), {
        signal,
      });
      // Try to play; if unmuted autoplay is blocked, fall back to muted (and
      // sync the mute button) so the clip still plays.
      media.addEventListener(
        "loadeddata",
        () => {
          commit();
          // Paused / manual mode: show the first frame but don't play. Pressing
          // Play (setPlaying) starts it; this mirrors pan & zoom freezing paused.
          if (!info.playing) return;
          const playback = video.play();
          if (playback) {
            playback.catch(() => {
              // Autoplay blocked unmuted: fall back to muted, and tell the
              // session (the mute owner) so later slides stay muted too.
              handlers.onAutoMuted?.();
              setMuted(true);
              video.play().catch(() => {});
            });
          }
        },
        { signal },
      );
      // Proxied (Redgifs) clips have no direct src - the background fetches the
      // bytes and we play them as a blob. The loader shows until it arrives.
      if (slide.proxied) {
        Promise.resolve(handlers.resolveMedia?.(slide.mediaUrl) ?? null)
          .then((objectUrl) => {
            if (signal.aborted) {
              if (objectUrl) URL.revokeObjectURL(objectUrl);
              return;
            }
            if (objectUrl) {
              frameObjectUrls.set(frame, objectUrl);
              video.src = objectUrl;
            } else {
              fail(t("skipReasonFetch"));
            }
          })
          .catch(() => {
            if (!signal.aborted) fail(t("skipReasonFetch"));
          });
      }
    } else if (media.tagName === "IFRAME") {
      media.addEventListener("load", commit, { signal });
      media.addEventListener("error", () => fail(t("skipReasonEmbed")), {
        signal,
      });
    } else {
      // Image: gate the swap on decode() so the bitmap is paintable before the
      // old frame leaves. This is what stops a UHD image from flashing black -
      // decode time scales with pixels and outlasts the `load` event.
      const img = /** @type {HTMLImageElement} */ (media);
      media.addEventListener("error", () => fail(t("skipReasonImage")), {
        signal,
      });
      const revealWhenDecoded = () => {
        if (typeof img.decode === "function") {
          // Even if decode rejects after a successful load, show it anyway.
          img.decode().then(commit, commit);
        } else {
          commit();
        }
      };
      if (img.complete && img.naturalWidth > 0) {
        revealWhenDecoded();
      } else {
        media.addEventListener("load", revealWhenDecoded, { signal });
      }
    }

    // Reject a URL the sink won't load (non-HTTPS / off-host) like a broken
    // load - deferred so it can't re-enter renderCurrent synchronously.
    if (!mediaUrlIsSafe(slide)) {
      Promise.resolve().then(() => {
        if (!signal.aborted) fail(t("skipReasonUnsupported"));
      });
    }

    shownIndex = info.index;
    counter.textContent = `${info.index + 1} / ${info.total}${info.exhausted ? "" : "+"}`;
    renderTitle(slide);
    renderByline(slide);
    setVote(slide.likes);
    // Only image/video slides have a concrete file to save; an unresolved embed
    // (a provider iframe) has no downloadable media.
    downloadBtn.disabled =
      !(slide.kind === "image" || slide.kind === "video") || !slide.mediaUrl;
    nsfw.hidden = !slide.over18;
    setPlaying(info.playing);

    // Announce position + title (and NSFW) for screen readers.
    const where = t("uiAnnouncePosition", [info.index + 1, info.total]);
    const what = slide.title ? t("uiAnnounceTitle", [slide.title]) : "";
    announce(`${where}${what}${slide.over18 ? t("uiAnnounceNsfw") : ""}`);

    if (!readyFired) {
      // Normally the held frame stays clean (no loader flicker on a fast auto-
      // advance). But a *manual* Next/Prev that's slow to load should say so -
      // dim the held image and show the spinner so it doesn't look frozen.
      const manual = manualNavPending;
      loading.hidden = Boolean(outgoing) && !manual;
      root.classList.toggle("rs-nav-loading", Boolean(outgoing) && manual);
      // Never let a stuck load freeze the slideshow.
      readyFallback = setTimeout(commit, info.loadWaitMs ?? READY_FALLBACK_MS);
    }
  }

  /**
   * Animate the outgoing frame out (matching the incoming transition) and retire
   * it when the animation ends, with a timeout fallback. The fallback is keyed to
   * the render that armed it (`gen`) so a stale timer firing after hide() or a
   * later render no-ops instead of retiring the wrong/detached frame.
   * @param {HTMLElement | null} outgoing
   * @param {string} transition
   * @param {string} dirClass
   * @param {number} gen
   */
  function retireOutgoing(outgoing, transition, dirClass, gen) {
    if (!outgoing) return;
    if (transition === "none") {
      retireFrame(outgoing);
      return;
    }
    clearTxClasses(outgoing);
    outgoing.classList.add("rs-slide--exit", `rs-tx-${transition}`, dirClass);
    let done = false;
    const finish = () => {
      if (done || gen !== renderGen) return;
      done = true;
      retireFrame(outgoing);
    };
    outgoing.addEventListener("animationend", finish, { once: true });
    setTimeout(finish, TRANSITION_MS + 80);
  }

  /** @param {Slide | null} slide */
  function shouldShowTimerBar(slide) {
    if (!slide || timerBarMode === "none") return false;
    if (timerBarMode === "video") return slide.durationMode === "media";
    return true;
  }

  /**
   * @param {number | undefined} seconds
   * @param {boolean} playing
   */
  function startTimerBar(seconds, playing) {
    timerFill.style.animation = "none";
    if (!seconds || seconds <= 0) {
      timerBar.hidden = true;
      return;
    }
    timerBar.hidden = false;
    // Force reflow so the animation restarts for the new slide.
    timerFill.getBoundingClientRect();
    timerFill.style.animation = `rs-sweep ${seconds}s linear forwards`;
    timerFill.style.animationPlayState = playing ? "running" : "paused";
  }

  /**
   * Run the Ken Burns pan & zoom on an image slide. Resolution-independent
   * (scale + transform-origin, clipped by the stage at the viewport). The
   * animation length is the dwell, so its `finish` advances the slide. Returns
   * true when it took over advancing (so the caller skips the normal dwell timer).
   * @param {HTMLElement} media
   * @param {{ panZoom?: import("./pan-zoom.js").PanZoomConfig | null, playing: boolean }} info
   * @param {AbortSignal} signal
   * @returns {boolean}
   */
  function startPanZoom(media, info, signal) {
    if (!info.panZoom || media.tagName !== "IMG") return false;
    if (typeof media.animate !== "function") return false; // WAAPI unavailable
    // Honor reduced-motion: skip the Ken Burns move and fall back to the dwell
    // timer (the caller starts it when this returns false).
    if (
      doc.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      return false;
    }
    const { keyframes, options } = panZoomAnimation(info.panZoom);
    panZoomAnim = media.animate(keyframes, options);
    panZoomAnim.addEventListener("finish", () => handlers.onMediaEnded(), {
      signal,
    });
    if (!info.playing) panZoomAnim.pause();
    return true;
  }

  function clearReadyFallback() {
    if (readyFallback != null) {
      clearTimeout(readyFallback);
      readyFallback = null;
    }
  }

  /** @param {string} text Polite screen-reader announcement. */
  function announce(text) {
    liveRegion.textContent = text;
  }

  /** @param {boolean} playing */
  function setPlaying(playing) {
    playingNow = playing;
    // The inspect-zoom is a paused-only mode; resuming ends it.
    if (playing) resetManualZoom();
    setIcon(playBtn, playing ? "pause" : "play", doc);
    playBtn.title = playing ? t("uiPause") : t("uiPlay");
    // Paused: the play button pulses turquoise so it's obvious the show is stopped.
    playBtn.classList.toggle("rs-btn--paused", !playing);
    if (
      timerFill.style.animationName &&
      timerFill.style.animationName !== "none"
    ) {
      timerFill.style.animationPlayState = playing ? "running" : "paused";
    }
    const media = shownFrame?.querySelector("video");
    if (media) {
      if (playing) media.play().catch(() => {});
      else media.pause();
    }
    if (panZoomAnim) {
      if (playing) panZoomAnim.play();
      else panZoomAnim.pause();
    }
  }

  /**
   * Failure card for media that should have rendered but did not.
   * @param {Slide} slide
   */
  function showPlaceholder(slide) {
    const card = doc.createElement("div");
    card.className = "rs-placeholder";

    const heading = doc.createElement("p");
    heading.className = "rs-placeholder__title";
    heading.textContent = slide.title || t("uiPlaceholderTitle");

    const note = doc.createElement("p");
    note.className = "rs-placeholder__note";
    note.textContent = t("uiPlaceholderNote");

    const open = doc.createElement("button");
    open.type = "button";
    open.className = "rs-placeholder__open";
    open.textContent = t("uiPlaceholderOpen");
    open.addEventListener("click", () => handlers.onOpenOriginal(slide));

    card.append(heading, note, open);
    stage.replaceChildren(card);
  }

  // A status/loading card can replace a live slide, so tear its media down first.
  function clearStageForStatus() {
    current = null;
    clearReadyFallback();
    resetManualZoom();
    mediaListeners?.abort();
    cancelPanZoom();
    retireAllFrames();
    setBuffering(false);
    timerBar.hidden = true;
    loading.hidden = true;
  }

  /** @param {string} text */
  function showStatus(text) {
    clearStageForStatus();
    const status = doc.createElement("p");
    status.className = "rs-status";
    status.textContent = text;
    stage.replaceChildren(status);
    wake();
  }

  // Branded splash shown while the first page loads.
  function showLoading() {
    clearStageForStatus();
    stage.replaceChildren(buildLogo(doc, t("uiLoading")));
    wake();
  }

  // Manual Next/Prev: pulse the counter so the press always registers visibly,
  // and arm the next render to show loading feedback even over a held frame.
  function notifyManualNav() {
    manualNavPending = true;
    // If the press doesn't actually move (clamped at an end), don't leave the
    // flag armed for a later auto-advance. renderCurrent runs synchronously
    // inside the same tick, so it still sees the flag before this clears it.
    Promise.resolve().then(() => {
      manualNavPending = false;
    });
    counter.classList.remove("rs-meta__counter--pulse");
    void counter.offsetWidth; // reflow so the animation restarts on rapid presses
    counter.classList.add("rs-meta__counter--pulse");
  }

  // End card once the queue is exhausted: the logo again, with a prompt to
  // replay from the top (the session wires the next/right press to a restart).
  function showEnd() {
    clearStageForStatus();
    stage.replaceChildren(buildLogo(doc, t("uiEnd")));
    wake();
  }

  /** @param {boolean} active */
  function setBuffering(active) {
    buffering.hidden = !active;
  }

  /** @param {boolean} value */
  function setMuted(value) {
    setIcon(muteBtn, value ? "mute" : "unmute", doc);
    muteBtn.title = value ? t("uiUnmute") : t("uiMute");
    const video = shownFrame?.querySelector("video");
    if (video) {
      video.muted = value;
      if (!value) video.play().catch(() => {});
    }
  }

  return {
    root,
    host,
    show() {
      // Remember where focus was so hide() can return it, then move focus into
      // the dialog for keyboard users.
      lastFocused = doc.activeElement;
      root.hidden = false;
      // Make the rest of the page inert: a real focus trap (Tab can't leave the
      // overlay) and it blocks pointer/AT access to the page behind the modal.
      // The overlay host is a sibling of <body>, so it stays interactive.
      if (doc.body) doc.body.inert = true;
      root.focus?.();
      wake();
    },
    hide() {
      root.hidden = true;
      if (doc.body) doc.body.inert = false;
      hideTitleSpinner(); // a stale spinner must not persist across opens
      loading.hidden = true;
      skippedPanel.hidden = true;
      settingsPanel.root.hidden = true;
      helpPanel.root.hidden = true;
      jumpPanel.hidden = true;
      hideConfirm(); // also stops the countdown interval and resets the button
      setBuffering(false);
      clearReadyFallback();
      // Move the render generation on so any armed retire-timeout no-ops.
      renderGen += 1;
      mediaListeners?.abort();
      resetManualZoom();
      cancelPanZoom();
      retireAllFrames();
      stage.replaceChildren();
      if (idleTimer != null) clearTimeout(idleTimer);
      // Return focus to whatever was focused before the overlay opened.
      if (lastFocused && lastFocused.isConnected) {
        /** @type {HTMLElement} */ (lastFocused).focus?.();
      }
      lastFocused = null;
    },
    isOpen() {
      return !root.hidden;
    },
    // Dismiss the topmost open layer (confirm popover, then a settings/jump/
    // skipped panel). Returns true when something was dismissed, so the caller
    // (Escape handling) can decide whether to close the whole show.
    dismissTopLayer() {
      if (!confirmClose.hidden) {
        hideConfirm();
        return true;
      }
      for (const panel of [
        settingsPanel.root,
        helpPanel.root,
        jumpPanel,
        skippedPanel,
      ]) {
        if (!panel.hidden) {
          panel.hidden = true;
          restorePanelFocus(panel);
          return true;
        }
      }
      // An inspect-zoom is the last layer: Esc resets it before closing.
      return resetManualZoom();
    },
    // Manual inspect-zoom (paused): step about the last pointer position.
    /** @param {number} direction 1 zooms in, -1 zooms out. */
    manualZoomStep(direction) {
      const factor =
        direction > 0 ? MANUAL_ZOOM_KEY_STEP : 1 / MANUAL_ZOOM_KEY_STEP;
      const view = doc.defaultView;
      const x = lastPointer?.x ?? (view?.innerWidth ?? 0) / 2;
      const y = lastPointer?.y ?? (view?.innerHeight ?? 0) / 2;
      if (applyManualZoom(factor, x, y)) wake();
    },
    renderCurrent,
    flashVote,
    setVote,
    flashMessage,
    // Attach a companion audio track to the video already on screen (its
    // v.redd.it audio resolved after it was shown), without restarting it.
    /** @param {string} audioUrl */
    addCurrentAudio(audioUrl) {
      const video = /** @type {HTMLVideoElement | null} */ (
        shownFrame?.querySelector("video") ?? null
      );
      if (!video || !shownFrame || shownFrame.querySelector("audio")) return;
      if (mediaListeners) {
        attachSyncedAudio(
          video,
          audioUrl,
          shownFrame,
          doc,
          mediaListeners.signal,
        );
      }
    },
    // Tear down the current frames and show the broken-media card. Used when a
    // paused viewer's slide fails, so it holds on the card instead of advancing.
    /** @param {Slide} slide */
    showFailed(slide) {
      retireAllFrames();
      showPlaceholder(slide);
    },
    showStatus,
    showLoading,
    showEnd,
    notifyManualNav,
    setPlaying,
    setBuffering,
    setMuted,
    setSkipped,
    setJumpList,
    toggleHelp,
    /** @param {import("./settings.js").Settings} s */
    setSettings(s) {
      settingsPanel.setValues(s);
      timerBarMode = s.timerBar;
      // Pin the counter + title so they survive the idle fade.
      root.classList.toggle("rs-pin-count", s.alwaysShowCount);
      root.classList.toggle("rs-pin-meta", s.alwaysShowMeta);
      // A live change that now hides the bar applies at once; turning it on
      // shows on the next slide.
      if (current && !shouldShowTimerBar(current)) {
        timerFill.style.animation = "none";
        timerBar.hidden = true;
      }
    },
    toggleFullscreen,
    // Restart the visual countdown for the current slide (e.g. the dwell changed
    // live in preferences). The dwell itself is restarted by the controller.
    restartTimer(
      /** @type {number} */ seconds,
      /** @type {boolean} */ playing,
    ) {
      if (!current) return;
      if (shouldShowTimerBar(current)) startTimerBar(seconds, playing);
      else {
        timerFill.style.animation = "none";
        timerBar.hidden = true;
      }
    },
  };
}

/**
 * Reveal a video's native controls only while the pointer is active over it,
 * re-hiding shortly after it stops moving or leaves. They start (and end)
 * hidden, so the control bar never pops in disruptively at the start or end of
 * a clip. Bound to the render's AbortSignal so the listeners and idle timer die
 * when the frame is retired.
 * @param {HTMLVideoElement} video
 * @param {AbortSignal} signal
 */
function armVideoControls(video, signal) {
  /** @type {ReturnType<typeof setTimeout> | null} */
  let idle = null;
  const hide = () => {
    if (idle != null) {
      clearTimeout(idle);
      idle = null;
    }
    video.controls = false;
  };
  const reveal = () => {
    if (!video.controls) video.controls = true;
    if (idle != null) clearTimeout(idle);
    idle = setTimeout(hide, VIDEO_CONTROLS_IDLE_MS);
  };
  video.addEventListener("pointerenter", reveal, { signal });
  video.addEventListener("pointermove", reveal, { signal });
  video.addEventListener("pointerleave", hide, { signal });
  // Stop the idle timer once the frame is retired so it can't fire afterwards.
  signal.addEventListener("abort", hide, { once: true });
}

/** @param {string} url HTTPS + a reddit host (the only companion-audio source). */
function isSafeAudioUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname.endsWith(".redd.it");
  } catch {
    return false;
  }
}

/**
 * Play a v.redd.it clip's separate audio track from a companion `<audio>`
 * synced to the silent fallback `<video>` (ADR 0018). The audio purely follows
 * the video's events (play/pause/seek/rate/mute), so the existing play & mute
 * controls drive it unchanged; a small drift correction keeps them aligned.
 * Bound to the render's AbortSignal, so it stops the moment the frame is retired.
 *
 * @param {HTMLVideoElement} video
 * @param {string} audioUrl
 * @param {HTMLElement} frame
 * @param {Document} doc
 * @param {AbortSignal} signal
 */
function attachSyncedAudio(video, audioUrl, frame, doc, signal) {
  if (!isSafeAudioUrl(audioUrl)) return;
  const audio = doc.createElement("audio");
  audio.preload = "auto";
  audio.muted = video.muted;
  audio.src = audioUrl;
  frame.append(audio);
  const resync = () => {
    if (Math.abs(audio.currentTime - video.currentTime) > 0.3) {
      audio.currentTime = video.currentTime;
    }
  };
  const play = () => {
    resync();
    audio.play?.().catch(() => {});
  };
  video.addEventListener("play", play, { signal });
  video.addEventListener("pause", () => audio.pause?.(), { signal });
  video.addEventListener(
    "seeking",
    () => {
      audio.currentTime = video.currentTime;
    },
    { signal },
  );
  video.addEventListener(
    "ratechange",
    () => {
      audio.playbackRate = video.playbackRate;
    },
    { signal },
  );
  // The video carries the mute state (it's silent, but its muted flag tracks the
  // slideshow); mirror it so the slideshow's mute toggle reaches the audio.
  video.addEventListener(
    "volumechange",
    () => {
      audio.muted = video.muted;
    },
    { signal },
  );
  video.addEventListener("timeupdate", resync, { signal });
  signal.addEventListener(
    "abort",
    () => {
      audio.pause?.();
      audio.removeAttribute("src");
    },
    { once: true },
  );
  // Attached to an already-playing video (resolved live): start the audio now,
  // since its `play` event already fired.
  if (!video.paused) play();
}

/**
 * @param {Document} doc
 * @param {keyof typeof ICONS} name
 * @param {string} label
 * @param {() => void} onClick
 */
function controlButton(doc, name, label, onClick) {
  const button = doc.createElement("button");
  button.type = "button";
  button.className = "rs-btn";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.append(buildIcon(doc, name));
  button.addEventListener("click", (event) => {
    // A handled control click must not reach the backdrop-close handler.
    event.stopPropagation();
    onClick();
  });
  return button;
}

/**
 * @param {HTMLButtonElement} button
 * @param {keyof typeof ICONS} name
 * @param {Document} doc
 */
function setIcon(button, name, doc) {
  button.replaceChildren(buildIcon(doc, name));
}

/**
 * @param {Document} doc
 * @param {keyof typeof ICONS} name
 */
function buildIcon(doc, name) {
  const def = ICONS[name];
  const svg = doc.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "rs-icon");
  const addPath = (/** @type {string} */ d, /** @type {boolean} */ stroke) => {
    const path = doc.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    if (stroke) path.setAttribute("class", "rs-stroke");
    svg.append(path);
  };
  for (const d of def.paths ?? []) addPath(d, false);
  for (const d of def.strokePaths ?? []) addPath(d, true);
  return svg;
}

/**
 * @param {Document} doc
 * @param {string} tag
 * @param {Record<string, string | number>} attrs
 */
function svgEl(doc, tag, attrs) {
  const el = doc.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/**
 * The extension mark (mirrors public/icon.svg), built inline so the loading
 * splash needs no web-accessible image.
 * @param {Document} doc
 */
function buildLogoMark(doc) {
  const svg = svgEl(doc, "svg", {
    viewBox: "0 0 128 128",
    "aria-hidden": "true",
    class: "rs-logo__mark",
  });
  const defs = doc.createElementNS(SVG_NS, "defs");
  // Page-unique gradient ids so they can't collide with the host document.
  const bg = svgEl(doc, "linearGradient", {
    id: "rs-logo-bg",
    x1: 0,
    y1: 0,
    x2: 0,
    y2: 1,
  });
  bg.append(
    svgEl(doc, "stop", { offset: 0, "stop-color": "#1b2331" }),
    svgEl(doc, "stop", { offset: 1, "stop-color": "#0b0d12" }),
  );
  const card = svgEl(doc, "linearGradient", {
    id: "rs-logo-card",
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 1,
  });
  card.append(
    svgEl(doc, "stop", { offset: 0, "stop-color": "#ffb066" }),
    svgEl(doc, "stop", { offset: 1, "stop-color": "#ff6a00" }),
  );
  defs.append(bg, card);
  svg.append(
    defs,
    svgEl(doc, "rect", {
      x: 4,
      y: 4,
      width: 120,
      height: 120,
      rx: 28,
      fill: "url(#rs-logo-bg)",
      stroke: "#2a3340",
      "stroke-width": 2,
    }),
    svgEl(doc, "rect", {
      x: 42,
      y: 30,
      width: 56,
      height: 62,
      rx: 9,
      fill: "#ffffff",
      opacity: 0.13,
      transform: "rotate(10 64 64)",
    }),
  );
  const front = svgEl(doc, "g", { transform: "rotate(-6 64 64)" });
  front.append(
    svgEl(doc, "rect", {
      x: 33,
      y: 34,
      width: 62,
      height: 60,
      rx: 11,
      fill: "url(#rs-logo-card)",
    }),
  );
  const perfs = svgEl(doc, "g", { fill: "#0b0d12", opacity: 0.5 });
  for (const y of [42, 60, 78]) {
    perfs.append(svgEl(doc, "rect", { x: 37, y, width: 6, height: 8, rx: 2 }));
  }
  front.append(
    perfs,
    svgEl(doc, "circle", {
      cx: 78,
      cy: 51,
      r: 8,
      fill: "#0b0d12",
      opacity: 0.82,
    }),
    svgEl(doc, "path", {
      d: "M52 87 L66 66 L75 77 L83 69 L93 87 Z",
      fill: "#0b0d12",
      opacity: 0.82,
    }),
  );
  svg.append(front);
  return svg;
}

/**
 * The mark plus the wordmark and a subtitle, for the loading splash.
 * @param {Document} doc
 * @param {string} subtitle
 */
function buildLogo(doc, subtitle) {
  const wrap = doc.createElement("div");
  wrap.className = "rs-logo";
  const name = doc.createElement("p");
  name.className = "rs-logo__name";
  // "Spectacular!" is an inline SVG outline (traced from Monoton) rather than
  // webfont text, so the neon mark renders in the page context regardless of
  // font-loading or the page CSP; the rest stays in the UI sans.
  const neon = doc.createElementNS(SVG_NS, "svg");
  neon.setAttribute("class", "rs-logo__neon");
  neon.setAttribute("viewBox", SPECTACULAR_VIEWBOX);
  neon.setAttribute("role", "img");
  neon.setAttribute("aria-label", "Spectacular!");
  const neonPath = doc.createElementNS(SVG_NS, "path");
  neonPath.setAttribute("d", SPECTACULAR_PATH);
  neonPath.setAttribute("fill", "currentColor");
  neon.append(neonPath);
  name.append(doc.createTextNode("Reddit Slideshow "), neon);
  const sub = doc.createElement("p");
  sub.className = "rs-logo__sub";
  sub.textContent = subtitle;
  wrap.append(buildLogoMark(doc), name, sub);
  return wrap;
}

import { t } from "./i18n.js";
import { fillTemplate } from "./i18n-dom.js";

/**
 * In-overlay keyboard-shortcuts help panel: a static list of every shortcut the
 * slideshow handles, so users can discover them without leaving the show.
 * Toggled by the (?) control in overlay-ui.js; mirrors the settings panel
 * (centered card, header + close button), so the same idle/dismiss/backdrop
 * plumbing applies.
 *
 * @param {Document} doc
 * @returns {{ root: HTMLElement }}
 */
export function createHelpPanel(doc) {
  const root = doc.createElement("div");
  root.className = "rs-help-panel";
  root.hidden = true;
  root.setAttribute("role", "region");
  root.setAttribute("aria-label", t("helpAriaLabel"));

  const header = doc.createElement("div");
  header.className = "rs-help-panel__header";
  const heading = doc.createElement("p");
  heading.className = "rs-help-panel__title";
  heading.textContent = t("helpTitle");
  const closeBtn = doc.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "rs-help-panel__close";
  closeBtn.setAttribute("aria-label", t("helpClose"));
  closeBtn.textContent = "×";
  closeBtn.addEventListener("click", () => {
    root.hidden = true;
  });
  header.append(heading, closeBtn);

  const intro = doc.createElement("p");
  intro.className = "rs-help-panel__intro";
  intro.append(
    fillTemplate(doc, t("helpIntro"), {
      brand: em(doc, "Reddit Slideshow Spectacular!"),
    }),
  );

  const list = doc.createElement("div");
  list.className = "rs-help-panel__list";
  for (const { chords, descKey } of SHORTCUTS) {
    list.append(shortcutRow(doc, chords, t(descKey)));
  }

  root.append(header, intro, list, aboutFooter(doc));
  return { root };
}

/**
 * @param {Document} doc
 * @param {string} text
 */
function em(doc, text) {
  const el = doc.createElement("em");
  el.textContent = text;
  return el;
}

/**
 * @param {Document} doc
 * @param {string} text
 * @param {string} href
 */
function link(doc, text, href) {
  const a = doc.createElement("a");
  a.className = "rs-help-panel__link";
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.textContent = text;
  return a;
}

// About / donation footer: nudge toward sponsoring without leaving the show.
/**
 * @param {Document} doc
 */
function aboutFooter(doc) {
  const about = doc.createElement("p");
  about.className = "rs-help-panel__about";
  about.append(
    fillTemplate(doc, t("helpAbout"), {
      brand: em(doc, "Reddit Slideshow Spectacular!"),
      openSource: link(
        doc,
        t("helpAboutOpenSourceLink"),
        "https://github.com/Rio517/reddit-slideshow-spectacular",
      ),
      donation: link(
        doc,
        t("helpAboutDonationLink"),
        "https://github.com/sponsors/Rio517",
      ),
    }),
  );
  return about;
}

// Every shortcut the slideshow handles. `chords` is a list of alternatives;
// each alternative is a chord of one or more keys (rendered joined with +).
// Keep in sync with the keydown handler in session.js and the manifest launch
// command in wxt.config.ts.
/** @type {Array<{ chords: string[][], descKey: string }>} */
const SHORTCUTS = [
  { chords: [["Alt", "Shift", "S"]], descKey: "helpShortcutLaunch" },
  { chords: [["←"], ["→"]], descKey: "helpShortcutPrevNext" },
  { chords: [["Shift", "→"]], descKey: "helpShortcutNextPost" },
  { chords: [["Page Up"], ["Page Down"]], descKey: "helpShortcutJump" },
  { chords: [["↑"], ["↓"]], descKey: "helpShortcutVote" },
  { chords: [["Space"]], descKey: "helpShortcutPlayPause" },
  { chords: [["M"]], descKey: "helpShortcutMute" },
  { chords: [["F"]], descKey: "helpShortcutFullscreen" },
  { chords: [["D"]], descKey: "helpShortcutDownload" },
  { chords: [["I"]], descKey: "helpShortcutBlock" },
  { chords: [["A"]], descKey: "helpShortcutFriend" },
  { chords: [["+"], ["−"]], descKey: "helpShortcutZoom" },
  { chords: [["?"]], descKey: "helpShortcutHelp" },
  { chords: [["Esc"]], descKey: "helpShortcutEscape" },
];

/**
 * @param {Document} doc
 * @param {string[][]} chords Alternatives; each is a chord of keys.
 * @param {string} desc
 */
function shortcutRow(doc, chords, desc) {
  const row = doc.createElement("div");
  row.className = "rs-help-panel__row";

  const keys = doc.createElement("span");
  keys.className = "rs-help-panel__keys";
  chords.forEach((chord, ci) => {
    if (ci > 0) keys.append(sep(doc, "/"));
    chord.forEach((k, ki) => {
      if (ki > 0) keys.append(sep(doc, "+"));
      const kbd = doc.createElement("kbd");
      kbd.className = "rs-help-panel__key";
      kbd.textContent = k;
      keys.append(kbd);
    });
  });

  const description = doc.createElement("span");
  description.className = "rs-help-panel__desc";
  description.textContent = desc;

  row.append(keys, description);
  return row;
}

/**
 * @param {Document} doc
 * @param {string} text
 */
function sep(doc, text) {
  const span = doc.createElement("span");
  span.className = "rs-help-panel__sep";
  span.setAttribute("aria-hidden", "true");
  span.textContent = text;
  return span;
}

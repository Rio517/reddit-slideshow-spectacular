import {
  IMAGE_TIMER_STOPS,
  imageTimerStopIndex,
  imageTimerStopSeconds,
  formatImageTimer,
} from "./settings.js";
import { t } from "./i18n.js";

/**
 * The in-overlay settings panel: the most-used preferences, controllable
 * without leaving the slideshow. Each change emits a partial-settings patch;
 * the session persists it and applies it live. The full options page (for the
 * permission-gated content dedup) is one click away.
 *
 * @param {Document} doc
 * @param {{
 *   onChange: (patch: Record<string, unknown>, event?: Event) => void,
 *   onOpenFullPreferences: (event?: MouseEvent) => void,
 * }} handlers
 * @returns {{ root: HTMLElement, setValues: (s: import("./settings.js").Settings) => void }}
 */
export function createSettingsPanel(doc, handlers) {
  const root = doc.createElement("div");
  root.className = "rs-settings-panel";
  root.hidden = true;

  const header = doc.createElement("div");
  header.className = "rs-settings-panel__header";
  const heading = doc.createElement("p");
  heading.className = "rs-settings-panel__title";
  heading.textContent = t("settingsTitle");
  const closeBtn = doc.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "rs-settings-panel__close";
  closeBtn.setAttribute("aria-label", t("settingsClose"));
  closeBtn.textContent = "×";
  closeBtn.addEventListener("click", () => {
    root.hidden = true;
  });
  header.append(heading, closeBtn);
  root.append(header);

  const timer = /** @type {HTMLInputElement} */ (doc.createElement("input"));
  timer.type = "range";
  // Non-linear: the slider is an index into IMAGE_TIMER_STOPS (1s steps low,
  // coarsening to the 5-minute max), so the displayed/persisted value is the stop.
  timer.min = "0";
  timer.max = String(IMAGE_TIMER_STOPS.length - 1);
  timer.className = "rs-set__range";
  const timerOut = doc.createElement("output");
  timerOut.className = "rs-set__out";
  timer.addEventListener("input", () => {
    timerOut.textContent = formatImageTimer(imageTimerStopSeconds(timer.value));
  });
  timer.addEventListener("change", (event) =>
    handlers.onChange(
      {
        imageTimerSeconds: imageTimerStopSeconds(timer.value),
      },
      event,
    ),
  );
  const timerWrap = doc.createElement("span");
  timerWrap.className = "rs-set__rangewrap";
  timerWrap.append(timer, timerOut);
  root.append(field(doc, t("settingsTimer"), timerWrap));

  const timerBar = radioGroup(
    doc,
    "rs-timerbar",
    [
      ["none", t("settingsTimerBarNone")],
      ["video", t("settingsTimerBarVideo")],
      ["all", t("settingsTimerBarAll")],
    ],
    (v, event) => handlers.onChange({ timerBar: v }, event),
    t("settingsTimerBarGroup"),
  );
  root.append(field(doc, t("settingsTimerBar"), timerBar.control));

  const autoplay = checkbox(doc, t("settingsAutoplay"), (v, event) =>
    handlers.onChange({ autoplay: v }, event),
  );
  const startMuted = checkbox(doc, t("settingsStartMuted"), (v, event) =>
    handlers.onChange({ startMuted: v }, event),
  );
  const includeNsfw = checkbox(doc, t("settingsIncludeNsfw"), (v, event) =>
    handlers.onChange({ includeNsfw: v }, event),
  );
  const dedupe = checkbox(doc, t("settingsDedupe"), (v, event) =>
    handlers.onChange({ dedupe: v }, event),
  );
  const panZoom = checkbox(doc, t("settingsPanZoom"), (v, event) =>
    handlers.onChange({ panZoom: v }, event),
  );
  const alwaysShowCount = checkbox(
    doc,
    t("settingsAlwaysShowCount"),
    (v, event) => handlers.onChange({ alwaysShowCount: v }, event),
  );
  const alwaysShowMeta = checkbox(
    doc,
    t("settingsAlwaysShowMeta"),
    (v, event) => handlers.onChange({ alwaysShowMeta: v }, event),
  );
  root.append(
    autoplay.row,
    startMuted.row,
    includeNsfw.row,
    dedupe.row,
    panZoom.row,
    alwaysShowCount.row,
    alwaysShowMeta.row,
  );

  const more = doc.createElement("button");
  more.type = "button";
  more.className = "rs-settings-panel__more";
  more.textContent = t("settingsFullPreferences");
  more.addEventListener("click", (event) =>
    handlers.onOpenFullPreferences(event),
  );
  root.append(more);

  /** @param {import("./settings.js").Settings} s */
  function setValues(s) {
    // applyLiveSettings re-populates the panel after every change (the panel's
    // own change, plus the async storage echo). Don't move the slider thumb
    // while the user is holding it, or it bounces back to the stored value
    // mid-drag - the one bug the options page avoids by never writing its slider.
    const rootNode = /** @type {Document | ShadowRoot} */ (timer.getRootNode());
    if (rootNode.activeElement !== timer) {
      timer.value = String(imageTimerStopIndex(s.imageTimerSeconds));
    }
    timerOut.textContent = formatImageTimer(s.imageTimerSeconds);
    timerBar.setValue(s.timerBar);
    autoplay.input.checked = s.autoplay;
    startMuted.input.checked = s.startMuted;
    includeNsfw.input.checked = s.includeNsfw;
    dedupe.input.checked = s.dedupe;
    panZoom.input.checked = s.panZoom;
    alwaysShowCount.input.checked = s.alwaysShowCount;
    alwaysShowMeta.input.checked = s.alwaysShowMeta;
  }

  return { root, setValues };
}

/**
 * @param {Document} doc
 * @param {string} label
 * @param {HTMLElement} control
 */
function field(doc, label, control) {
  const row = doc.createElement("label");
  row.className = "rs-set__field";
  const span = doc.createElement("span");
  span.className = "rs-set__label";
  span.textContent = label;
  row.append(span, control);
  return row;
}

/**
 * A horizontal radio group emitting the selected value on change.
 * @param {Document} doc
 * @param {string} name
 * @param {Array<[string, string]>} options [value, label] pairs.
 * @param {(value: string, event?: Event) => void} onChange
 * @param {string} [label] Accessible group label.
 */
function radioGroup(doc, name, options, onChange, label) {
  const control = doc.createElement("div");
  control.className = "rs-set__radio";
  control.setAttribute("role", "radiogroup");
  if (label) control.setAttribute("aria-label", label);
  /** @type {HTMLInputElement[]} */
  const inputs = [];
  for (const [value, label] of options) {
    const wrap = doc.createElement("label");
    wrap.className = "rs-set__radio-opt";
    const input = /** @type {HTMLInputElement} */ (doc.createElement("input"));
    input.type = "radio";
    input.name = name;
    input.value = value;
    input.addEventListener("change", (event) => {
      if (input.checked) onChange(value, event);
    });
    const span = doc.createElement("span");
    span.textContent = label;
    wrap.append(input, span);
    control.append(wrap);
    inputs.push(input);
  }
  return {
    control,
    /** @param {string} value */
    setValue(value) {
      for (const input of inputs) input.checked = input.value === value;
    },
  };
}

/**
 * @param {Document} doc
 * @param {string} label
 * @param {(value: boolean, event?: Event) => void} onToggle
 */
function checkbox(doc, label, onToggle) {
  const row = doc.createElement("label");
  row.className = "rs-set__check";
  const input = /** @type {HTMLInputElement} */ (doc.createElement("input"));
  input.type = "checkbox";
  input.addEventListener("change", (event) => onToggle(input.checked, event));
  const span = doc.createElement("span");
  span.textContent = label;
  // Toggle first, label after.
  row.append(input, span);
  return { row, input };
}

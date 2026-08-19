import {
  getSettings,
  saveSettings,
  imageTimerStopIndex,
  imageTimerStopSeconds,
  formatImageTimer,
} from "@/lib/settings.js";
import { requiredElement } from "@/lib/dom.js";
import { t, resolveLocale } from "@/lib/i18n.js";
import { localizeDocument, fillTemplate } from "@/lib/i18n-dom.js";
import { initShortcutSection } from "@/lib/shortcut-section.js";

const uiLang = browser.i18n.getUILanguage();

/**
 * Apply a resolved locale to the page: strings, direction, and the footer.
 * @param {string} locale
 */
function relocalize(locale) {
  localizeDocument(document, locale);
  // Footer sentence: one translatable message with a {brand} marker; the brand
  // stays a literal <em> so translators reorder around it without editing markup.
  const footerText = document.querySelector("#footerText");
  if (footerText) {
    const brand = document.createElement("em");
    brand.textContent = "Reddit Slideshow Spectacular!";
    footerText.replaceChildren(
      fillTemplate(document, t("optFooter"), { brand }),
    );
  }
  refreshPanZoomOutputs();
}

const timerSlider = requiredElement("#imageTimerSeconds", HTMLInputElement);
const timerValue = requiredElement("#timerValue", HTMLOutputElement);
const autoplay = requiredElement("#autoplay", HTMLInputElement);
const startMuted = requiredElement("#startMuted", HTMLInputElement);
const includeNsfw = requiredElement("#includeNsfw", HTMLInputElement);
const dedupe = requiredElement("#dedupe", HTMLInputElement);
const alwaysShowMeta = requiredElement("#alwaysShowMeta", HTMLInputElement);
const alwaysShowCount = requiredElement("#alwaysShowCount", HTMLInputElement);
const maxLoadWait = requiredElement("#maxLoadWaitSeconds", HTMLInputElement);
const maxLoadWaitValue = requiredElement(
  "#maxLoadWaitValue",
  HTMLOutputElement,
);
const transition = requiredElement("#transition", HTMLSelectElement);
const locale = requiredElement("#locale", HTMLSelectElement);
const timerBarRadios = /** @type {NodeListOf<HTMLInputElement>} */ (
  document.querySelectorAll('input[name="timerBar"]')
);
const timerBarValue = () =>
  [...timerBarRadios].find((r) => r.checked)?.value ?? "video";
const contentDedup = requiredElement("#contentDedup", HTMLInputElement);
const downloadSubfolder = requiredElement(
  "#downloadSubfolder",
  HTMLInputElement,
);
const panZoom = requiredElement("#panZoom", HTMLInputElement);
const panZoomCard = requiredElement("#panZoomCard", HTMLElement);

/** Pan-zoom range inputs paired with their <output> id. */
const PAN_ZOOM_RANGES = [
  ["panZoomMinOversize", "panZoomMinOversizeValue"],
  ["panZoomScale", "panZoomScaleValue"],
  ["panZoomShowSeconds", "panZoomShowValue"],
  ["panZoomZoomInSeconds", "panZoomZoomInValue"],
  ["panZoomPanSeconds", "panZoomPanValue"],
  ["panZoomZoomOutSeconds", "panZoomZoomOutValue"],
  ["panZoomShowEndSeconds", "panZoomShowEndValue"],
];

function syncPanZoomEnabled() {
  panZoomCard.dataset.off = String(!panZoom.checked);
}
const panZoomInputs = Object.fromEntries(
  PAN_ZOOM_RANGES.map(([id]) => [
    id,
    requiredElement(`#${id}`, HTMLInputElement),
  ]),
);

/**
 * Display text for a pan-zoom range value. Only the oversize threshold is
 * special: at its 1× minimum it reads "All images" - pan & zoom every image,
 * not just oversized ones. (The "×" lives in the output, not static markup.)
 * @param {string} id
 * @param {string} value
 */
function panZoomOutText(id, value) {
  if (id === "panZoomMinOversize") {
    return Number(value) <= 1 ? t("optPanZoomAllImages") : `${value}×`;
  }
  return value;
}

/** Set every pan-zoom <output> from its current slider value (locale-aware). */
function refreshPanZoomOutputs() {
  for (const [id, outId] of PAN_ZOOM_RANGES) {
    const out = document.querySelector(`#${outId}`);
    if (out) out.textContent = panZoomOutText(id, panZoomInputs[id].value);
  }
}

// Immediate best-guess; load() re-applies the stored choice.
relocalize(resolveLocale("auto", uiLang));

async function load() {
  const settings = await getSettings();
  locale.value = settings.locale;
  relocalize(resolveLocale(settings.locale, uiLang));
  timerSlider.value = String(imageTimerStopIndex(settings.imageTimerSeconds));
  timerValue.textContent = formatImageTimer(settings.imageTimerSeconds);
  autoplay.checked = settings.autoplay;
  startMuted.checked = settings.startMuted;
  includeNsfw.checked = settings.includeNsfw;
  dedupe.checked = settings.dedupe;
  alwaysShowMeta.checked = settings.alwaysShowMeta;
  alwaysShowCount.checked = settings.alwaysShowCount;
  maxLoadWait.value = String(settings.maxLoadWaitSeconds);
  maxLoadWaitValue.textContent = String(settings.maxLoadWaitSeconds);
  transition.value = settings.transition;
  for (const radio of timerBarRadios) {
    radio.checked = radio.value === settings.timerBar;
  }
  contentDedup.checked = settings.contentDedup;
  downloadSubfolder.value = settings.downloadSubfolder;
  panZoom.checked = settings.panZoom;
  for (const [id] of PAN_ZOOM_RANGES) {
    panZoomInputs[id].value = String(/** @type {any} */ (settings)[id]);
  }
  refreshPanZoomOutputs();
  syncPanZoomEnabled();
}

async function persist() {
  try {
    await saveSettings({
      imageTimerSeconds: imageTimerStopSeconds(timerSlider.value),
      autoplay: autoplay.checked,
      startMuted: startMuted.checked,
      includeNsfw: includeNsfw.checked,
      dedupe: dedupe.checked,
      alwaysShowMeta: alwaysShowMeta.checked,
      alwaysShowCount: alwaysShowCount.checked,
      maxLoadWaitSeconds: Number(maxLoadWait.value),
      transition: transition.value,
      timerBar: timerBarValue(),
      contentDedup: contentDedup.checked,
      downloadSubfolder: downloadSubfolder.value,
      panZoom: panZoom.checked,
      panZoomMinOversize: Number(panZoomInputs.panZoomMinOversize.value),
      panZoomScale: Number(panZoomInputs.panZoomScale.value),
      panZoomShowSeconds: Number(panZoomInputs.panZoomShowSeconds.value),
      panZoomZoomInSeconds: Number(panZoomInputs.panZoomZoomInSeconds.value),
      panZoomPanSeconds: Number(panZoomInputs.panZoomPanSeconds.value),
      panZoomZoomOutSeconds: Number(panZoomInputs.panZoomZoomOutSeconds.value),
      panZoomShowEndSeconds: Number(panZoomInputs.panZoomShowEndSeconds.value),
    });
  } catch {
    // Used as a change listener; a failed settings write isn't actionable here.
  }
}

timerSlider.addEventListener("input", () => {
  timerValue.textContent = formatImageTimer(
    imageTimerStopSeconds(timerSlider.value),
  );
});
timerSlider.addEventListener("change", persist);
autoplay.addEventListener("change", persist);
startMuted.addEventListener("change", persist);
includeNsfw.addEventListener("change", persist);
dedupe.addEventListener("change", persist);
alwaysShowMeta.addEventListener("change", persist);
alwaysShowCount.addEventListener("change", persist);
maxLoadWait.addEventListener("input", () => {
  maxLoadWaitValue.textContent = maxLoadWait.value;
});
maxLoadWait.addEventListener("change", persist);
transition.addEventListener("change", persist);
// locale stays out of persist(): it's saved here and applied live.
locale.addEventListener("change", async () => {
  try {
    await saveSettings({ locale: locale.value });
  } catch {
    // change listener; a failed write isn't actionable here
  }
  relocalize(resolveLocale(locale.value, uiLang));
});
for (const radio of timerBarRadios) radio.addEventListener("change", persist);
panZoom.addEventListener("change", () => {
  syncPanZoomEnabled();
  persist();
});

for (const [id, outId] of PAN_ZOOM_RANGES) {
  const input = panZoomInputs[id];
  const out = document.querySelector(`#${outId}`);
  input.addEventListener("input", () => {
    if (out) out.textContent = panZoomOutText(id, input.value);
  });
  input.addEventListener("change", persist);
}

contentDedup.addEventListener("change", persist);

// Reflect the sanitized value back (e.g. stripped "../" or trailing slashes),
// so the field always shows what will actually be used.
downloadSubfolder.addEventListener("change", async () => {
  await persist();
  downloadSubfolder.value = (await getSettings()).downloadSubfolder;
});

load();

initShortcutSection({
  doc: document,
  commands: browser.commands,
  openShortcutsPage: () => {
    browser.tabs.create({ url: "chrome://extensions/shortcuts" });
  },
  mac: navigator.platform.toUpperCase().includes("MAC"),
});

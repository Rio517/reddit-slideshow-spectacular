import { afterEach, describe, expect, it, vi } from "vitest";
import { createSettingsPanel } from "../../lib/overlay-settings.js";
import {
  imageTimerStopIndex,
  imageTimerStopSeconds,
} from "../../lib/settings.js";

afterEach(() => {
  document.body.innerHTML = "";
});

const SETTINGS = {
  imageTimerSeconds: 8,
  startMuted: false,
  autoplay: false,
  includeNsfw: false,
  dedupe: false,
  contentDedup: false,
  alwaysShowCount: false,
  alwaysShowMeta: false,
  maxLoadWaitSeconds: 10,
  timerBar: "video",
  panZoom: false,
};

function make() {
  const onChange = vi.fn();
  const onOpenFullPreferences = vi.fn();
  const panel = createSettingsPanel(document, {
    onChange,
    onOpenFullPreferences,
  });
  document.body.append(panel.root);
  return { panel, onChange, onOpenFullPreferences };
}

describe("createSettingsPanel", () => {
  it("populates controls from settings via setValues", () => {
    const { panel } = make();
    panel.setValues(/** @type {any} */ (SETTINGS));
    const range = /** @type {HTMLInputElement} */ (
      document.querySelector(".rs-set__range")
    );
    const checks = /** @type {NodeListOf<HTMLInputElement>} */ (
      document.querySelectorAll(".rs-set__check input")
    );
    // The range is an index into the non-linear stops; 8s -> its stop index.
    expect(range.value).toBe(String(imageTimerStopIndex(8)));
    // Max load wait now lives only in the full options page.
    expect(document.querySelector(".rs-set__select")).toBeNull();
    // autoplay, start-muted, NSFW, dedupe, pan-zoom, always-show-count, always-show-meta - all false here
    expect([...checks].map((c) => c.checked)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it("keeps the timer slider put while it's focused (no bounce mid-drag)", () => {
    const { panel } = make();
    const range = /** @type {HTMLInputElement} */ (
      document.querySelector(".rs-set__range")
    );
    // User dragged to a high stop and is still holding the thumb.
    range.value = "18";
    range.focus();
    // applyLiveSettings re-populates with the stored value - must not move it.
    panel.setValues(/** @type {any} */ ({ ...SETTINGS, imageTimerSeconds: 5 }));
    expect(range.value).toBe("18");
    // Once it's not focused, setValues repositions it.
    range.blur();
    panel.setValues(/** @type {any} */ ({ ...SETTINGS, imageTimerSeconds: 5 }));
    expect(range.value).toBe(String(imageTimerStopIndex(5)));
  });

  it("emits a patch when the timer changes", () => {
    const { onChange } = make();
    const range = /** @type {HTMLInputElement} */ (
      document.querySelector(".rs-set__range")
    );
    // Move to a stop index; the panel emits that stop's seconds.
    range.value = "10";
    range.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onChange).toHaveBeenCalledWith({
      imageTimerSeconds: imageTimerStopSeconds(10),
    });
  });

  it("reflects and emits the timer-bar radio", () => {
    const { panel, onChange } = make();
    panel.setValues(/** @type {any} */ (SETTINGS));
    const video = /** @type {HTMLInputElement} */ (
      document.querySelector('.rs-set__radio input[value="video"]')
    );
    expect(video.checked).toBe(true);
    const all = /** @type {HTMLInputElement} */ (
      document.querySelector('.rs-set__radio input[value="all"]')
    );
    all.checked = true;
    all.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onChange).toHaveBeenCalledWith({ timerBar: "all" });
  });

  it("emits a boolean patch when a checkbox toggles", () => {
    const { panel, onChange } = make();
    panel.setValues(/** @type {any} */ (SETTINGS));
    const autoplay = /** @type {HTMLInputElement} */ (
      document.querySelectorAll(".rs-set__check input")[0]
    );
    autoplay.checked = true;
    autoplay.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onChange).toHaveBeenCalledWith({ autoplay: true });
  });

  it("reflects alwaysShowCount and emits its patch on toggle", () => {
    const { panel, onChange } = make();
    panel.setValues(
      /** @type {any} */ ({ ...SETTINGS, alwaysShowCount: true }),
    );
    // Checkbox rows are `.rs-set__check`; label text lives in the span child.
    // After the i18n task the English label is "Always show the count & skips"
    // - the only one containing "count".
    const row = [...document.querySelectorAll(".rs-set__check")].find((r) =>
      /count/i.test(r.querySelector("span")?.textContent ?? ""),
    );
    const box = /** @type {HTMLInputElement} */ (row?.querySelector("input"));
    expect(box.checked).toBe(true);
    box.checked = false;
    box.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onChange).toHaveBeenCalledWith({ alwaysShowCount: false });
  });

  it("labels the timer-bar radios as a radiogroup", () => {
    make();
    const group = /** @type {HTMLElement | null} */ (
      document.querySelector(".rs-set__radio")
    );
    expect(group?.getAttribute("role")).toBe("radiogroup");
    expect(group?.getAttribute("aria-label")).toBe("Top timer bar");
  });

  it("opens the full preferences page", () => {
    const { onOpenFullPreferences } = make();
    /** @type {HTMLElement} */ (
      document.querySelector(".rs-settings-panel__more")
    ).click();
    expect(onOpenFullPreferences).toHaveBeenCalledTimes(1);
  });
});

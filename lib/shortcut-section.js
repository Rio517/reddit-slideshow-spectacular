import { requiredElement } from "@/lib/dom.js";
import { t } from "@/lib/i18n.js";
import { COMMAND_NAME, eventToShortcut } from "@/lib/shortcut.js";

/**
 * Wire the options-page "Slideshow shortcut" card.
 *
 * The binding lives in the browser's command system (the single source of
 * truth) - this reads it via commands.getAll() and never stores a copy.
 * Firefox exposes commands.update()/reset(), so it gets a recorder input;
 * Chrome doesn't, so it gets a button to the browser's own shortcuts page.
 *
 * @param {object} deps
 * @param {Document} deps.doc
 * @param {{ getAll(): Promise<{name?: string, shortcut?: string}[]>,
 *           update?: (detail: {name: string, shortcut: string}) => Promise<void>,
 *           reset?: (name: string) => Promise<void> }} deps.commands
 * @param {() => void} deps.openShortcutsPage
 * @param {boolean} deps.mac
 */
export async function initShortcutSection({
  doc,
  commands,
  openShortcutsPage,
  mac,
}) {
  const value = requiredElement("#shortcutValue", HTMLOutputElement, doc);
  const input = requiredElement("#shortcutInput", HTMLInputElement, doc);
  const reset = requiredElement("#shortcutReset", HTMLButtonElement, doc);
  const open = requiredElement("#shortcutOpen", HTMLButtonElement, doc);
  const hint = requiredElement("#shortcutHint", HTMLElement, doc);
  const error = requiredElement("#shortcutError", HTMLElement, doc);

  async function refresh() {
    const all = await commands.getAll();
    const shortcut = all.find((c) => c.name === COMMAND_NAME)?.shortcut;
    value.textContent = shortcut || t("optShortcutNotSet");
    input.value = shortcut || "";
  }

  /** Swap the editing controls for a message. @param {string} message */
  function guidanceOnly(message) {
    input.hidden = true;
    reset.hidden = true;
    hint.hidden = true;
    error.textContent = message;
  }

  await refresh();

  const update = commands.update;
  if (typeof update !== "function") {
    // Chrome: rebinding only happens on the browser's own shortcuts page.
    input.hidden = true;
    reset.hidden = true;
    hint.hidden = true;
    open.hidden = false;
    open.addEventListener("click", openShortcutsPage);
    return;
  }

  input.addEventListener("keydown", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") return input.blur();
    if (["Control", "Alt", "Shift", "Meta"].includes(event.key)) return;
    const shortcut = eventToShortcut(event, { mac });
    if (!shortcut) {
      error.textContent = t("optShortcutInvalid");
      return;
    }
    try {
      await update({ name: COMMAND_NAME, shortcut });
      error.textContent = "";
      input.blur();
      await refresh();
    } catch {
      guidanceOnly(t("optShortcutUpdateFailed"));
    }
  });

  reset.addEventListener("click", async () => {
    try {
      await commands.reset?.(COMMAND_NAME);
      error.textContent = "";
      await refresh();
    } catch {
      guidanceOnly(t("optShortcutUpdateFailed"));
    }
  });
}

/**
 * Commands-API shortcut strings ("Alt+Shift+S") from keyboard events.
 * Accepted shapes (MDN commands/shortcut-values): one primary modifier
 * (Ctrl/Alt, or Command/MacCtrl on mac) + optional Shift + one key, or a
 * bare F1-F12.
 */

export const COMMAND_NAME = "_execute_action";
export const DEFAULT_SHORTCUT = "Alt+Shift+S";

/** event.code → commands-API key name, for the keys that don't follow a pattern. */
const CODE_KEYS = new Map([
  ["Comma", "Comma"],
  ["Period", "Period"],
  ["Home", "Home"],
  ["End", "End"],
  ["PageUp", "PageUp"],
  ["PageDown", "PageDown"],
  ["Space", "Space"],
  ["Insert", "Insert"],
  ["Delete", "Delete"],
  ["ArrowUp", "Up"],
  ["ArrowDown", "Down"],
  ["ArrowLeft", "Left"],
  ["ArrowRight", "Right"],
]);

const FUNCTION_KEY = /^F([1-9]|1[0-2])$/;

/** @param {string} code */
function keyFromCode(code) {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (FUNCTION_KEY.test(code)) return code;
  return CODE_KEYS.get(code) ?? null;
}

/**
 * Map a keydown to a commands-API shortcut string, or null if the combo is
 * not one the API accepts.
 * @param {{ code: string, ctrlKey: boolean, altKey: boolean, shiftKey: boolean, metaKey: boolean }} event
 * @param {{ mac?: boolean }} [opts]
 * @returns {string | null}
 */
export function eventToShortcut(event, { mac = false } = {}) {
  const key = keyFromCode(event.code);
  if (!key) return null;
  if (event.metaKey && !mac) return null;
  const primaries = [];
  if (event.ctrlKey) primaries.push(mac ? "MacCtrl" : "Ctrl");
  if (event.altKey) primaries.push("Alt");
  if (event.metaKey) primaries.push("Command");
  if (primaries.length === 0) {
    return FUNCTION_KEY.test(key) && !event.shiftKey ? key : null;
  }
  if (primaries.length > 1) return null;
  return [primaries[0], ...(event.shiftKey ? ["Shift"] : []), key].join("+");
}

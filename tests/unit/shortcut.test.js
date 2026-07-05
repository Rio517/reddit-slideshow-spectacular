import { describe, expect, it } from "vitest";
import {
  COMMAND_NAME,
  DEFAULT_SHORTCUT,
  eventToShortcut,
} from "@/lib/shortcut.js";

/** Minimal keydown shape: code + modifier flags, all defaulting to false. */
const ev = (/** @type {string} */ code, /** @type {object} */ mods = {}) => ({
  code,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...mods,
});

describe("shortcut constants", () => {
  it("names the trigger command and its default", () => {
    expect(COMMAND_NAME).toBe("_execute_action");
    expect(DEFAULT_SHORTCUT).toBe("Alt+Shift+S");
  });
});

describe("eventToShortcut", () => {
  it("maps letter combos with one primary modifier", () => {
    expect(eventToShortcut(ev("KeyS", { altKey: true, shiftKey: true }))).toBe(
      "Alt+Shift+S",
    );
    expect(eventToShortcut(ev("KeyA", { ctrlKey: true }))).toBe("Ctrl+A");
  });

  it("maps digits, arrows, and named keys", () => {
    expect(eventToShortcut(ev("Digit1", { ctrlKey: true }))).toBe("Ctrl+1");
    expect(eventToShortcut(ev("ArrowUp", { altKey: true }))).toBe("Alt+Up");
    expect(eventToShortcut(ev("Comma", { altKey: true, shiftKey: true }))).toBe(
      "Alt+Shift+Comma",
    );
    expect(eventToShortcut(ev("PageDown", { ctrlKey: true }))).toBe(
      "Ctrl+PageDown",
    );
  });

  it("allows function keys bare, but not Shift+function-key", () => {
    expect(eventToShortcut(ev("F5"))).toBe("F5");
    expect(eventToShortcut(ev("F12", { ctrlKey: true }))).toBe("Ctrl+F12");
    expect(eventToShortcut(ev("F5", { shiftKey: true }))).toBeNull();
  });

  it("rejects combos without a primary modifier", () => {
    expect(eventToShortcut(ev("KeyS"))).toBeNull();
    expect(eventToShortcut(ev("KeyS", { shiftKey: true }))).toBeNull();
  });

  it("rejects two primary modifiers", () => {
    expect(
      eventToShortcut(ev("KeyS", { ctrlKey: true, altKey: true })),
    ).toBeNull();
  });

  it("rejects modifier-only and unmapped keys", () => {
    expect(eventToShortcut(ev("ShiftLeft", { shiftKey: true }))).toBeNull();
    expect(eventToShortcut(ev("Backquote", { ctrlKey: true }))).toBeNull();
  });

  it("maps mac modifiers to Command/MacCtrl; rejects the Windows key", () => {
    expect(eventToShortcut(ev("KeyS", { metaKey: true }), { mac: true })).toBe(
      "Command+S",
    );
    expect(eventToShortcut(ev("KeyS", { ctrlKey: true }), { mac: true })).toBe(
      "MacCtrl+S",
    );
    expect(eventToShortcut(ev("KeyS", { metaKey: true }))).toBeNull();
  });
});

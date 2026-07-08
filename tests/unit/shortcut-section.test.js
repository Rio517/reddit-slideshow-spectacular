import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { initShortcutSection } from "@/lib/shortcut-section.js";

const html = readFileSync(
  resolve(process.cwd(), "entrypoints/options/index.html"),
  "utf8",
);

const freshDoc = () => new DOMParser().parseFromString(html, "text/html");

/** browser.commands as Firefox exposes it (getAll + update + reset). */
function firefoxCommands(shortcut = "Alt+Shift+S") {
  return {
    getAll: vi.fn(async () => [{ name: "_execute_action", shortcut }]),
    update: vi.fn(async () => {}),
    reset: vi.fn(async () => {}),
  };
}

/**
 * @param {Partial<Parameters<typeof initShortcutSection>[0]>} [over]
 * @returns {Parameters<typeof initShortcutSection>[0]}
 */
const deps = (over = {}) =>
  /** @type {Parameters<typeof initShortcutSection>[0]} */ ({
    commands: firefoxCommands(),
    openShortcutsPage: vi.fn(),
    mac: false,
    ...over,
  });

/**
 * @param {HTMLElement} el
 * @param {KeyboardEventInit} init
 */
const press = (el, init) =>
  el.dispatchEvent(new KeyboardEvent("keydown", { cancelable: true, ...init }));

describe("initShortcutSection on Firefox (commands.update available)", () => {
  it("shows the current binding in the output and the recorder", async () => {
    const doc = freshDoc();
    await initShortcutSection(
      deps({ doc, commands: firefoxCommands("Ctrl+Period") }),
    );
    expect(doc.querySelector("#shortcutValue")?.textContent).toBe(
      "Ctrl+Period",
    );
    expect(
      /** @type {HTMLInputElement} */ (doc.querySelector("#shortcutInput"))
        .value,
    ).toBe("Ctrl+Period");
    expect(
      /** @type {HTMLButtonElement} */ (doc.querySelector("#shortcutOpen"))
        .hidden,
    ).toBe(true);
  });

  it("shows 'Not set' when the command has no binding", async () => {
    const doc = freshDoc();
    await initShortcutSection(deps({ doc, commands: firefoxCommands("") }));
    expect(doc.querySelector("#shortcutValue")?.textContent).toBe("Not set");
  });

  it("records a valid combo and updates the command", async () => {
    const doc = freshDoc();
    const commands = firefoxCommands();
    await initShortcutSection(deps({ doc, commands }));
    const input = /** @type {HTMLInputElement} */ (
      doc.querySelector("#shortcutInput")
    );
    press(input, { code: "KeyG", ctrlKey: true });
    await vi.waitFor(() =>
      expect(commands.update).toHaveBeenCalledWith({
        name: "_execute_action",
        shortcut: "Ctrl+G",
      }),
    );
    expect(doc.querySelector("#shortcutError")?.textContent).toBe("");
  });

  it("flags an invalid combo instead of updating", async () => {
    const doc = freshDoc();
    const commands = firefoxCommands();
    await initShortcutSection(deps({ doc, commands }));
    press(
      /** @type {HTMLInputElement} */ (doc.querySelector("#shortcutInput")),
      { code: "KeyG" },
    );
    await vi.waitFor(() =>
      expect(doc.querySelector("#shortcutError")?.textContent).not.toBe(""),
    );
    expect(commands.update).not.toHaveBeenCalled();
  });

  it("resets to the default binding", async () => {
    const doc = freshDoc();
    const commands = firefoxCommands();
    await initShortcutSection(deps({ doc, commands }));
    /** @type {HTMLButtonElement} */ (
      doc.querySelector("#shortcutReset")
    )?.click();
    await vi.waitFor(() =>
      expect(commands.reset).toHaveBeenCalledWith("_execute_action"),
    );
  });

  it("degrades to guidance-only when update() rejects", async () => {
    const doc = freshDoc();
    const commands = firefoxCommands();
    commands.update = vi.fn(async () => {
      throw new Error("nope");
    });
    await initShortcutSection(deps({ doc, commands }));
    press(
      /** @type {HTMLInputElement} */ (doc.querySelector("#shortcutInput")),
      { code: "KeyG", ctrlKey: true },
    );
    await vi.waitFor(() =>
      expect(
        /** @type {HTMLInputElement} */ (doc.querySelector("#shortcutInput"))
          .hidden,
      ).toBe(true),
    );
    expect(
      /** @type {HTMLButtonElement} */ (doc.querySelector("#shortcutReset"))
        .hidden,
    ).toBe(true);
    expect(doc.querySelector("#shortcutError")?.textContent).not.toBe("");
  });

  it("does not trap Tab: preventDefault is skipped and update is not called", async () => {
    const doc = freshDoc();
    const commands = firefoxCommands();
    await initShortcutSection(deps({ doc, commands }));
    const input = /** @type {HTMLInputElement} */ (
      doc.querySelector("#shortcutInput")
    );
    const notPrevented = press(input, { key: "Tab" });
    expect(notPrevented).toBe(true);
    expect(commands.update).not.toHaveBeenCalled();
  });

  it("re-reads the binding when the tab regains visibility", async () => {
    const doc = freshDoc();
    const commands = firefoxCommands("Alt+Shift+S");
    await initShortcutSection(deps({ doc, commands }));
    expect(doc.querySelector("#shortcutValue")?.textContent).toBe(
      "Alt+Shift+S",
    );
    commands.getAll = vi.fn(async () => [
      { name: "_execute_action", shortcut: "Ctrl+Period" },
    ]);
    doc.dispatchEvent(new Event("visibilitychange"));
    await vi.waitFor(() =>
      expect(doc.querySelector("#shortcutValue")?.textContent).toBe(
        "Ctrl+Period",
      ),
    );
  });
});

describe("initShortcutSection on Chrome (no commands.update)", () => {
  it("hides the recorder and opens the browser's shortcuts page instead", async () => {
    const doc = freshDoc();
    const openShortcutsPage = vi.fn();
    const commands = {
      getAll: vi.fn(async () => [
        { name: "_execute_action", shortcut: "Alt+Shift+S" },
      ]),
    };
    await initShortcutSection(deps({ doc, commands, openShortcutsPage }));
    expect(
      /** @type {HTMLInputElement} */ (doc.querySelector("#shortcutInput"))
        .hidden,
    ).toBe(true);
    expect(
      /** @type {HTMLButtonElement} */ (doc.querySelector("#shortcutReset"))
        .hidden,
    ).toBe(true);
    const open = /** @type {HTMLButtonElement} */ (
      doc.querySelector("#shortcutOpen")
    );
    expect(open?.hidden).toBe(false);
    open?.click();
    expect(openShortcutsPage).toHaveBeenCalledOnce();
  });

  it("re-reads the binding when the tab regains visibility (Chrome's primary rebind flow)", async () => {
    const doc = freshDoc();
    const commands = {
      getAll: vi.fn(async () => [
        { name: "_execute_action", shortcut: "Alt+Shift+S" },
      ]),
    };
    await initShortcutSection(
      deps({ doc, commands, openShortcutsPage: vi.fn() }),
    );
    expect(doc.querySelector("#shortcutValue")?.textContent).toBe(
      "Alt+Shift+S",
    );
    commands.getAll = vi.fn(async () => [
      { name: "_execute_action", shortcut: "Ctrl+Period" },
    ]);
    doc.dispatchEvent(new Event("visibilitychange"));
    await vi.waitFor(() =>
      expect(doc.querySelector("#shortcutValue")?.textContent).toBe(
        "Ctrl+Period",
      ),
    );
  });
});

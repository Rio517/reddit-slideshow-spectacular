# Configurable Trigger Shortcut + Lighter Meta Text Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the slideshow trigger shortcut (`_execute_action`, default `Alt+Shift+S`) user-configurable from the options page, and lighten the overlay's title + dimensions/source text to `#ddd`.

**Architecture:** The binding stays in the browser's command system — the options page reads it via `commands.getAll()` and never stores a copy. A pure module (`lib/shortcut.js`) turns keydown events into commands-API shortcut strings (returning `null` for combos the API rejects — validation is folded into the conversion, since the recorder is the only producer). A DOM module (`lib/shortcut-section.js`) wires the new options card with injected deps so it's unit-testable: Firefox (has `commands.update`) gets a recorder input + reset button; Chrome (no `update`) gets a button opening `chrome://extensions/shortcuts`; an `update()` rejection degrades to guidance-only. The CSS change is two color literals in `assets/overlay.css`.

**Tech Stack:** WXT MV3 WebExtension, vanilla JS with JSDoc types, Vitest (DOMParser-based page tests), catalog i18n in `locales/*.json` (six files, key-parity enforced by `tests/unit/i18n-catalog.test.js`, `npm run locales` regenerates `public/_locales/**`).

## Global Constraints

- Work directly on `main`; no branches or worktrees (AGENTS.md).
- One logical operation per Bash call — no `&&`/`;` chains.
- Commit messages end with the Co-Authored-By + Claude-Session trailer used in recent commits (`git log -3` shows the format).
- Comments: terse one-line "why" only; no hypotheticals; don't restate nearby comments.
- Every new user-facing string goes through the catalog i18n (`locales/<lang>.json`, all six of en/es/fr/de/it/ar), never hardcoded; `npm run locales` must be re-run after catalog edits or `i18n-catalog.test.js` fails.
- The command name is exactly `_execute_action`; the default shortcut is exactly `Alt+Shift+S`.
- Gate before declaring done: `npm run typecheck`, `npm run lint`, `npm run format`, `npm test`, `npm run build`, `npm run webext:lint` (the verify-gate skill runs all of these).

---

### Task 1: `lib/shortcut.js` — event → commands-API shortcut string

**Files:**

- Create: `lib/shortcut.js`
- Test: `tests/unit/shortcut.test.js`

**Interfaces:**

- Consumes: nothing (pure module).
- Produces (Task 3 relies on these exact names):
  - `COMMAND_NAME` — the string `"_execute_action"`.
  - `DEFAULT_SHORTCUT` — the string `"Alt+Shift+S"`.
  - `eventToShortcut(event, { mac = false } = {})` — takes an object with `{ code, ctrlKey, altKey, shiftKey, metaKey }` (a `KeyboardEvent` qualifies); returns a commands-API shortcut string like `"Alt+Shift+S"`, or `null` if the combo isn't one the API accepts.

Rules encoded (from MDN commands/shortcut-values): exactly one primary modifier (`Ctrl`/`Alt`, or on mac `Command`/`MacCtrl`) + optional `Shift` + one key; `F1`–`F12` may also stand bare (without Shift). Keys come from `event.code` so letter mapping ignores keyboard layout shift-states: `KeyA`–`KeyZ` → `A`–`Z`, `Digit0`–`Digit9` → `0`–`9`, `F1`–`F12` as-is, arrows → `Up`/`Down`/`Left`/`Right`, plus `Comma`, `Period`, `Home`, `End`, `PageUp`, `PageDown`, `Space`, `Insert`, `Delete`. `metaKey` off mac (the Windows key) is rejected.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/shortcut.test.js`:

```js
import { describe, expect, it } from "vitest";
import {
  COMMAND_NAME,
  DEFAULT_SHORTCUT,
  eventToShortcut,
} from "@/lib/shortcut.js";

/** Minimal keydown shape: code + modifier flags, all defaulting to false. */
const ev = (code, mods = {}) => ({
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/shortcut.test.js`
Expected: FAIL — cannot resolve `@/lib/shortcut.js`.

- [ ] **Step 3: Write the implementation**

Create `lib/shortcut.js`:

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/shortcut.test.js`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

Stage `lib/shortcut.js` and `tests/unit/shortcut.test.js`, review `git diff --staged`, commit:
`feat(options): pure keydown → commands-API shortcut mapping`

---

### Task 2: i18n strings for the shortcut section (all six catalogs)

**Files:**

- Modify: `locales/en.json`, `locales/es.json`, `locales/fr.json`, `locales/de.json`, `locales/it.json`, `locales/ar.json` (insert the new entries immediately after each file's `optLanguageAuto` entry)
- Regenerate: `public/_locales/**` via `npm run locales`
- Test: existing `tests/unit/i18n-catalog.test.js` (key parity + `_locales` sync)

**Interfaces:**

- Consumes: nothing.
- Produces: seven message keys used by Task 3 via `t()`/`data-i18n`: `optShortcut`, `optShortcutHint`, `optShortcutNotSet`, `optShortcutReset`, `optShortcutOpenBrowser`, `optShortcutInvalid`, `optShortcutUpdateFailed`.

- [ ] **Step 1: Add the English entries**

In `locales/en.json`, after the `optLanguageAuto` entry:

```json
"optShortcut": {
  "message": "Slideshow shortcut",
  "description": "Options label for the trigger-shortcut card."
},
"optShortcutHint": {
  "message": "Click the box, then press a new key combination.",
  "description": "How to use the shortcut recorder input."
},
"optShortcutNotSet": {
  "message": "Not set",
  "description": "Shown when the trigger command has no keyboard binding."
},
"optShortcutReset": {
  "message": "Reset to default",
  "description": "Button restoring the default trigger shortcut."
},
"optShortcutOpenBrowser": {
  "message": "Change in browser settings ↗",
  "description": "Button opening the browser's own extension-shortcuts page (Chrome)."
},
"optShortcutInvalid": {
  "message": "Use Ctrl or Alt (or ⌘ on a Mac) plus a letter, number, or arrow key.",
  "description": "Shown when a recorded combo isn't accepted by the commands API."
},
"optShortcutUpdateFailed": {
  "message": "The browser didn't accept that shortcut. Set it in the browser's extension-shortcuts settings instead.",
  "description": "Shown when commands.update() rejects; the section degrades to guidance."
},
```

- [ ] **Step 2: Run the catalog test to verify it fails**

Run: `npx vitest run tests/unit/i18n-catalog.test.js`
Expected: FAIL — es/fr/de/it/ar are missing the new keys (and `_locales` is out of sync).

- [ ] **Step 3: Add the five translations**

Same position (after `optLanguageAuto`) in each file, same seven keys, same `description` values as English. Messages:

`locales/es.json`:

- optShortcut: `Atajo del pase de diapositivas`
- optShortcutHint: `Haz clic en el cuadro y pulsa una nueva combinación de teclas.`
- optShortcutNotSet: `Sin asignar`
- optShortcutReset: `Restablecer el predeterminado`
- optShortcutOpenBrowser: `Cambiar en la configuración del navegador ↗`
- optShortcutInvalid: `Usa Ctrl o Alt (o ⌘ en Mac) más una letra, un número o una flecha.`
- optShortcutUpdateFailed: `El navegador no aceptó ese atajo. Configúralo en los atajos de extensiones del navegador.`

`locales/fr.json`:

- optShortcut: `Raccourci du diaporama`
- optShortcutHint: `Cliquez sur le champ, puis appuyez sur une nouvelle combinaison de touches.`
- optShortcutNotSet: `Non défini`
- optShortcutReset: `Rétablir la valeur par défaut`
- optShortcutOpenBrowser: `Modifier dans les réglages du navigateur ↗`
- optShortcutInvalid: `Utilisez Ctrl ou Alt (ou ⌘ sur Mac) plus une lettre, un chiffre ou une flèche.`
- optShortcutUpdateFailed: `Le navigateur n'a pas accepté ce raccourci. Définissez-le dans les raccourcis d'extensions du navigateur.`

`locales/de.json`:

- optShortcut: `Tastenkürzel für die Diashow`
- optShortcutHint: `Klicke in das Feld und drücke eine neue Tastenkombination.`
- optShortcutNotSet: `Nicht belegt`
- optShortcutReset: `Auf Standard zurücksetzen`
- optShortcutOpenBrowser: `In den Browser-Einstellungen ändern ↗`
- optShortcutInvalid: `Verwende Strg oder Alt (bzw. ⌘ am Mac) plus Buchstabe, Ziffer oder Pfeiltaste.`
- optShortcutUpdateFailed: `Der Browser hat dieses Kürzel nicht übernommen. Lege es in den Erweiterungs-Tastenkürzeln des Browsers fest.`

`locales/it.json`:

- optShortcut: `Scorciatoia della presentazione`
- optShortcutHint: `Fai clic sul campo e premi una nuova combinazione di tasti.`
- optShortcutNotSet: `Non impostata`
- optShortcutReset: `Ripristina il valore predefinito`
- optShortcutOpenBrowser: `Modifica nelle impostazioni del browser ↗`
- optShortcutInvalid: `Usa Ctrl o Alt (o ⌘ su Mac) più una lettera, un numero o una freccia.`
- optShortcutUpdateFailed: `Il browser non ha accettato questa scorciatoia. Impostala nelle scorciatoie delle estensioni del browser.`

`locales/ar.json`:

- optShortcut: `اختصار عرض الشرائح`
- optShortcutHint: `انقر داخل المربع ثم اضغط مجموعة مفاتيح جديدة.`
- optShortcutNotSet: `غير معيَّن`
- optShortcutReset: `إعادة التعيين إلى الافتراضي`
- optShortcutOpenBrowser: `التغيير من إعدادات المتصفح ↗`
- optShortcutInvalid: `استخدم Ctrl أو Alt (أو ⌘ على Mac) مع حرف أو رقم أو سهم.`
- optShortcutUpdateFailed: `لم يقبل المتصفح هذا الاختصار. عيِّنه من اختصارات الإضافات في إعدادات المتصفح.`

- [ ] **Step 4: Regenerate `public/_locales` and verify the catalog test passes**

Run: `npm run locales`
Then: `npx vitest run tests/unit/i18n-catalog.test.js`
Expected: PASS (key parity + sync).

- [ ] **Step 5: Commit**

Stage the six `locales/*.json` and the regenerated `public/_locales/**`, review `git diff --staged`, commit:
`feat(i18n): strings for the configurable trigger shortcut`

---

### Task 3: Options HTML card + `lib/shortcut-section.js`

**Files:**

- Modify: `entrypoints/options/index.html` (new card after the Language field ~line 377; CSS additions in the inline `<style>` after the `select` rule ~line 124)
- Create: `lib/shortcut-section.js`
- Test: create `tests/unit/shortcut-section.test.js`; extend `tests/unit/options-page.test.js`

**Interfaces:**

- Consumes: `COMMAND_NAME`, `eventToShortcut` from `lib/shortcut.js` (Task 1); message keys from Task 2; `requiredElement(selector, ctor, root)` from `lib/dom.js`; `t(key)` from `lib/i18n.js`.
- Produces (Task 4 relies on this exact signature):
  ```js
  initShortcutSection({ doc, commands, openShortcutsPage, mac }) => Promise<void>
  // doc: Document
  // commands: { getAll(): Promise<{name?: string, shortcut?: string}[]>,
  //             update?: (d: {name: string, shortcut: string}) => Promise<void>,
  //             reset?: (name: string) => Promise<void> }
  // openShortcutsPage: () => void   (Chrome-only fallback button action)
  // mac: boolean
  ```
- DOM contract: ids `#shortcutValue` (output), `#shortcutInput`, `#shortcutReset`, `#shortcutOpen` (initially `hidden`), `#shortcutHint` (static, `data-i18n="optShortcutHint"`), `#shortcutError` (dynamic, starts empty).

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/shortcut-section.test.js`:

```js
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

const deps = (over = {}) => ({
  commands: firefoxCommands(),
  openShortcutsPage: vi.fn(),
  mac: false,
  ...over,
});

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
    expect(doc.querySelector("#shortcutInput")?.value).toBe("Ctrl+Period");
    expect(doc.querySelector("#shortcutOpen")?.hidden).toBe(true);
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
    const input = doc.querySelector("#shortcutInput");
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
    press(doc.querySelector("#shortcutInput"), { code: "KeyG" });
    await vi.waitFor(() =>
      expect(doc.querySelector("#shortcutError")?.textContent).not.toBe(""),
    );
    expect(commands.update).not.toHaveBeenCalled();
  });

  it("resets to the default binding", async () => {
    const doc = freshDoc();
    const commands = firefoxCommands();
    await initShortcutSection(deps({ doc, commands }));
    doc.querySelector("#shortcutReset")?.click();
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
    press(doc.querySelector("#shortcutInput"), { code: "KeyG", ctrlKey: true });
    await vi.waitFor(() =>
      expect(doc.querySelector("#shortcutInput")?.hidden).toBe(true),
    );
    expect(doc.querySelector("#shortcutReset")?.hidden).toBe(true);
    expect(doc.querySelector("#shortcutError")?.textContent).not.toBe("");
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
    expect(doc.querySelector("#shortcutInput")?.hidden).toBe(true);
    expect(doc.querySelector("#shortcutReset")?.hidden).toBe(true);
    const open = doc.querySelector("#shortcutOpen");
    expect(open?.hidden).toBe(false);
    open?.click();
    expect(openShortcutsPage).toHaveBeenCalledOnce();
  });
});
```

Extend `tests/unit/options-page.test.js` with a static-markup check (append after the language-picker describe):

```js
describe("options page shortcut card", () => {
  it("has the shortcut recorder markup with localized labels", () => {
    expect(doc.querySelector("#shortcutValue")).not.toBeNull();
    expect(doc.querySelector("#shortcutInput")).not.toBeNull();
    expect(doc.querySelector("#shortcutReset")?.getAttribute("data-i18n")).toBe(
      "optShortcutReset",
    );
    expect(doc.querySelector("#shortcutOpen")?.getAttribute("data-i18n")).toBe(
      "optShortcutOpenBrowser",
    );
    expect(doc.querySelector("#shortcutHint")?.getAttribute("data-i18n")).toBe(
      "optShortcutHint",
    );
    expect(doc.querySelector("#shortcutError")?.textContent).toBe("");
  });
});
```

Typecheck note: this repo typechecks test files. `querySelector` returns
`Element | null`, so property accesses like `.value`, `.hidden`, and `.click()`
in these tests need JSDoc casts, matching the existing style in
`options-page.test.js` — e.g.
`/** @type {HTMLInputElement} */ (doc.querySelector("#shortcutInput")).value`.
Apply them where `npm run typecheck` demands; don't loosen types elsewhere.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/shortcut-section.test.js tests/unit/options-page.test.js`
Expected: FAIL — `lib/shortcut-section.js` doesn't exist; the new markup queries return null.

- [ ] **Step 3: Add the HTML card**

In `entrypoints/options/index.html`, insert after the Language `</label>` (the `#locale` field, ~line 377):

```html
<div class="field" id="shortcutField">
  <span class="field__label">
    <span data-i18n="optShortcut">Slideshow shortcut</span>
    <span><output id="shortcutValue">Alt+Shift+S</output></span>
  </span>
  <div class="shortcut__row">
    <input id="shortcutInput" type="text" readonly />
    <button id="shortcutReset" type="button" data-i18n="optShortcutReset">
      Reset to default
    </button>
    <button
      id="shortcutOpen"
      type="button"
      hidden
      data-i18n="optShortcutOpenBrowser"
    >
      Change in browser settings ↗
    </button>
  </div>
  <span class="hint" id="shortcutHint" data-i18n="optShortcutHint"
    >Click the box, then press a new key combination.</span
  >
  <span class="hint hint--error" id="shortcutError"></span>
</div>
```

Add to the inline `<style>` (after the `select` rule, ~line 124):

```css
.shortcut__row {
  display: flex;
  gap: 10px;
}
.shortcut__row input {
  flex: 1;
  min-width: 0;
  padding: 9px 10px;
  color: var(--fg);
  background: var(--input-bg);
  border: 1px solid var(--line);
  border-radius: 8px;
  font: inherit;
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  text-align: center;
  cursor: pointer;
}
.shortcut__row input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.shortcut__row button {
  flex: none;
  padding: 9px 12px;
  color: var(--fg);
  background: var(--input-bg);
  border: 1px solid var(--line);
  border-radius: 8px;
  font: inherit;
  cursor: pointer;
}
.shortcut__row button:hover {
  border-color: var(--accent);
}
#shortcutField .hint {
  display: block;
  color: var(--muted);
  font-size: 12px;
  margin-top: 8px;
}
#shortcutField .hint:empty,
#shortcutField .hint[hidden] {
  display: none;
}
#shortcutField .hint--error {
  color: var(--accent);
}
```

- [ ] **Step 4: Write `lib/shortcut-section.js`**

```js
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

  if (typeof commands.update !== "function") {
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
      await commands.update({ name: COMMAND_NAME, shortcut });
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
```

Note for the implementer: the tests dispatch `KeyboardEvent`s that carry only `code` + modifier flags (no `key`), so the `event.key` guard clauses fall through to `eventToShortcut`, which is what the tests exercise. If `requiredElement`'s `instanceof` check fails against DOMParser-created elements in the test env, check how existing DOM-module tests (e.g. `overlay-settings.test.js`) construct their documents and mirror that instead of changing `dom.js`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/shortcut-section.test.js tests/unit/options-page.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

Stage `entrypoints/options/index.html`, `lib/shortcut-section.js`, both test files; review `git diff --staged`; commit:
`feat(options): shortcut card — recorder on Firefox, browser-settings link on Chrome`

---

### Task 4: Wire into the options page + docs

**Files:**

- Modify: `entrypoints/options/main.js` (import + one call at the bottom, next to `load()`)
- Modify: `README.md:28` and `README.md:125`

**Interfaces:**

- Consumes: `initShortcutSection` (Task 3 signature).
- Produces: nothing new.

- [ ] **Step 1: Wire the section in `main.js`**

Add to the imports:

```js
import { initShortcutSection } from "@/lib/shortcut-section.js";
```

At the bottom, after the existing `load();` line:

```js
initShortcutSection({
  doc: document,
  commands: browser.commands,
  openShortcutsPage: () => {
    browser.tabs.create({ url: "chrome://extensions/shortcuts" });
  },
  mac: navigator.platform.toUpperCase().includes("MAC"),
});
```

(Unawaited like `load()` — it's a page-init side effect. If ESLint flags the floating promise, mirror however `load()` satisfies it.)

- [ ] **Step 2: Update the README**

Both current mentions say the shortcut is fixed:

- Line 28: `or **Alt+Shift+S** - it starts at the top of the current feed (its own sort).`
- Line 125: `icon or press **Alt+Shift+S**.`

Read the surrounding lines, then append to each sentence (keeping the line-wrap style of the file) that the shortcut can be changed in the extension's preferences — e.g. `... (changeable in the extension's preferences)`. Plain wording, no browser-API jargon (no "commands API", no "AMO").

- [ ] **Step 3: Run the focused checks**

Run: `npm run typecheck`
Expected: PASS (the JSDoc on `initShortcutSection` must satisfy `browser.commands`' actual type — if the WXT/webextension-polyfill type for `commands` doesn't structurally match the deps JSDoc, cast at the call site with `/** @type {any} */ (browser.commands)` rather than loosening the module's types).

Run: `npx vitest run tests/unit`
Expected: PASS.

- [ ] **Step 4: Commit**

Stage `entrypoints/options/main.js` and `README.md`, review `git diff --staged`, commit:
`feat(options): wire the shortcut card; note configurability in the README`

---

### Task 5: Lighter meta text over the image (#ddd)

**Files:**

- Modify: `assets/overlay.css:462-474` (`.rs-meta__title`) and `assets/overlay.css:567-579` (`.rs-meta__source`)

**Interfaces:** none — CSS only. (`.rs-meta__res` and `.rs-meta__domain` inherit their color from `.rs-meta__source`, so recoloring the container covers the dimensions text; `--rs-muted` itself stays untouched for the byline and other UI.)

- [ ] **Step 1: Edit the two color declarations**

In `.rs-meta__title` (line 468): `color: #c1c8d3;` → `color: #ddd;` (the "Lighter than --rs-muted" comment above it stays true — leave it).

In `.rs-meta__source` (line 575): `color: var(--rs-muted);` → `color: #ddd;` and in the comment block above it (lines 567-568) change the word `muted` to `light` so the comment matches.

- [ ] **Step 2: Verify nothing asserts the old colors**

Run: `npx vitest run tests/unit/overlay-ui.test.js`
Expected: PASS (no color assertions exist; this confirms no accidental breakage).

- [ ] **Step 3: Commit**

Stage `assets/overlay.css`, review `git diff --staged`, commit:
`fix(overlay): #ddd title and dimensions/source text for readability over images`

---

### Task 6: Full gate + real-browser flag

**Files:**

- Modify: `NEXT_STEP.md` (append one bullet to the "Needs a real-browser confirm" list, ~line 80)

- [ ] **Step 1: Add the real-browser-confirm bullet**

Append to the "Needs a real-browser confirm" list in `NEXT_STEP.md`:

```markdown
- **Configurable trigger shortcut** — the options page reads the
  `_execute_action` binding via `commands.getAll()` and, on Firefox, rebinds it
  with `commands.update()`/`reset()`. Confirm in Firefox that updating
  `_execute_action` is actually accepted (MDN is fuzzy for MV3), that the new
  combo launches the slideshow, and that reset restores Alt+Shift+S; on Chrome,
  confirm the card hides the recorder and its button opens
  `chrome://extensions/shortcuts`. If Firefox rejects the update, the card must
  degrade to the guidance-only message. Also eyeball the #ddd title +
  dimensions text over a bright image.
```

- [ ] **Step 2: Run the full gate**

Use the verify-gate skill (typecheck, lint, format, unit tests, both browser builds, web-ext lint). All must pass. If `npm run format` rewrites files, re-stage and include them.

- [ ] **Step 3: Commit**

Stage `NEXT_STEP.md` (plus any format fixups), review `git diff --staged`, commit:
`docs: flag the shortcut card for a real-browser pass`

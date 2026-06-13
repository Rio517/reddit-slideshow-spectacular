# Overlay UI: split always-show, subtle counts, idle-load spinner — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the single "always show" overlay toggle into two (counts vs. title+byline), render the top-left counts as subtle text that gains the button look only on hover (no layout shift), and show a small corner loading spinner even when the chrome is hidden.

**Architecture:** A new `alwaysShowCount` setting (migrating from the old `alwaysShowMeta`) drives a second `rs-pin-count` class alongside `rs-pin-meta`; CSS splits the idle-exemption rule and moves the counts' pill chrome to `:hover`. A new `.rs-loaddot` element, toggled by the existing title-spinner lifecycle and revealed by CSS only while idle-and-unpinned, fills the hands-off loading gap.

**Tech Stack:** WXT (MV3), framework-free JS + JSDoc, Vitest (happy-dom), WebExtension `_locales` i18n, plain CSS in `assets/overlay.css`.

**Conventions for every commit:**
- Commit **locally only — never `git push`** (the maintainer pushes manually).
- Work stays on `main` (no branches/worktrees).
- End each commit message with the trailer shown in the commit steps.
- Read `git diff --staged` before each commit.
- Implementer gate before each commit: `npm run typecheck`, `npm run lint`, `npm run format`, plus the task's tests. (Including `format` is required — it isn't optional.)

---

## File map

- `lib/settings.js` — add `alwaysShowCount` to the type, defaults, and normalize (with carry-over migration). [Task 1]
- `locales/*.json` (6) + `public/_locales` — new + reworded strings. [Task 2]
- `lib/overlay-ui.js` — second pin-class toggle; the `.rs-loaddot` element + lifecycle. [Task 3]
- `assets/overlay.css` — split pin rule; subtle/hover counts; `.rs-loaddot` styles. [Task 4]
- `lib/overlay-settings.js`, `entrypoints/options/index.html`, `entrypoints/options/main.js` — second checkbox. [Task 5]
- Tests alongside each.

---

## Task 1: Settings model + carry-over migration

**Files:**
- Modify: `lib/settings.js`
- Test: `tests/unit/settings.test.js`

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/settings.test.js` inside the top-level `describe` (use the existing `normalizeSettings` import; check the file's imports and add `normalizeSettings` to them if it isn't already imported):

```js
describe("alwaysShowCount split", () => {
  it("defaults alwaysShowCount to true", () => {
    expect(normalizeSettings({}).alwaysShowCount).toBe(true);
  });

  it("carries a pre-split alwaysShowMeta=false over to alwaysShowCount", () => {
    const s = normalizeSettings({ alwaysShowMeta: false });
    expect(s.alwaysShowMeta).toBe(false);
    expect(s.alwaysShowCount).toBe(false);
  });

  it("lets an explicit alwaysShowCount override the carried value", () => {
    const s = normalizeSettings({ alwaysShowMeta: false, alwaysShowCount: true });
    expect(s.alwaysShowCount).toBe(true);
    expect(s.alwaysShowMeta).toBe(false);
  });
});
```

Also update the existing full-object assertion in the "stores only known keys" test (`tests/unit/settings.test.js:131-151`): add `alwaysShowCount: true,` directly after the `alwaysShowMeta: true,` line (line 138) so the `toEqual` still matches.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/settings.test.js`
Expected: FAIL — `alwaysShowCount` is `undefined`.

- [ ] **Step 3: Add the type, default, and normalize logic**

In `lib/settings.js`:

(a) Reword the `alwaysShowMeta` JSDoc and add `alwaysShowCount` (the typedef block at `:11`):

```js
 * @property {boolean} alwaysShowCount Keep the position counter and the
 *   skipped-count badge visible even when the controls auto-hide on idle, so a
 *   gap in the count from a skipped item stays explained.
 * @property {boolean} alwaysShowMeta Keep the post's title and byline visible
 *   even when the controls auto-hide on idle.
```

(b) In `DEFAULT_SETTINGS` (`:57`), replace the `alwaysShowMeta` line (`:70-71`) with both, defaulting true:

```js
  // Keep the position counter + skipped badge pinned past the idle fade.
  alwaysShowCount: true,
  // Keep the title + byline pinned past the idle fade.
  alwaysShowMeta: true,
```

(c) In `normalizeSettings` (`:187`), replace the existing `alwaysShowMeta` entry (`:195-198`) with:

```js
    // Migration: an explicit alwaysShowCount wins; otherwise carry the pre-split
    // alwaysShowMeta value (so a user who turned the single toggle off keeps both
    // off); otherwise the default.
    alwaysShowCount: boolOr(
      input.alwaysShowCount,
      boolOr(input.alwaysShowMeta, DEFAULT_SETTINGS.alwaysShowCount),
    ),
    alwaysShowMeta: boolOr(input.alwaysShowMeta, DEFAULT_SETTINGS.alwaysShowMeta),
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/settings.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/settings.js tests/unit/settings.test.js
git commit -m "feat(settings): split alwaysShowMeta into alwaysShowCount + alwaysShowMeta" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: i18n strings (6 locales)

Add three new keys and reword three existing ones, in all six source catalogs, then regenerate the built catalogs. (The catalog test requires every locale to carry the exact same key set.)

**Files:**
- Modify: `locales/{en,es,fr,de,it,ar}.json`
- Regenerated: `public/_locales/**`
- Test: `tests/unit/i18n-catalog.test.js` (existing)

- [ ] **Step 1: Reword the existing keys in `locales/en.json`**

Replace `settingsAlwaysShowMeta` (`locales/en.json:174-177`) message with `"Always show the title & byline"` (keep its `description`). Then find `optAlwaysShowMeta` and `optAlwaysShowMetaHint` and set:
- `optAlwaysShowMeta` message → `"Always show the title & byline"`
- `optAlwaysShowMetaHint` message → `"Keep the post's title and byline visible even when the controls auto-hide."`

- [ ] **Step 2: Add the new keys to `locales/en.json`**

Add (place `settingsAlwaysShowCount` next to `settingsAlwaysShowMeta`; the `opt*` ones next to `optAlwaysShowMeta`):

```json
  "settingsAlwaysShowCount": {
    "message": "Always show the count & skips",
    "description": "Settings-panel checkbox: always show the position counter and skipped count."
  },
  "optAlwaysShowCount": {
    "message": "Always show the count & skips",
    "description": "Options page label: always show the position counter and skipped count."
  },
  "optAlwaysShowCountHint": {
    "message": "Keep the position counter and skipped-count badge visible even when the controls auto-hide, so a gap in the count from a skipped item stays explained.",
    "description": "Options page hint for the always-show-count checkbox."
  },
```

- [ ] **Step 3: Apply the same six keys to the other five locales**

In each of `es, fr, de, it, ar`, reword the three existing keys and add the three new ones, keeping each file's English `description` strings. Translated `message` values:

`es.json`:
- settingsAlwaysShowMeta / optAlwaysShowMeta: `"Mostrar siempre el título y la firma"`
- optAlwaysShowMetaHint: `"Mantén visibles el título y la firma de la publicación aunque los controles se oculten."`
- settingsAlwaysShowCount / optAlwaysShowCount: `"Mostrar siempre el contador y los omitidos"`
- optAlwaysShowCountHint: `"Mantén visibles el contador de posición y el indicador de omitidos aunque los controles se oculten, para que un salto en el conteo siga explicado."`

`fr.json`:
- settingsAlwaysShowMeta / optAlwaysShowMeta: `"Toujours afficher le titre et la signature"`
- optAlwaysShowMetaHint: `"Gardez le titre et la signature de la publication visibles même lorsque les contrôles se masquent."`
- settingsAlwaysShowCount / optAlwaysShowCount: `"Toujours afficher le compteur et les ignorés"`
- optAlwaysShowCountHint: `"Gardez le compteur de position et le badge d'ignorés visibles même lorsque les contrôles se masquent, pour qu'un écart dans le décompte reste expliqué."`

`de.json`:
- settingsAlwaysShowMeta / optAlwaysShowMeta: `"Titel und Infozeile immer anzeigen"`
- optAlwaysShowMetaHint: `"Titel und Infozeile des Beitrags sichtbar halten, auch wenn die Steuerung ausgeblendet wird."`
- settingsAlwaysShowCount / optAlwaysShowCount: `"Zähler und Übersprungene immer anzeigen"`
- optAlwaysShowCountHint: `"Positionszähler und Übersprungen-Abzeichen sichtbar halten, auch wenn die Steuerung ausgeblendet wird, damit eine Lücke in der Zählung erklärt bleibt."`

`it.json`:
- settingsAlwaysShowMeta / optAlwaysShowMeta: `"Mostra sempre il titolo e la didascalia"`
- optAlwaysShowMetaHint: `"Mantieni visibili il titolo e la didascalia del post anche quando i controlli si nascondono."`
- settingsAlwaysShowCount / optAlwaysShowCount: `"Mostra sempre il contatore e i saltati"`
- optAlwaysShowCountHint: `"Mantieni visibili il contatore di posizione e il badge dei saltati anche quando i controlli si nascondono, così un salto nel conteggio resta spiegato."`

`ar.json`:
- settingsAlwaysShowMeta / optAlwaysShowMeta: `"إظهار العنوان وسطر المعلومات دائمًا"`
- optAlwaysShowMetaHint: `"أبقِ عنوان المنشور وسطر معلوماته ظاهرين حتى عند إخفاء عناصر التحكم."`
- settingsAlwaysShowCount / optAlwaysShowCount: `"إظهار العدّاد والعناصر المتخطّاة دائمًا"`
- optAlwaysShowCountHint: `"أبقِ عدّاد الموضع وشارة العناصر المتخطّاة ظاهرين حتى عند إخفاء عناصر التحكم، كي يظل أي فرق في العدّ مفهومًا."`

- [ ] **Step 4: Regenerate the built catalogs**

Run: `npm run locales`
Expected: rewrites `public/_locales/*/messages.json`.

- [ ] **Step 5: Run the catalog tests**

Run: `npx vitest run tests/unit/i18n-catalog.test.js`
Expected: PASS (all locales balanced + `public/_locales` in sync).

- [ ] **Step 6: Commit**

```bash
git add locales public/_locales
git commit -m "i18n: split the always-show label into count and title/byline" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Overlay — second pin class + corner spinner element

**Files:**
- Modify: `lib/overlay-ui.js`
- Test: `tests/unit/overlay-ui.test.js`

- [ ] **Step 1: Write the failing tests**

In `tests/unit/overlay-ui.test.js`, replace the existing test "pins the meta with rs-pin-meta only when alwaysShowMeta is set" (`:1017-1027`) with two tests covering both classes, and add a loaddot lifecycle test. (The suite's `PANEL_SETTINGS` at `:34` lacks `alwaysShowCount`; spreads with explicit keys below cover it.)

```js
  it("pins counts and meta independently via rs-pin-count / rs-pin-meta", () => {
    const overlay = createOverlay(noopHandlers());
    overlay.setSettings(
      /** @type {any} */ ({
        ...PANEL_SETTINGS,
        alwaysShowCount: true,
        alwaysShowMeta: false,
      }),
    );
    expect(overlay.root.classList.contains("rs-pin-count")).toBe(true);
    expect(overlay.root.classList.contains("rs-pin-meta")).toBe(false);
    overlay.setSettings(
      /** @type {any} */ ({
        ...PANEL_SETTINGS,
        alwaysShowCount: false,
        alwaysShowMeta: true,
      }),
    );
    expect(overlay.root.classList.contains("rs-pin-count")).toBe(false);
    expect(overlay.root.classList.contains("rs-pin-meta")).toBe(true);
  });

  it("marks the corner load spinner active while a slide is loading", () => {
    const overlay = createOverlay(noopHandlers());
    const dot = /** @type {HTMLElement} */ (
      overlay.root.querySelector(".rs-loaddot")
    );
    expect(dot).not.toBeNull();
    expect(dot.classList.contains("rs-loaddot--on")).toBe(false);
    // Rendering a slide arms the loading spinner (media never "loads" in the
    // DOM-less test, so it stays on).
    overlay.renderCurrent(imageSlide(), {
      index: 0,
      total: 1,
      exhausted: true,
      effectiveSeconds: 5,
      playing: true,
    });
    expect(dot.classList.contains("rs-loaddot--on")).toBe(true);
    overlay.hide();
    expect(dot.classList.contains("rs-loaddot--on")).toBe(false);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/overlay-ui.test.js`
Expected: FAIL — `rs-pin-count` never set; `.rs-loaddot` not found.

- [ ] **Step 3: Create the `.rs-loaddot` element**

In `lib/overlay-ui.js`, right after the `loading` element block (`:456-459`, the `const loading = …; loading.append(...)`), add:

```js
  // A small corner spinner shown only while the chrome is hidden and the next
  // media is loading - the title-row spinner is invisible then (see CSS).
  const loaddot = doc.createElement("div");
  loaddot.className = "rs-loaddot";
  loaddot.append(doc.createElement("span"));
```

Add it to the `root.append(...)` list (`:560-575`) — insert `loaddot,` right after `loading,`:

```js
    loading,
    loaddot,
```

- [ ] **Step 4: Toggle the spinner from the title-spinner lifecycle**

Replace `showTitleSpinner` / `hideTitleSpinner` (`:682-687`) with:

```js
  function showTitleSpinner() {
    titleSpinner.classList.add("rs-meta__spinner--on");
    loaddot.classList.add("rs-loaddot--on");
  }
  function hideTitleSpinner() {
    titleSpinner.classList.remove("rs-meta__spinner--on");
    loaddot.classList.remove("rs-loaddot--on");
  }
```

(`hide()` already calls `hideTitleSpinner()` at `:1482`, so the spinner can't persist across opens.)

- [ ] **Step 5: Split the pin-class toggle**

In `setSettings` (`:1572`), replace the single line
`root.classList.toggle("rs-pin-meta", s.alwaysShowMeta);` with:

```js
      root.classList.toggle("rs-pin-count", s.alwaysShowCount);
      root.classList.toggle("rs-pin-meta", s.alwaysShowMeta);
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/overlay-ui.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/overlay-ui.js tests/unit/overlay-ui.test.js
git commit -m "feat(overlay): split count/meta pinning and add a corner load spinner" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: CSS — split pin rule, subtle counts, loaddot styles

No unit test (CSS rendering isn't asserted in happy-dom). The gate's `format` + `build` must pass, and the existing overlay tests must stay green. Real-browser verification is in Task 6.

**Files:**
- Modify: `assets/overlay.css`

- [ ] **Step 1: Split the idle-exemption rule**

Replace the combined rule (`assets/overlay.css:590-596`) with two:

```css
/* "Always show count": the top-left cluster (counter + skipped badge) survives
   the idle fade. "Always show meta": the bottom title/byline bar does. Each is
   driven by its own setting; both stay non-interactive while idle (cursor is
   hidden) - a mousemove wakes them. */
#reddit-slideshow-root.rs-pin-count.rs-idle .rs-topleft {
  opacity: 1;
}
#reddit-slideshow-root.rs-pin-meta.rs-idle .rs-meta {
  opacity: 1;
}
```

- [ ] **Step 2: Make the counter subtle at rest, pill on hover (no shift)**

Replace the `.rs-meta__counter` base rule (`assets/overlay.css:425-437`) so the border is present-but-transparent and the color is muted at rest (box geometry unchanged):

```css
.rs-meta__counter {
  flex: none;
  font-family:
    ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
  font-size: 12px;
  letter-spacing: 0.14em;
  color: var(--rs-muted);
  padding: 4px 9px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  font-variant-numeric: tabular-nums;
}
```

Then update the `:hover` rule (`:1378-1381`) to restore the full pill (the prior resting look) plus the hover tint:

```css
.rs-meta__counter:hover {
  color: #ffcf9e;
  border-color: rgba(255, 122, 24, 0.35);
  background: rgba(255, 122, 24, 0.16);
}
```

- [ ] **Step 3: Make the skipped badge subtle at rest, pill on hover**

Replace the `.rs-skipped` base rule (`:1063-1076`) so its border/background are transparent and the color is muted at rest (keep `padding`/`border-width`):

```css
.rs-skipped {
  flex: none;
  font-family:
    ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
  font-size: 11px;
  letter-spacing: 0.12em;
  color: var(--rs-muted);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  padding: 4px 9px;
  cursor: pointer;
  transition:
    background 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease;
}
```

And update its `:hover` (`:1082-1084`) to restore the danger pill:

```css
.rs-skipped:hover {
  color: var(--rs-danger);
  border-color: rgba(255, 107, 107, 0.4);
  background: rgba(255, 107, 107, 0.18);
}
```

- [ ] **Step 4: Add the `.rs-loaddot` styles**

Add near the `.rs-loading` block (after `assets/overlay.css:975`):

```css
/* Small corner spinner shown only while the chrome is idle-hidden and the next
   media is loading - the title-row spinner is faded then, so this is the only
   loading feedback. Stays hidden when the meta is pinned (its title spinner is
   still visible) or when the chrome is awake. */
.rs-loaddot {
  position: absolute;
  inset-inline-end: 24px;
  bottom: 34px;
  z-index: 8;
  opacity: 0;
  transition: opacity 0.2s ease;
  pointer-events: none;
}

.rs-loaddot span {
  display: block;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.16);
  border-top-color: var(--rs-accent);
  animation: rs-spin 0.8s linear infinite;
}

#reddit-slideshow-root.rs-idle:not(.rs-pin-meta) .rs-loaddot--on {
  opacity: 1;
}
```

- [ ] **Step 5: Verify the gate stays green**

Run: `npm run format`
Run: `npx vitest run tests/unit/overlay-ui.test.js`
Run: `npm run build`
Expected: format clean, tests pass, both builds succeed.

- [ ] **Step 6: Commit**

```bash
git add assets/overlay.css
git commit -m "style(overlay): subtle counts with hover pill, split pin rule, loaddot" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Settings UI — overlay panel + options page

**Files:**
- Modify: `lib/overlay-settings.js`, `entrypoints/options/index.html`, `entrypoints/options/main.js`
- Test: `tests/unit/overlay-settings.test.js`, `tests/unit/options-page.test.js`

- [ ] **Step 1: Write the failing tests**

(a) In `tests/unit/overlay-settings.test.js`, add `alwaysShowCount: false` to the `SETTINGS` fixture (next to `alwaysShowMeta: false` at `:19`), then add:

```js
  it("reflects alwaysShowCount and emits its patch on toggle", () => {
    const { panel, onChange } = make();
    panel.setValues(/** @type {any} */ ({ ...SETTINGS, alwaysShowCount: true }));
    // Checkbox rows are `.rs-set__check`; the label text lives in `.rs-set__label`
    // (mirrors the existing checkbox-toggle test). After Task 2 the English label
    // is "Always show the count & skips" — the only one containing "count".
    const row = [...panel.root.querySelectorAll(".rs-set__check")].find((r) =>
      /count/i.test(r.querySelector(".rs-set__label")?.textContent ?? ""),
    );
    const box = /** @type {HTMLInputElement} */ (row?.querySelector("input"));
    expect(box.checked).toBe(true);
    box.checked = false;
    box.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onChange).toHaveBeenCalledWith({ alwaysShowCount: false });
  });
```

(b) In `tests/unit/options-page.test.js`, add:

```js
describe("options page always-show toggles", () => {
  it("has separate count and meta checkboxes", () => {
    expect(doc.querySelector("#alwaysShowCount")).not.toBeNull();
    expect(doc.querySelector("#alwaysShowMeta")).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/overlay-settings.test.js tests/unit/options-page.test.js`
Expected: FAIL — no `alwaysShowCount` checkbox / `#alwaysShowCount` element.

- [ ] **Step 3: Add the overlay-panel checkbox**

In `lib/overlay-settings.js`, add a checkbox next to `alwaysShowMeta` (`:93-95`):

```js
  const alwaysShowCount = checkbox(doc, t("settingsAlwaysShowCount"), (v) =>
    handlers.onChange({ alwaysShowCount: v }),
  );
  const alwaysShowMeta = checkbox(doc, t("settingsAlwaysShowMeta"), (v) =>
    handlers.onChange({ alwaysShowMeta: v }),
  );
```

Append its row in `root.append(...)` (`:96-103`) — add `alwaysShowCount.row,` directly before `alwaysShowMeta.row,`. In `setValues` (`:129`), add directly before the `alwaysShowMeta.input.checked` line:

```js
    alwaysShowCount.input.checked = s.alwaysShowCount;
```

- [ ] **Step 4: Add the options-page checkbox (HTML)**

In `entrypoints/options/index.html`, insert a new `<label>` block directly before the existing `alwaysShowMeta` label (`:480`), and reword the existing meta label's inline text:

New block (before `:480`):

```html
      <label class="check">
        <input id="alwaysShowCount" type="checkbox" />
        <span>
          <span data-i18n="optAlwaysShowCount"
            >Always show the count &amp; skips</span
          >
          <span class="hint" data-i18n="optAlwaysShowCountHint">
            Keep the position counter and skipped-count badge visible even when
            the controls auto-hide, so a gap in the count from a skipped item
            stays explained.
          </span>
        </span>
      </label>
```

Reword the existing meta block (`:483-489`) inline fallback text:
- the `optAlwaysShowMeta` span text → `Always show the title &amp; byline`
- the `optAlwaysShowMetaHint` text → `Keep the post's title and byline visible even when the controls auto-hide.`

- [ ] **Step 5: Wire the options-page checkbox (JS)**

In `entrypoints/options/main.js`:
- After the `alwaysShowMeta` element (`:39`):

```js
const alwaysShowCount = requiredElement("#alwaysShowCount", HTMLInputElement);
```

- In the load function, after `alwaysShowMeta.checked = settings.alwaysShowMeta;` (`:112`):

```js
  alwaysShowCount.checked = settings.alwaysShowCount;
```

- In `persist()`, after `alwaysShowMeta: alwaysShowMeta.checked,` (`:136`):

```js
      alwaysShowCount: alwaysShowCount.checked,
```

- After `alwaysShowMeta.addEventListener("change", persist);` (`:165`):

```js
alwaysShowCount.addEventListener("change", persist);
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/overlay-settings.test.js tests/unit/options-page.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/overlay-settings.js entrypoints/options/index.html entrypoints/options/main.js tests/unit/overlay-settings.test.js tests/unit/options-page.test.js
git commit -m "feat(settings-ui): expose the always-show count toggle in both panels" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Full gate + real-browser verification

**Files:** none (verification).

- [ ] **Step 1: Run the full offline gate**

```bash
npm run typecheck
npm run lint
npm run format
npm test
npm run build
npm run webext:lint
```
Expected: all PASS; web-ext `0 errors, 0 warnings, 0 notices`.

- [ ] **Step 2: Real-browser check (load `.output/firefox-mv3/` as a temporary add-on)**

Confirm the CSS-rendered behavior the unit tests can't:
- The options page and overlay gear each show **two** toggles (counts; title & byline). Toggling each independently pins/unpins only its cluster after the chrome idles.
- The position counter and skipped badge render as quiet text and gain the pill background/border on hover **without the text shifting**.
- With the meta unpinned, idle the chrome over a slow-loading slide: the small corner spinner appears (held frame stays visible); it disappears when the slide is ready or on mousemove.

---

## Self-review notes (for the implementer)

- **Spec coverage:** settings split + migration (Task 1); reworded/new strings (Task 2); independent pin classes + corner spinner element/lifecycle (Task 3); split idle rule + subtle/hover counts + loaddot CSS (Task 4); both settings UIs (Task 5); gate + browser check (Task 6).
- **Type/name consistency:** the setting is `alwaysShowCount` everywhere; classes are `rs-pin-count` and `rs-loaddot` / `rs-loaddot--on`; i18n keys are `settingsAlwaysShowCount`, `optAlwaysShowCount`, `optAlwaysShowCountHint`.
- **No new permissions or network surface.** The two CSS-only behaviors (subtle counts, idle spinner visibility) are verified in Task 6, not unit tests.

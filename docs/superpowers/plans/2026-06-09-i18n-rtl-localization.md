# i18n + RTL Localization (v1.1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Localize the extension UI and store listings into en/es/fr/de/it/ar
with full right-to-left support, driven by the browser's UI language.

**Architecture:** Native WebExtension `_locales` catalogs (browser auto-selects
by UI language, falls back to English per key). The agnostic `lib/` core never
calls `browser.i18n`; instead `lib/i18n.js` exposes `t()`/`tn()` with a built-in
English fallback (imported from `locales/en.json`), and entrypoints inject
`browser.i18n.getMessage` + the active locale at startup. RTL is a `dir="rtl"`
toggle plus logical CSS and a direction sign variable for horizontal transforms.

**Tech Stack:** WXT 0.20 (MV3), Vitest + happy-dom + `fakeBrowser`, plain JS in
`lib/`, `Intl.PluralRules` for plurals. No new runtime dependencies.

**Source of truth & generation:**

- Humans edit `locales/{en,es,fr,de,it,ar}.json` (WebExtension message shape:
  `{ key: { message, description?, placeholders? } }`).
- `lib/i18n.js` imports `locales/en.json` directly (Vite-friendly; never import
  from `public/`).
- `scripts/build-locales.mjs` copies each `locales/<lang>.json` to
  `public/_locales/<lang>/messages.json` (what the browser reads; WXT copies
  `public/` to the extension root). The output is committed; a test regenerates
  in-memory and asserts it matches, so it can't go stale.

**Regression safety net:** The existing unit tests
(`overlay-help.test.js`, `overlay-ui.test.js`, `overlay-settings.test.js`,
`options-page.test.js`, `slides.test.js`) assert the **exact English strings**.
Because `t()` returns identical English by default, those tests stay green
through extraction — they ARE the proof the refactor preserved behavior. Every
extraction task ends by running the full unit suite.

**Commit discipline:** Small commits per task. Commit messages end with the
`Co-Authored-By` trailer. No `git push` without explicit user approval.

---

### Task 1: Verify the build wiring (spike)

Confirm the two assumptions the plan depends on before building on them: (a) a JSON file
under `locales/` is importable in Vitest via the `@/` alias, and (b) `wxt build`
copies `public/_locales/**` to the output root. Runtime `browser.i18n`
resolution needs a real browser and is flagged for manual verification, not
tested here.

**Files:**

- Create (temporary): `locales/en.json`
- Create (temporary): `public/_locales/en/messages.json`
- Create (temporary): `tests/unit/i18n-spike.test.js`

- [ ] **Step 1: Seed a one-key English catalog**

`locales/en.json`:

```json
{
  "extName": {
    "message": "Reddit Slideshow Spectacular!",
    "description": "The extension name shown in the browser and stores."
  }
}
```

- [ ] **Step 2: Write a spike test that imports it via the alias**

`tests/unit/i18n-spike.test.js`:

```js
import { describe, expect, it } from "vitest";
import en from "@/locales/en.json";

describe("locales import", () => {
  it("resolves @/locales/en.json with the message shape", () => {
    expect(en.extName.message).toBe("Reddit Slideshow Spectacular!");
  });
});
```

- [ ] **Step 3: Run the spike test**

Run: `npx vitest run tests/unit/i18n-spike.test.js`
Expected: PASS. If the import fails to resolve, stop and switch the import
strategy to a committed `locales/en.json` re-exported through a `lib/` module
before continuing.

- [ ] **Step 4: Confirm `public/_locales` is copied on build**

Create `public/_locales/en/messages.json` with the same content as Step 1, then:

Run: `npm run build:chrome`
Run: `cat .output/chrome-mv3/_locales/en/messages.json`
Expected: the file exists at the output root and contains `extName`. If it is
absent, stop and place `_locales` wherever WXT 0.20 copies static assets
(adjust all later paths accordingly).

- [ ] **Step 5: Remove the spike, keep the finding**

These files are untracked, so delete them directly (Task 2 recreates
`locales/en.json` properly):

```bash
rm -f tests/unit/i18n-spike.test.js locales/en.json public/_locales/en/messages.json
```

No commit — this task only de-risks the path. The `.output/` build artifacts
are git-ignored.

---

### Task 2: The i18n core module

`lib/i18n.js` with `t`, `tn`, `localeDirection`, `setMessageGetter`,
`setLocale`, `currentLocale`. Defaults to the bundled English catalog so tests
need no setup.

**Files:**

- Create: `locales/en.json`
- Create: `lib/i18n.js`
- Create: `tests/unit/i18n.test.js`

- [ ] **Step 1: Seed `locales/en.json` with the keys this task tests**

```json
{
  "extName": {
    "message": "Reddit Slideshow Spectacular!",
    "description": "The extension name."
  },
  "byline": {
    "message": "$author$ to $subreddit$",
    "description": "Slide byline.",
    "placeholders": {
      "author": { "content": "$1" },
      "subreddit": { "content": "$2" }
    }
  },
  "skipped_one": {
    "message": "$count$ skipped",
    "description": "Skipped counter, singular.",
    "placeholders": { "count": { "content": "$1" } }
  },
  "skipped_other": {
    "message": "$count$ skipped",
    "description": "Skipped counter, plural.",
    "placeholders": { "count": { "content": "$1" } }
  }
}
```

- [ ] **Step 2: Write the failing tests**

`tests/unit/i18n.test.js`:

```js
import { afterEach, describe, expect, it } from "vitest";
import {
  t,
  tn,
  localeDirection,
  setMessageGetter,
  setLocale,
  currentLocale,
} from "../../lib/i18n.js";

afterEach(() => {
  setMessageGetter(null); // restore the built-in English getter
  setLocale("en");
});

describe("t", () => {
  it("returns the English message by default", () => {
    expect(t("extName")).toBe("Reddit Slideshow Spectacular!");
  });

  it("substitutes named placeholders positionally", () => {
    expect(t("byline", ["u/alice", "r/pics"])).toBe("u/alice to r/pics");
  });

  it("coerces non-string substitutions", () => {
    expect(t("skipped_other", [3])).toBe("3 skipped");
  });

  it("falls back to English then the key when the getter is empty", () => {
    setMessageGetter(() => "");
    expect(t("extName")).toBe("Reddit Slideshow Spectacular!");
    expect(t("nope")).toBe("nope");
  });

  it("uses an injected getter when it returns a value", () => {
    setMessageGetter((key) => (key === "extName" ? "OVERRIDE" : ""));
    expect(t("extName")).toBe("OVERRIDE");
  });
});

describe("tn", () => {
  it("selects the English plural category via Intl.PluralRules", () => {
    setLocale("en");
    expect(tn("skipped", 1, [1])).toBe("1 skipped");
    expect(tn("skipped", 3, [3])).toBe("3 skipped");
  });

  it("falls back to _other when a category key is missing", () => {
    setLocale("ar"); // Arabic 'two'/'few' categories not seeded -> _other
    expect(tn("skipped", 10, [10])).toBe("10 skipped");
  });
});

describe("localeDirection", () => {
  it("maps Arabic to rtl and English to ltr", () => {
    expect(localeDirection("ar")).toBe("rtl");
    expect(localeDirection("ar-EG")).toBe("rtl");
    expect(localeDirection("en-US")).toBe("ltr");
  });
});

describe("setLocale/currentLocale", () => {
  it("tracks the active locale, defaulting to en", () => {
    expect(currentLocale()).toBe("en");
    setLocale("fr");
    expect(currentLocale()).toBe("fr");
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/i18n.test.js`
Expected: FAIL — `lib/i18n.js` does not exist.

- [ ] **Step 4: Implement `lib/i18n.js`**

```js
import enCatalog from "@/locales/en.json";

/**
 * @typedef {{ message: string, description?: string,
 *   placeholders?: Record<string, { content: string }> }} CatalogEntry
 */

const RTL_LANGS = new Set(["ar", "he", "fa", "ur"]);

/** @type {(key: string, subs?: string[]) => string} */
let getMessageImpl = defaultGetMessage;
let activeLocale = "en";

/** Resolve a key from the bundled English catalog (the fallback + test source). */
function defaultGetMessage(
  /** @type {string} */ key,
  /** @type {string[]=} */ subs,
) {
  const entry = /** @type {Record<string, CatalogEntry>} */ (enCatalog)[key];
  return entry ? expand(entry, subs) : "";
}

/** Apply named placeholders ($name$ -> content "$N" -> subs[N-1]) and $$ -> $. */
function expand(
  /** @type {CatalogEntry} */ entry,
  /** @type {string[]=} */ subs,
) {
  let msg = entry.message;
  const placeholders = entry.placeholders ?? {};
  for (const [name, def] of Object.entries(placeholders)) {
    const index = Number(def.content.replace("$", "")) - 1;
    const value = subs?.[index] ?? "";
    msg = msg.replaceAll(`$${name}$`, value);
  }
  return msg.replaceAll("$$", "$");
}

/** Whether the bundled English catalog defines a key. */
function hasEnKey(/** @type {string} */ key) {
  return Object.prototype.hasOwnProperty.call(enCatalog, key);
}

/**
 * Translate a key. Substitutions are coerced to strings. Falls back from the
 * active getter to the bundled English catalog, then to the key itself.
 * @param {string} key
 * @param {Array<string | number>} [subs]
 * @returns {string}
 */
export function t(key, subs) {
  const strings = subs?.map(String);
  const fromGetter = getMessageImpl(key, strings);
  if (fromGetter) return fromGetter;
  const fromEnglish = defaultGetMessage(key, strings);
  return fromEnglish || key;
}

/**
 * Plural-aware translate: picks `<key>_<category>` for `count` in the active
 * locale, falling back to `<key>_other`.
 * @param {string} key
 * @param {number} count
 * @param {Array<string | number>} [subs]
 * @returns {string}
 */
export function tn(key, count, subs) {
  const category = new Intl.PluralRules(activeLocale).select(count);
  const candidate = `${key}_${category}`;
  const chosen = hasEnKey(candidate) ? candidate : `${key}_other`;
  return t(chosen, subs);
}

/**
 * @param {string} locale BCP-47 tag (e.g. "ar", "en-US").
 * @returns {"ltr" | "rtl"}
 */
export function localeDirection(locale) {
  const lang = String(locale || "")
    .toLowerCase()
    .split(/[-_]/)[0];
  return RTL_LANGS.has(lang) ? "rtl" : "ltr";
}

/**
 * Install the platform message getter (e.g. browser.i18n.getMessage). Passing a
 * falsy value restores the built-in English getter (used by tests).
 * @param {((key: string, subs?: string[]) => string) | null | undefined} fn
 */
export function setMessageGetter(fn) {
  getMessageImpl = fn || defaultGetMessage;
}

/** @param {string} locale */
export function setLocale(locale) {
  activeLocale = locale || "en";
}

/** @returns {string} */
export function currentLocale() {
  return activeLocale;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/i18n.test.js`
Expected: PASS (all cases).

- [ ] **Step 6: Commit**

```bash
git add lib/i18n.js locales/en.json tests/unit/i18n.test.js
git commit -m "feat(i18n): translator core with English fallback and plurals"
```

---

### Task 3: Locale generator + catalog integrity tests

Generate `public/_locales/**` from `locales/**` and lock catalog integrity:
generated output matches source, every locale has the English key set, and
placeholders are consistent.

**Files:**

- Create: `scripts/build-locales.mjs`
- Create: `public/_locales/en/messages.json` (generated, committed)
- Create: `tests/unit/i18n-catalog.test.js`
- Modify: `package.json` (add a `locales` script)

- [ ] **Step 1: Write the generator**

`scripts/build-locales.mjs`:

```js
// Copy locales/<lang>.json -> public/_locales/<lang>/messages.json (the layout
// the browser reads; WXT copies public/ to the extension root). Source of truth
// is locales/; this output is committed and verified by i18n-catalog.test.js.
import {
  readdirSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "locales");
const outDir = join(root, "public", "_locales");

export function buildLocales({ write = true } = {}) {
  /** @type {Record<string, string>} */
  const outputs = {};
  for (const file of readdirSync(srcDir)) {
    if (!file.endsWith(".json")) continue;
    const lang = file.replace(/\.json$/, "");
    const parsed = JSON.parse(readFileSync(join(srcDir, file), "utf8"));
    outputs[lang] = JSON.stringify(parsed, null, 2) + "\n";
  }
  if (write) {
    rmSync(outDir, { recursive: true, force: true });
    for (const [lang, content] of Object.entries(outputs)) {
      const dest = join(outDir, lang, "messages.json");
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, content);
    }
  }
  return outputs;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  buildLocales();
  console.log("Wrote public/_locales from locales/");
}
```

- [ ] **Step 2: Add the npm script**

In `package.json` `scripts`, add:

```json
"locales": "node scripts/build-locales.mjs",
```

- [ ] **Step 3: Generate the committed output**

Run: `npm run locales`
Run: `cat public/_locales/en/messages.json`
Expected: contains the keys from `locales/en.json`.

- [ ] **Step 4: Write the integrity tests**

`tests/unit/i18n-catalog.test.js`:

```js
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildLocales } from "../../scripts/build-locales.mjs";
import en from "../../locales/en.json";

const root = join(__dirname, "..", "..");
const enKeys = Object.keys(en).sort();
const locales = ["en", "es", "fr", "de", "it", "ar"];

function loadSource(lang) {
  return JSON.parse(
    readFileSync(join(root, "locales", `${lang}.json`), "utf8"),
  );
}

describe("locale catalogs", () => {
  it("public/_locales is in sync with locales/ (run `npm run locales`)", () => {
    const expected = buildLocales({ write: false });
    for (const lang of Object.keys(expected)) {
      const onDisk = readFileSync(
        join(root, "public", "_locales", lang, "messages.json"),
        "utf8",
      );
      expect(onDisk).toBe(expected[lang]);
    }
  });

  it.each(locales)("%s has exactly the English key set", (lang) => {
    const keys = Object.keys(loadSource(lang)).sort();
    expect(keys).toEqual(enKeys);
  });

  it.each(locales)("%s has matching placeholders per key", (lang) => {
    const cat = loadSource(lang);
    for (const key of enKeys) {
      const expected = Object.keys(en[key].placeholders ?? {}).sort();
      const actual = Object.keys(cat[key].placeholders ?? {}).sort();
      expect(actual, `${lang}/${key} placeholders`).toEqual(expected);
    }
  });
});
```

- [ ] **Step 5: Create the other five locale files (English values for now)**

So the parity tests pass before real translation lands, create
`locales/{es,fr,de,it,ar}.json` as **exact copies of `locales/en.json`** (Task 9
replaces the values with translations; parity keys stay identical):

```bash
for l in es fr de it ar; do cp locales/en.json locales/$l.json; done
npm run locales
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/unit/i18n-catalog.test.js`
Expected: PASS (sync, key parity, placeholder parity for all six locales).

- [ ] **Step 7: Commit**

```bash
git add scripts/build-locales.mjs package.json locales public/_locales tests/unit/i18n-catalog.test.js
git commit -m "feat(i18n): locale generator and catalog integrity tests"
```

---

### Task 4: Localize the manifest

Move user-facing manifest text into `_locales`. The brand `name` stays a literal.

**Files:**

- Modify: `wxt.config.ts:6-8,60,71`
- Modify: `locales/en.json` (+ regenerate)

- [ ] **Step 1: Add manifest keys to `locales/en.json`**

Add (keep existing keys):

```json
"extDescription": {
  "message": "Turn an old or new Reddit feed into a full-screen, keyboard-driven media slideshow.",
  "description": "Store/about description."
},
"actionTitle": {
  "message": "Start Reddit Slideshow Spectacular!",
  "description": "Toolbar button tooltip and command description."
}
```

- [ ] **Step 2: Reference the messages from the manifest and set `default_locale`**

In `wxt.config.ts`, change the manifest object:

```ts
name: "Reddit Slideshow Spectacular!",
default_locale: "en",
description: "__MSG_extDescription__",
```

and:

```ts
action: {
  default_title: "__MSG_actionTitle__",
```

and:

```ts
commands: {
  _execute_action: {
    suggested_key: { default: "Alt+Shift+S" },
    description: "__MSG_actionTitle__",
  },
},
```

- [ ] **Step 3: Regenerate, copy keys to the five locales, build**

```bash
# add the two new keys to es/fr/de/it/ar too (English values for now)
node -e "const fs=require('fs');const en=require('./locales/en.json');for(const l of['es','fr','de','it','ar']){const c=require('./locales/'+l+'.json');for(const k of['extDescription','actionTitle'])c[k]=en[k];fs.writeFileSync('./locales/'+l+'.json',JSON.stringify(c,null,2)+'\n');}"
npm run locales
```

- [ ] **Step 4: Verify build + manifest substitution wiring**

Run: `npm run build:firefox`
Run: `grep -n "__MSG_extDescription__\|default_locale" .output/firefox-mv3/manifest.json`
Expected: the manifest contains `"default_locale": "en"` and the `__MSG_*__`
references (the browser substitutes them at install time).

- [ ] **Step 5: Run the full gate's fast checks**

Run: `npm run typecheck`
Run: `npx vitest run tests/unit/i18n-catalog.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add wxt.config.ts locales public/_locales
git commit -m "feat(i18n): localize manifest description, action, and command"
```

---

### Task 5: Wire the locale into the entrypoints

Inject `browser.i18n` into the core at startup and toggle direction. Three entry
points: content script, options page, background.

**Files:**

- Modify: `entrypoints/content.js:20` (top of `main()`)
- Modify: `entrypoints/options/main.js` (init)
- Modify: `entrypoints/background.js:25` (top of `defineBackground`)
- Create: `lib/i18n-dom.js`
- Create: `tests/unit/i18n-dom.test.js`

- [ ] **Step 1: Write the failing test for the DOM localizer**

`tests/unit/i18n-dom.test.js`:

```js
import { afterEach, describe, expect, it } from "vitest";
import { localizeDocument } from "../../lib/i18n-dom.js";
import { setMessageGetter } from "../../lib/i18n.js";

afterEach(() => {
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("dir");
  setMessageGetter(null);
});

describe("localizeDocument", () => {
  it("replaces [data-i18n] text from the catalog", () => {
    document.body.innerHTML = `<span data-i18n="extName"></span>`;
    localizeDocument(document, "en");
    expect(document.querySelector("span")?.textContent).toBe(
      "Reddit Slideshow Spectacular!",
    );
  });

  it("sets the document direction from the locale", () => {
    localizeDocument(document, "ar");
    expect(document.documentElement.dir).toBe("rtl");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/i18n-dom.test.js`
Expected: FAIL — `lib/i18n-dom.js` missing.

- [ ] **Step 3: Implement `lib/i18n-dom.js`**

```js
import { t, localeDirection, setLocale } from "./i18n.js";

/**
 * Localize a static document: set <html dir> from the locale and replace the
 * text of every [data-i18n] element with its translated message.
 * @param {Document} doc
 * @param {string} locale
 */
export function localizeDocument(doc, locale) {
  setLocale(locale);
  doc.documentElement.dir = localeDirection(locale);
  for (const el of doc.querySelectorAll("[data-i18n]")) {
    const key = el.getAttribute("data-i18n");
    if (key) el.textContent = t(key);
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/unit/i18n-dom.test.js`
Expected: PASS.

- [ ] **Step 5: Wire the content script**

In `entrypoints/content.js`, add to the imports:

```js
import { setMessageGetter, setLocale } from "@/lib/i18n.js";
```

and at the very top of `main()` (before `createSlideshowSession`):

```js
// Drive the overlay's strings + direction from the browser's UI language.
setMessageGetter(browser.i18n.getMessage);
setLocale(browser.i18n.getUILanguage());
```

- [ ] **Step 6: Wire the background**

In `entrypoints/background.js`, add the import and call it at the top of the
`defineBackground(() => { ... })` body (before `browser.runtime.onInstalled`):

```js
import { setMessageGetter, setLocale } from "@/lib/i18n.js";
// ...
setMessageGetter(browser.i18n.getMessage);
setLocale(browser.i18n.getUILanguage());
```

- [ ] **Step 7: Wire the options page**

In `entrypoints/options/main.js`, add:

```js
import { localizeDocument } from "@/lib/i18n-dom.js";
import { setMessageGetter } from "@/lib/i18n.js";
```

and at the end of its initialization (after the DOM is ready):

```js
setMessageGetter(browser.i18n.getMessage);
localizeDocument(document, browser.i18n.getUILanguage());
```

- [ ] **Step 8: Run typecheck + full unit suite**

Run: `npm run typecheck`
Run: `npm test`
Expected: PASS — no behavior changed yet (English still rendered everywhere).

- [ ] **Step 9: Commit**

```bash
git add entrypoints lib/i18n-dom.js tests/unit/i18n-dom.test.js
git commit -m "feat(i18n): inject browser.i18n + direction into entrypoints"
```

---

### Tasks 6a–6e: Extract hardcoded strings to keys

One task per surface. **Procedure for each (identical pattern):**

1. For every user-facing literal in the file, add a key to `locales/en.json`
   with the **exact current English string** as `message` (declare
   `placeholders` for any interpolated value).
2. Replace the literal with `t("key")` (or `t("key", [subs])` / `tn(...)`),
   importing `{ t }` (and `tn`) from the i18n module.
3. Copy the new keys into `locales/{es,fr,de,it,ar}.json` (English values for
   now — Task 9 translates them), then `npm run locales`.
4. Run `npm test`. The **existing** assertions on exact English strings must
   stay green; that is the correctness proof. Then commit.

Because the existing tests pin the English output, no new per-string tests are
needed for extraction — only the catalog-integrity test (Task 3) and the
existing suites.

#### Task 6a: `lib/overlay-help.js`

**Files:** Modify `lib/overlay-help.js`; Modify `locales/en.json` (+ five copies).

- [ ] **Step 1: Add keys** — worked example (the close-button label asserted at
      `tests/unit/overlay-help.test.js:29`):

```json
"helpClose": { "message": "Close keyboard shortcuts", "description": "Help panel close button aria-label." }
```

Repeat for the panel `aria-label` (matches `/shortcuts/i`), title, the intro
line (`"optimized for hands-free or keyboard navigation"`), each of the 9
shortcut rows, and the about-footer link text.

- [ ] **Step 2: Replace literals** — worked example:

```js
import { t } from "./i18n.js";
// ...
close.setAttribute("aria-label", t("helpClose"));
```

- [ ] **Step 3: Propagate keys + regenerate**

```bash
node -e "const fs=require('fs');const en=require('./locales/en.json');const keys=process.argv.slice(1);for(const l of['es','fr','de','it','ar']){const c=require('./locales/'+l+'.json');for(const k of keys)c[k]=en[k];fs.writeFileSync('./locales/'+l+'.json',JSON.stringify(c,null,2)+'\n');}" helpClose helpTitle helpAria /* ...all new keys... */
npm run locales
```

- [ ] **Step 4: Test**

Run: `npx vitest run tests/unit/overlay-help.test.js tests/unit/i18n-catalog.test.js`
Expected: PASS (English output unchanged; catalog in sync).

- [ ] **Step 5: Commit**

```bash
git add lib/overlay-help.js locales public/_locales
git commit -m "i18n(overlay-help): extract strings to catalog"
```

#### Task 6b: `lib/overlay-settings.js`

Same procedure. Guard: `tests/unit/overlay-settings.test.js`.
Commit: `i18n(overlay-settings): extract strings to catalog`.

#### Task 6c: `lib/overlay-ui.js`

Same procedure — the largest surface: control-rail aria-labels, the position
counter, the **byline**, the end-of-show replay card, and the skipped/jump panel
labels. For the byline (`overlay-ui.js` around the byline builder) and skip
reason (`overlay-ui.js:923,970`, value set at `lib/session.js:209`), use
placeholder messages, e.g.:

```json
"bylineResolution": { "message": "$width$×$height$", "description": "Slide resolution.", "placeholders": { "width": { "content": "$1" }, "height": { "content": "$2" } } }
```

Guard: `tests/unit/overlay-ui.test.js`. RTL bidi wrapping of the byline LTR
tokens is done in Task 8 (not here).
Commit: `i18n(overlay-ui): extract strings to catalog`.

#### Task 6d: skip reasons (`lib/session.js` callers)

The reason strings are passed into `markSkipped(reason)` (set at
`lib/session.js:209`). Find each caller that passes a literal reason, replace it
with `t("reasonKey")`, add the keys. Guard: `tests/unit/slides.test.js`,
`tests/unit/session.test.js`.
Commit: `i18n(session): extract skip-reason strings to catalog`.

#### Task 6e: `entrypoints/options/index.html` + `entrypoints/options/main.js`

The ~50+ static labels (`entrypoints/options/index.html:350-590`) get a
`data-i18n="key"` attribute and their text emptied (or left as the English
default — `localizeDocument` overwrites it). Worked example:

```html
<span data-i18n="optTimePerImage">Time per image</span>
```

Dynamic values the options script computes (e.g. `5s`, `1.5×`) stay in
`main.js`; wrap any literal labels it sets at runtime in `t()`. The `<select>`
transition `<option>` labels (None/Fade/Slide/Push/Zoom/Flip) also become
`data-i18n`. Guard: `tests/unit/options-page.test.js` — if it asserts exact
English label text, it stays green because the English catalog values match.
Commit: `i18n(options): extract page labels to catalog`.

---

### Task 7: Add the skipped-counter plural

The one genuine plural. Replace the skipped-count label with `tn`.

**Files:** Modify `lib/overlay-ui.js` (skipped-count render); Modify
`locales/en.json`; Modify `tests/unit/overlay-ui.test.js`.

- [ ] **Step 1: Add plural keys to `locales/en.json`**

```json
"skipped_one": { "message": "$count$ skipped", "placeholders": { "count": { "content": "$1" } } },
"skipped_other": { "message": "$count$ skipped", "placeholders": { "count": { "content": "$1" } } }
```

(If the current code already renders a skipped count, replace its literal; the
`_one`/`_other` English text must equal the current output so existing tests
stay green.)

- [ ] **Step 2: Write/extend the failing test**

In `tests/unit/overlay-ui.test.js`, add an assertion that the skipped-count
element reads `"1 skipped"` for one skip and `"3 skipped"` for three (matching
the pre-i18n output exactly).

- [ ] **Step 3: Run to verify it fails**, then **Step 4: implement** with
      `tn("skipped", n, [n])`, then **Step 5: run to verify it passes**.

Run: `npx vitest run tests/unit/overlay-ui.test.js`
Expected: PASS.

- [ ] **Step 6: Propagate keys, regenerate, commit**

```bash
# copy skipped_one/skipped_other into the five locales, then:
npm run locales
git add lib/overlay-ui.js locales public/_locales tests/unit/overlay-ui.test.js
git commit -m "i18n(overlay-ui): pluralize the skipped counter"
```

---

### Task 8: Full RTL

`dir="rtl"` on the overlay root for RTL locales, logical CSS, a direction sign
variable for horizontal transforms, and bidi isolation of the byline's LTR
tokens.

**Files:** Modify `lib/overlay-ui.js` (root `dir` + byline `<bdi>`); Modify
`assets/overlay.css`; Modify `tests/unit/overlay-ui.test.js`.

- [ ] **Step 1: Failing test — overlay root direction + byline bidi**

In `tests/unit/overlay-ui.test.js` add:

```js
it("sets the overlay root to rtl for Arabic and wraps byline tokens in <bdi>", () => {
  setLocale("ar"); // import setLocale from ../../lib/i18n.js
  const overlay = createOverlay(handlers, document, "");
  document.body.append(overlay.root);
  expect(overlay.root.getAttribute("dir")).toBe("rtl");
  overlay.showSlide(/* a slide with author/subreddit/domain */);
  expect(
    overlay.root.querySelectorAll(".rs-byline bdi").length,
  ).toBeGreaterThan(0);
});
```

(Adapt to the real `createOverlay`/show API used elsewhere in the test file.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/overlay-ui.test.js`
Expected: FAIL.

- [ ] **Step 3: Set the overlay root direction**

In `lib/overlay-ui.js` where the root element is created, import
`{ currentLocale, localeDirection }` from `./i18n.js` and set:

```js
root.dir = localeDirection(currentLocale());
```

- [ ] **Step 4: Wrap byline LTR tokens in `<bdi>`**

Where the byline tokens (author, subreddit, domain, resolution) are appended,
create `doc.createElement("bdi")` for each instead of a plain span/text, so
Arabic surrounding text does not reorder them.

- [ ] **Step 5: Convert physical CSS to logical + add the direction sign var**

In `assets/overlay.css`:

- Add to the overlay root rule: `--rs-dir: 1;` and a sibling rule
  `:host([dir="rtl"]) { --rs-dir: -1; }` (or `[dir="rtl"]` if not in shadow).
- Positional insets: `left: 26px` → `inset-inline-start: 26px`
  (`:395,1037,1072,1407`); `right: 16px|22px|24px|70px` → `inset-inline-end: …`
  (`:542,660,902,1146`). Leave `left:0;right:0` (`:56-57`) and the
  `left:50%; transform: translateX(-50%)` centering pairs (`:970-971,1588`) as
  is — centering is direction-neutral.
- `text-align: left` → `text-align: start` (`:1105,1329,1442`);
  `text-align: right` → `text-align: end` (`:1222,1499`); leave
  `text-align: center`.
- Directional transforms: multiply every horizontal `translateX(<v>)` in the
  slide/push transitions (`:230-296`) and the two tooltip offsets (`:570,1316`)
  by `var(--rs-dir)`, e.g. `transform: translateX(calc(16% * var(--rs-dir)));`
  Leave the centering `translateX(-50%)` (`:971,1010-1022`) untouched.
- `flex-direction: column` rules are vertical — no change. Horizontal flex rows
  mirror automatically under `dir=rtl`.

- [ ] **Step 6: Run to verify the test passes + nothing else broke**

Run: `npm test`
Expected: PASS (English layout is byte-identical: `--rs-dir` is 1 in LTR, and
logical properties equal their physical originals in LTR).

- [ ] **Step 7: Commit**

```bash
git add lib/overlay-ui.js assets/overlay.css tests/unit/overlay-ui.test.js
git commit -m "feat(rtl): mirror overlay layout and isolate byline bidi"
```

- [ ] **Step 8: Apply RTL to the options page**

`localizeDocument` already sets `<html dir>`. Convert the options page styles
(inline `<style>` in `entrypoints/options/index.html`) the same way: physical
left/right → logical, `text-align` left/right → start/end. Run
`npx vitest run tests/unit/options-page.test.js`; commit
`feat(rtl): mirror the options page`.

---

### Task 9: Translations (es, fr, de, it, ar)

Replace the English placeholder values in the five catalogs with translations.
Keys and placeholders stay identical (enforced by Task 3's tests). Arabic is
Modern Standard Arabic. Machine-drafted; flagged for a native-speaker review.

**Files:** Modify `locales/{es,fr,de,it,ar}.json`; regenerate `public/_locales`.

- [ ] **Step 1: Translate every `message` value** in each of the five files.
      Keep `description` (translator context) and `placeholders` unchanged. Keep
      brand-name occurrences ("Reddit Slideshow Spectacular!") untranslated.
      Worked example for the skipped counter:

```json
// locales/ar.json — note Arabic plural categories (one/two/few/many/other)
"skipped_one":   { "message": "تم تخطي عنصر واحد", "placeholders": { "count": { "content": "$1" } } },
"skipped_other": { "message": "تم تخطي $count$ عنصرًا", "placeholders": { "count": { "content": "$1" } } }
```

If a locale needs a plural category English/the seed lacks (Arabic `two`/`few`/
`many`), add those `skipped_<cat>` keys **to every locale including en**
(en duplicates `_other`) so parity holds; `tn` falls back to `_other` when a
category key is absent, so this is optional polish.

- [ ] **Step 2: Regenerate**

Run: `npm run locales`

- [ ] **Step 3: Verify integrity**

Run: `npx vitest run tests/unit/i18n-catalog.test.js`
Expected: PASS (key + placeholder parity; output in sync).

- [ ] **Step 4: Commit**

```bash
git add locales public/_locales
git commit -m "feat(i18n): es/fr/de/it/ar translations (machine-drafted, pending native review)"
```

---

### Task 10: Localized store listings

**Files:** Create `docs/store-listing/{en,es,fr,de,it,ar}.md`.

- [ ] **Step 1: Write `docs/store-listing/en.md`** verbatim from the live public
      Firefox Add-ons listing — name, summary, and the full description
      (intro, SUPPORTED MEDIA, CONTROLS, NICE TOUCHES, SETTINGS, PRIVACY) as
      captured in the design spec.

- [ ] **Step 2: Translate into `es/fr/de/it/ar`** — one file each, same section
      structure, ready to paste into the per-locale listing fields of the
      Firefox Add-ons and Chrome dashboards. `ar.md` is RTL copy. Keep the brand
      name untranslated. Add a one-line header note: "Machine-drafted; review by
      a native speaker recommended before publishing."

- [ ] **Step 3: Format check + commit**

```bash
npx prettier --check docs/store-listing
git add docs/store-listing
git commit -m "docs(store-listing): localized listing copy for es/fr/de/it/ar [skip ci]"
```

---

### Task 11: Update user-facing docs + flag real-browser verification

**Files:** Modify `README.md` (Status: note localization), `NEXT_STEP.md`
(verification flag).

- [ ] **Step 1:** Add a "Languages" note to `README.md` (English, Spanish,
      French, German, Italian, Arabic; auto-selected from the browser).

- [ ] **Step 2:** Add to `NEXT_STEP.md` under "Needs a real-browser confirm":

> - **Localization + RTL** — set the browser UI language to Arabic and confirm
>   in logged-in Firefox + Chrome: overlay + options strings are translated, the
>   layout mirrors correctly (control rail, counter, panels), the byline's LTR
>   tokens (u/author, r/sub, domain, W×H) read correctly, and nothing clips.
>   Repeat a spot-check for es/fr/de/it. Unit tests cover catalog integrity and
>   English output only.

- [ ] **Step 3: Commit**

```bash
git add README.md NEXT_STEP.md
git commit -m "docs: note localization + flag RTL real-browser verification [skip ci]"
```

---

### Task 12: Full green-bar gate

- [ ] **Step 1: Regenerate locales (in case any catalog changed)**

Run: `npm run locales`

- [ ] **Step 2: Run the complete gate**

Run the project's full gate via the verify-gate skill (or directly):

Run: `npm run typecheck`
Run: `npm run lint`
Run: `npm run format`
Run: `npm test`
Run: `npm run build`
Run: `npm run webext:lint`
Expected: all PASS. Fix anything red before declaring done.

- [ ] **Step 3:** If the working tree has uncommitted formatting changes from the
      gate, review `git diff`, then commit:

```bash
git add -A
git commit -m "chore(i18n): green-bar gate"
```

- [ ] **Step 4: Stop.** Do not `git push` — report results and the flagged
      real-browser verification, and let the user decide on pushing/release
      (version bump to 1.1.0 is a separate, user-triggered step per
      `NEXT_STEP.md`).

```

```

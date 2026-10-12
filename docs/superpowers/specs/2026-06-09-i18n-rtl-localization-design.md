# i18n + RTL Localization (v1.1) — Design

Localize the extension into English, Spanish, French, German, Italian, and
Arabic, with full right-to-left (RTL) support. Arabic is ~25% of installs, so
RTL is a first-class requirement, not a stretch goal.

The work splits into three tiers:

1. **Store-listing localization** — translate the public store copy (per-locale
   fields in the Firefox Add-ons and Chrome dashboards).
2. **Make the extension localizable** — i18n infrastructure + extract all UI
   strings + full RTL.
3. **Ship the languages** — locale catalogs for es/fr/de/it/ar.

**Ownership:** this design produces everything, including the foreign-language
text. All infrastructure, the complete English catalog, full RTL, and the
es/fr/de/it/ar translations (both UI catalogs and store listings) are delivered
here. Translations are machine-drafted (Modern Standard Arabic for `ar`) and
flagged for a recommended native-speaker review pass; English fallback covers
any key left untranslated.

## Goals

- English UI behaves exactly as it does today (no visible change for en users).
- Browser auto-selects the locale from its UI language; no in-app picker.
- Arabic renders correctly: translated text **and** mirrored layout.
- Adding or editing a language is a content-only edit (one JSON file), not code.
- Translation rot is caught mechanically (key-parity tests across locales).

## Non-goals (v1.1)

- In-app language override / picker (YAGNI — follows browser UI language).
- Arabic-Indic numerals — Western digits everywhere for now.
- Mirroring arrow-key semantics in RTL — arrows stay spatial (Left = previous,
  Right = next) in all locales.
- Translating the brand name "Reddit Slideshow Spectacular!" (it is the
  wordmark; the inline-SVG wordmark stays LTR).
- RTL for non-Arabic RTL languages (he/fa/ur) — the direction helper supports
  them, but only `ar` ships.

## Architecture

**Approach A: native `browser.i18n` catalogs + a thin translator injected into
the agnostic core.**

The `lib/` core is DOM/extension-agnostic and unit-tested, so it must not call
`browser.i18n` directly. Instead:

- `_locales/<lang>/messages.json` is the standard WebExtension catalog. The
  browser auto-selects by UI language and falls back to `default_locale` (en)
  for any missing key.
- `lib/i18n.js` imports `_locales/en/messages.json` as the built-in English
  fallback and exposes the translator. Its default message getter reads that
  bundled English object, so `lib/` works standalone in unit tests with real
  English strings — no mocking.
- Entrypoints (`content.js`, `options/main.js`, `background.js`) call
  `setMessageGetter(browser.i18n.getMessage)` and `setLocale(browser.i18n.getUILanguage())`
  once at startup to switch the core onto the browser-localized catalog.

**Single source of truth:** `_locales/en/messages.json`. It is both imported by
`lib/` and read by the browser, so the English copy can never drift between code
and catalog.

**File placement (WXT):** `_locales/` goes under `public/` (`public/_locales/...`)
so WXT copies it to the extension root in both builds; `lib/i18n.js` imports the
English JSON from there. `manifest.default_locale = "en"` is set in
`wxt.config.ts`. (Verify WXT copies `public/_locales` to output root during
implementation; adjust placement if not.)

No new runtime dependencies.

## Components

### `lib/i18n.js` (new)

- `t(key, substitutions?)` → localized string; falls back to the English bundle,
  then to the key itself.
- `tn(key, count, substitutions?)` → plural-aware; selects a per-category key
  suffix via `Intl.PluralRules` for the active locale.
- `localeDirection(locale)` → `'ltr' | 'rtl'` (RTL set: `ar`, `he`, `fa`, `ur`).
- `setMessageGetter(fn)` / `setLocale(locale)` — entrypoints wire the platform in.
- Default state: English bundle, `en`, `ltr` — so tests need no setup.

### String migration

Extract hardcoded user-facing strings into keys. Sources:

- `lib/overlay-ui.js` — controls, counter, byline, end-of-show card, ARIA.
- `lib/overlay-settings.js` — gear panel.
- `lib/overlay-help.js` — keyboard/help panel.
- `lib/slides.js` — skipped-reason labels.
- `entrypoints/options/index.html` — the largest cluster (~50+ labels); the
  options script applies dynamic strings via `t()`.
- `entrypoints/background.js` — action/command titles.
- `wxt.config.ts` manifest — `description` → `__MSG_extDescription__`,
  command description → `__MSG_*__`. Name stays the literal brand string.

Estimated ~80–120 keys total. The English values are the current text verbatim,
so en behavior is unchanged.

### RTL

- Toggle `dir="rtl"` on the overlay shadow-root container and the options
  `<html>` when `localeDirection(activeLocale) === 'rtl'`.
- Convert the ~54 physical-direction rules in `assets/overlay.css` (and the
  options inline styles) to logical properties: `left/right` →
  `inset-inline-start/end`, `margin/padding-left/right` → `*-inline-start/end`,
  `text-align: left/right` → `start/end`. Flex rows mirror automatically under
  `dir=rtl`; absolutely-positioned elements need logical insets.
- **Bidi isolation:** the byline `u/author → r/subreddit · {domain} · {W}×{H}`
  embeds LTR tokens in (potentially) RTL text. Wrap each LTR token in `<bdi>` so
  it doesn't reorder/scramble within an Arabic sentence.
- Wordmark SVG and Western digits stay LTR/unchanged.

### Plurals

`chrome.i18n` has no plural support. For genuinely plural strings, store
per-category keys (`<base>_one`, `_two`, `_few`, `_many`, `_other`; full set so
Arabic is correct) and let `tn()` pick via `Intl.PluralRules`, defaulting to
`_other`. Phrase other counts to avoid grammatical plurals where possible.

### Locale catalogs (Tier 3)

`_locales/{es,fr,de,it,ar}/messages.json` are delivered fully translated, with
the **full English key set** (including plural categories) and the `description`
field carried over as context. Any key left untranslated falls back to English.
A unit test enforces key parity with `en` (no missing/extra keys, plural
categories present) so a locale can't silently drift.

### Store-listing localization (Tier 1)

`docs/store-listing/` holds one Markdown file per locale:

- `en.md` — canonical, synced from the **live public Firefox Add-ons listing**
  (name, summary, full description: SUPPORTED MEDIA / CONTROLS / NICE TOUCHES /
  SETTINGS / PRIVACY). Captured below.
- `{es,fr,de,it,ar}.md` — the English listing translated into each locale,
  ready to paste into the Firefox Add-ons and Chrome per-locale listing fields.
  `ar.md` is RTL copy.

These are documentation deliverables; the stores' localized fields are entered
manually in each dashboard.

#### Live English store copy (source)

- **Name:** Reddit Slideshow Spectacular!
- **Summary:** Turn your old or new Reddit feeds into a full-screen,
  keyboard-driven media slideshow. Free, Private, Local, No Tracking.
- **Description:** the published sections — intro, SUPPORTED MEDIA, CONTROLS, NICE
  TOUCHES, SETTINGS, PRIVACY — copied verbatim into `en.md` during build.

## Testing

Offline Vitest (CI-safe, no live session):

- Key parity: every locale has exactly the `en` key set, including plural
  categories.
- Placeholder consistency: `$N$` / named placeholders match across locales.
- `t()`: fallback chain (locale → en → key); substitution.
- `tn()`: Arabic plural categories select correctly via `Intl.PluralRules`.
- `localeDirection()`: ltr/rtl mapping.

**Needs real-browser verification (flagged, cannot be done offline):** rendered
UI and full RTL layout in logged-in Firefox + Chrome with the browser UI set to
Arabic — string coverage, no clipping, correct mirroring, byline bidi. An e2e
attempt with Chromium `--lang=ar` asserting an Arabic string + `dir="rtl"` is a
bonus, but manual confirmation is authoritative.

## Build sequence

Small commits, no push without explicit go:

1. i18n foundation (`lib/i18n.js`, `_locales/en`, manifest `default_locale`,
   entrypoint wiring) + migrate all strings to keys + unit tests. Verify en is
   visually unchanged.
2. Full RTL (logical CSS, `dir` toggle, byline bidi isolation). Verify en
   unchanged; spot-check pseudo-RTL.
3. Translated locale catalogs for es/fr/de/it/ar + key-parity tests.
4. Translated store listings under `docs/store-listing/`.
5. Flag the real-browser verification items.

## Risks / open items

- WXT `_locales` output placement — confirm in step 1.
- Translations are machine-drafted (esp. Arabic MSA) and should get a
  native-speaker review pass before a wide release; English fallback de-risks
  any gap.
- RTL of the options page may surface layout quirks not visible offline — caught
  in real-browser verification.

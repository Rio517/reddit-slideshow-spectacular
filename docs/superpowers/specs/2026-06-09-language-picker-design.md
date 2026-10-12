# In-App Language Picker (v1.1) — Design

Add a **Language** control to the full options page so a user can override the
auto-detected UI language (and direction) without changing their browser
settings. Default behavior is unchanged: the UI still follows the browser's
language unless the user picks a specific one.

## Motivation / constraint

Today the extension localizes via native `browser.i18n`, whose `getMessage`
locale is hard-locked to the **browser's** UI language and cannot be overridden
at runtime (confirmed during RTL verification: `--lang` flips the renderer's
`getUILanguage()` and thus our direction logic, but `getMessage` stays on the
browser app locale). An in-app override therefore requires the UI to read
strings from **bundled catalogs** keyed to a chosen locale, instead of from
`browser.i18n`.

## Bundled catalogs and locale resolution

Bundle all six catalogs and resolve the active locale from a setting.

- **`lib/i18n.js`** imports all six `locales/{en,es,fr,de,it,ar}.json` into a
  map. The default message getter reads `catalogs[activeLocale]`, falling back
  to the English entry per key, then to the key itself. So `setLocale(locale)`
  now switches **strings + direction + plurals** together (previously it set
  only direction/plurals; strings came from the injected `browser.i18n` getter).
  `setMessageGetter` is retained for test injection but the app no longer needs
  it.
- **Locale resolution:** a pure helper `resolveLocale(setting, uiLang)` returns
  one of the six supported locales. `setting === "auto"` → `uiLang` reduced to
  its primary subtag and matched against the supported set (e.g. `en-GB`→`en`,
  `ar`→`ar`), falling back to `en` when unsupported (e.g. `pl`→`en`). Otherwise
  the explicit choice is returned (validated).
- **Entrypoints** read the `locale` setting, compute
  `resolveLocale(setting.locale, browser.i18n.getUILanguage())`, and call
  `setLocale(resolved)`. `browser.i18n` is **no longer used for UI strings**.
- **Manifest** localization (`__MSG_extDescription__` / `__MSG_actionTitle__`
  via `_locales`) is unchanged — it is browser-locale-driven and cannot follow an
  in-app override; that is correct and expected for the about-page name/description.

This also makes Arabic (and any locale) verifiable in-app by simply selecting it
— no `--lang` headless workarounds.

## Language setting

In `lib/settings.js`:

- Add `locale` to the `Settings` typedef and to `DEFAULT_SETTINGS` as
  `"auto"`.
- Add `export const UI_LOCALES = ["auto", "en", "es", "fr", "de", "it", "ar"];`
- Validate in `normalizeSettings`: keep `input.locale` if it's a string in
  `UI_LOCALES`, else `DEFAULT_SETTINGS.locale`.

Stored in `browser.storage.local` like every other setting; no new storage
mechanism.

## Language picker UI

A **Language** row in the full options page (`entrypoints/options/`), **not** the
in-overlay gear panel — language is a set-once, app-level choice, and the gear
stays focused on playback.

- A `<select>` whose options are **Automatic** (labeled in the active UI
  language, via a catalog key) plus each language in its **own script**:
  English, Español, Français, Deutsch, Italiano, العربية. Option values are the
  `UI_LOCALES` strings.
- On change: `saveSettings({ locale })`, then re-resolve and
  `localizeDocument(document, resolved)` so the options page re-translates and
  flips `<html dir>` **live**. (The language-name option labels stay in their own
  script — they are not `data-i18n` keys.)

## Live-apply behavior

- **Options page:** re-localizes immediately on change (strings + direction).
- **Overlay:** applies on the **next slideshow start**, matching the existing
  "settings apply the next time you start a slideshow" model. `content.js` reads
  the `locale` setting at init and resolves it before the first `createOverlay`;
  its existing `browser.storage.onChanged` listener re-resolves and calls
  `setLocale(resolved)` so a change made mid-session takes effect on the next
  start. Live-retranslating an already-open overlay is out of scope (not worth
  the complexity).

## Components / files

- `lib/settings.js` — `locale` setting + `UI_LOCALES` + normalization.
- `lib/i18n.js` — bundle the six catalogs; make the default getter locale-aware;
  add `resolveLocale(setting, uiLang)` and a `supportedLocales` export.
- `entrypoints/content.js` — resolve from settings; `setLocale(resolved)` at init
  and on storage change (replaces the `browser.i18n.getMessage` wiring).
- `entrypoints/options/index.html` — the Language `<select>` row.
- `entrypoints/options/main.js` — populate/bind the select; on change save +
  re-localize live.
- `lib/i18n-dom.js` — `localizeDocument(doc, locale)` already takes a locale; no
  change beyond being called with the resolved locale.

## Testing

Offline (Vitest):

- `normalizeSettings` keeps valid `locale` values and rejects junk → `"auto"`.
- `resolveLocale`: `"auto"`+`en-US`→`en`; `"auto"`+`ar`→`rtl` locale `ar`;
  `"auto"`+unsupported→`en`; explicit `"de"`→`de`; junk→`en`.
- The bundled getter: `setLocale("ar")` then `t("uiClose")` returns the Arabic
  message; `setLocale("fr")` returns French; an unknown key falls back to English
  then the key.
- Options page: changing the select saves `locale` and re-localizes the document
  (assert `documentElement.dir` flips for `ar` and a `[data-i18n]` label changes
  language).

**Needs a real-browser confirm (lighter now):** pick each language in the options
page and confirm the page + a fresh slideshow render correctly, Arabic RTL
included. The picker removes the need for browser-language juggling.

## Non-goals

- Live retranslation of an already-open overlay (applies next start).
- Adding languages beyond the existing six.
- Per-site or per-feed locale.
- Localizing the manifest name/description to the in-app override (stays
  browser-driven via `_locales`).

## Risks

- **Bundle size:** importing five more catalogs adds ~30–40 KB to the content and
  options bundles. Acceptable for the feature; the catalogs are small JSON.
- **Test updates:** the existing `tn` "falls back to `_other`" test asserted
  English output under `setLocale("ar")` because only English was bundled in the
  old getter. With all catalogs bundled, that path now returns Arabic — update
  the test to assert the Arabic `_other` form (the plural-category fallback being
  tested is unchanged; only the language of the asserted string changes).

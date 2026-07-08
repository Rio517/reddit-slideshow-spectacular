# Configurable trigger shortcut + lighter meta text

## Overview

Two independent changes:

1. **Configurable trigger shortcut.** The slideshow trigger (`_execute_action`,
   default `Alt+Shift+S`) becomes user-configurable from the options page.
2. **Lighter meta text.** The post title and the dimensions/source line drawn
   over the image switch to `#ddd` for readability.

## 1. Configurable trigger shortcut

### Source of truth

The binding lives in the browser's command system, not in `settings.js`. The
options page reads the current binding live via
`browser.commands.getAll()` and never stores a copy — no new setting, no sync
problem.

### Options page UI

A new "Keyboard shortcut" section in `entrypoints/options/index.html` +
`main.js`, below the existing settings:

- **Current binding** for `_execute_action`, read via `commands.getAll()`
  (works on both browsers).
- **Firefox** — feature-detected by the presence of `browser.commands.update`:
  a recorder input. Focusing it and pressing a combo normalizes the
  `KeyboardEvent` into commands-API format (`Alt+Shift+S` style), validates
  it, and calls `commands.update({ name: "_execute_action", shortcut })`. A
  "Reset to default" button calls `commands.reset("_execute_action")`.
- **Chrome** — no `commands.update`: show the current binding plus a button
  that opens `chrome://extensions/shortcuts` via `tabs.create`, which is the
  only place Chrome allows rebinding.

All labels go through the existing `_locales` i18n messages, translated for
every supported locale.

### Shortcut normalization/validation (pure module)

New `lib/shortcut.js`:

- `eventToShortcut(event)` — maps a `KeyboardEvent` to the commands-API
  string: modifiers in canonical order (`Ctrl`/`Alt`/`Command`/`MacCtrl` +
  optional `Shift`), key normalized (letters upper-cased, `Comma`, `Period`,
  `Home`, arrows as `Up`/`Down`/`Left`/`Right`, `F1`–`F12`). Returns `null`
  for combos the API rejects (media keys are deliberately unsupported —
  global media controls are a poor fit for a page-scoped trigger).
- Validation is folded into `eventToShortcut` (the recorder is the only
  producer): exactly one primary modifier (except function keys, which may
  be bare), a valid key, `Shift` only as secondary.

Platform note: on macOS the recorder maps `metaKey` to `Command` and
`ctrlKey` to `MacCtrl`, per the commands-API spec.

### Error handling

- Invalid combo while recording → inline hint ("needs Ctrl/Alt + a key"),
  binding unchanged.
- `commands.update()` rejection (e.g. Firefox refuses `_execute_action`) →
  caught, inline error message, and the section falls back to the
  guidance-only presentation Chrome gets.

### Risk flagged for real-browser verification

MDN is fuzzy on whether Firefox allows `commands.update()` on the special
`_execute_action` command under MV3. The code handles rejection gracefully
(fallback above), but the happy path needs a real Firefox pass before
release. Ships gate-green with a **needs real-browser verification** flag,
alongside the pre-1.3 overlay items.

### Tests

- `tests/unit/shortcut.test.js` — normalization and validation as pure
  functions: letters, arrows, function keys, missing modifiers, Shift-only,
  macOS Command/MacCtrl mapping.
- `tests/unit/options-page.test.js` — extended: section renders the current
  binding from a mocked `browser.commands`; recorder path calls
  `commands.update` with the normalized string; reset calls
  `commands.reset`; Chrome path (no `update`) renders the link button;
  `update` rejection falls back to guidance.

## 2. Lighter meta text (#ddd)

In `assets/overlay.css`:

- `.rs-meta__title` — `color: #c1c8d3` → `color: #ddd`.
- `.rs-meta__res` and `.rs-meta__source` — `color: var(--rs-muted)` →
  `color: #ddd`.

Existing `text-shadow` stays. `--rs-muted` itself is untouched so other UI
(byline, counters, settings panel) keeps its current look.

## Out of scope

- Rebinding the in-overlay keys (arrows, Space, D/I/A, …).
- Any change to the toolbar-button trigger or the manifest default.

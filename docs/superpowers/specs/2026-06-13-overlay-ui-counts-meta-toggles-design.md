# Overlay UI: split always-show, subtle counts, idle-load spinner

## Overview

Three independent overlay refinements:

1. **Split the one "always show" toggle into two** — one pins the top-left
   **counts** (position counter + skipped badge), the other pins the bottom
   **matter** (title + byline). Today a single `alwaysShowMeta` pins both.
2. **Render the counts as subtle text** that takes the existing button
   appearance only on hover, with **no layout shift** between the two states.
3. **Show a loading spinner even when the chrome is hidden** — a small corner
   spinner that fills the gap where a hands-off autoplay load currently has no
   visible feedback.

All three are local UI/CSS/settings changes; no network or permission surface
changes. The subtle/hover styling is CSS-only and needs a real-browser check
(unit tests can't assert rendered appearance).

## 1. Settings model + migration

Split `alwaysShowMeta` into two booleans (`lib/settings.js`):

- **`alwaysShowCount`** (new) — pins the top-left cluster (`.rs-topleft`).
- **`alwaysShowMeta`** (kept, narrowed) — pins the bottom matter (`.rs-meta`:
  title + byline).

`DEFAULT_SETTINGS`: both `true` (preserves today's behavior). The `alwaysShowMeta`
JSDoc (`settings.js:11`) is reworded to "title + byline" only; a new
`alwaysShowCount` property is documented.

Migration in `normalizeSettings` (`settings.js:195`): an explicit stored
`alwaysShowCount` wins; otherwise it **carries over the old `alwaysShowMeta`**;
otherwise the default. So a user who turned the single toggle off keeps both off:

```js
alwaysShowCount: boolOr(
  input.alwaysShowCount,
  boolOr(input.alwaysShowMeta, DEFAULT_SETTINGS.alwaysShowCount),
),
alwaysShowMeta: boolOr(input.alwaysShowMeta, DEFAULT_SETTINGS.alwaysShowMeta),
```

(`boolOr(value, fallback)` returns `value` when it's a boolean, else `fallback`.)

## 2. Independent pinning in the overlay

`createOverlay`'s `setSettings` (`lib/overlay-ui.js:1572`) replaces the single
`rs-pin-meta` toggle with two:

```js
root.classList.toggle("rs-pin-count", s.alwaysShowCount);
root.classList.toggle("rs-pin-meta", s.alwaysShowMeta);
```

The combined idle-exemption rule (`assets/overlay.css:593-596`) splits in two:

```css
#reddit-slideshow-root.rs-pin-count.rs-idle .rs-topleft {
  opacity: 1;
}
#reddit-slideshow-root.rs-pin-meta.rs-idle .rs-meta {
  opacity: 1;
}
```

The base idle fade (`overlay.css:578-584`, which fades `.rs-controls`,
`.rs-close-top`, `.rs-meta`, `.rs-topleft`) is unchanged; pinned clusters stay
non-interactive while idle (a mousemove wakes them), as today.

## 3. Counts as subtle text, button look on hover, no reposition

Applies to the **position counter** (`.rs-meta__counter`, base style
`overlay.css:425`, interaction `:1360`) and the **skipped badge** (`.rs-skipped`,
`:1063`). Both are pills at rest today. Move the visible chrome to `:hover`,
keeping box geometry identical so nothing shifts:

- **Rest:** `background: transparent; border-color: transparent;
color: var(--rs-muted)` — keep the existing `padding: 4px 9px` and
  `border: 1px solid` (transparent), so the resting box equals the hover box.
- **Hover:** restore the current pill — `background` + `border-color` + accent
  text (counter) / danger tint (skipped). Only color/background transition;
  `padding` and `border-width` never change → zero layout shift.

Preserve `.rs-meta__counter:empty { opacity: 0 }` and the `--pulse` animation.
The skipped badge keeps `[hidden]` (it only appears once something is skipped).

## 4. Small corner spinner for the idle-hidden load

**The gap:** during hands-off autoplay, the centered spinner is suppressed over
a held frame (`overlay-ui.js:1247`, `loading.hidden = outgoing && !manual`) and
the only feedback is the title-row spinner (`.rs-meta__spinner`), which fades
with the idle chrome. So chrome-hidden + next media loading = no feedback.

**Fix:** a small dedicated spinner `.rs-loaddot`, created in `createOverlay`
near the other status elements, appended into `root`, **not** listed in the
idle-fade rule. It reuses the `rs-spin` keyframes (see `.rs-loading span`,
`overlay.css:968`) at a small size, pinned `bottom` / `inset-inline-end`
(alongside where `.rs-buffering` sits).

Drive it from the existing title-spinner lifecycle so it tracks "media loading":
`showTitleSpinner` (`overlay-ui.js:682`) also adds `rs-loaddot--on`;
`hideTitleSpinner` (`:685`) removes it. CSS reveals it only when the chrome is
hidden **and** the meta isn't pinned (so the visible title spinner already
covers the other cases — no double spinner):

```css
.rs-loaddot {
  opacity: 0;
  transition: opacity 0.2s ease;
}
#reddit-slideshow-root.rs-idle:not(.rs-pin-meta) .rs-loaddot--on {
  opacity: 1;
}
```

It lives permanently in the DOM at `opacity: 0`; the `--on` class plus the
idle-not-pinned selector are the only things that reveal it (no `hidden`
attribute toggling). It shares the bottom-inline-end corner with `.rs-buffering`,
which is fine — buffering (a stalled _current_ video) and loading (the _next_
media arriving) don't co-occur in practice.

Hand-off: chrome visible → title spinner (unchanged); idle + meta pinned →
title spinner stays opaque (unchanged); idle + meta hidden → corner spinner.
Video buffering (`.rs-buffering`) already survives idle, so this only fills the
media-load gap. Clear `rs-loaddot--on` in `hide()` (`:1482`) alongside
`hideTitleSpinner()` so a stale spinner can't persist across opens.

## 5. Settings UI + i18n

- **Overlay settings panel** (`lib/overlay-settings.js:93`): the one
  `alwaysShowMeta` checkbox becomes two — add an `alwaysShowCount` checkbox; both
  read from and write the corresponding setting (mirror the existing pattern at
  `:93` and the `setValues` reflect at `:129`).
- **Options page**: add a second checkbox in `entrypoints/options/index.html`
  (mirror `#alwaysShowMeta` at `:481`) and wire it in
  `entrypoints/options/main.js` (mirror `:39`, `:112`, `:136`, `:165`).
- **i18n** (`locales/*.json`, all six): add `settingsAlwaysShowCount` ("Always
  show the position counter and skipped count") and reword
  `settingsAlwaysShowMeta` to "Always show the title and byline." Run
  `npm run locales` to regenerate `public/_locales`.

## 6. Testing

- **`tests/unit/settings.test.js`** — `alwaysShowCount` default is `true`; the
  carry-over migration (stored old `alwaysShowMeta: false` and no
  `alwaysShowCount` → `alwaysShowCount` is `false`); an explicit
  `alwaysShowCount` overrides the carried value.
- **`tests/unit/overlay-ui.test.js`** — `setSettings` toggles `rs-pin-count` and
  `rs-pin-meta` independently (all four combinations of the two booleans);
  `.rs-loaddot--on` is added on `showTitleSpinner` and removed on
  `hideTitleSpinner` / `hide()`.
- **`tests/unit/overlay-settings.test.js`** — the new checkbox reflects
  `alwaysShowCount` and fires `onChange({ alwaysShowCount })`.
- **`tests/unit/options-page.test.js`** — the options-page checkbox loads from
  and persists `alwaysShowCount`.
- **i18n catalog** stays balanced (covered once the key is in all six locales +
  `npm run locales`).
- The subtle-text/hover counts and the corner spinner's rendered visibility are
  CSS — verify in a real browser (idle the chrome over a slow-loading slide;
  hover the counts).

## Out of scope

- Renaming `alwaysShowMeta` (kept narrowed, to avoid migration churn).
- Any change to the controls rail, the centered/branded loading splash, or video
  buffering behavior.

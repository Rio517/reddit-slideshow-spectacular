# JavaScript Type Management

Date: 2026-05-31
Status: Active

## Purpose

This codebase is plain JavaScript (ESM) typed via JSDoc and checked with
`tsc --noEmit` (`npm run typecheck`). There are **no `.ts` source files by
design** - the only TypeScript file is `wxt.config.ts`. This document is the
standing guide for how we manage types here: where shared types live, how we
type the Reddit listing JSON, which `tsconfig` strictness flags we run, and the
conventions that keep `any` out of the codebase.

Read this before adding new typed code or touching the media-resolution
pipeline, so the same type decisions are not re-derived each time.

## Source Summary

- TypeScript 5.5 release notes - the `@import` JSDoc tag:
  https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-5.html
- TypeScript JSDoc reference (supported tags/syntax):
  https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html
- TypeScript type-checking JavaScript files (`checkJs`/`allowJs`):
  https://www.typescriptlang.org/docs/handbook/type-checking-javascript-files.html
- `tsconfig` reference (strict family + extra flags):
  https://www.typescriptlang.org/tsconfig/
- `noUncheckedIndexedAccess`:
  https://www.typescriptlang.org/tsconfig/noUncheckedIndexedAccess.html

## Baseline (what we already do well)

- `tsconfig.json` sets `checkJs`, `allowJs`, `noEmit`, and **`strict: true`**;
  the WXT base (`.wxt/tsconfig.json`) also sets `strict` + `skipLibCheck`. So
  `noImplicitAny`, `strictNullChecks`, `useUnknownInCatchVariables`, etc. are
  already on. Catch blocks (`catch {}`), `?? undefined` fallbacks, and the
  pervasive `?.` guards reflect this.
- Domain types are already modeled as `@typedef`s next to their owning module:
  `Slide` (`lib/slides.js`), `Settings` (`lib/settings.js`), `ListingSummary`
  (`lib/reddit-listing.js`), `QueuePage` (`lib/queue.js`), `RedgifsMedia`
  (`lib/redgifs.js`).
- `typescript` is `^5.5.0`, so the modern `@import` JSDoc tag is available.

The remaining `any` debt is concentrated at the **message-router boundary**
(`background-router.js`, `entrypoints/content.js`) and a few **injected-dep
signatures** in `session.js`. The **Reddit listing JSON** is typed via
`lib/reddit-types.js`, as described below.

## Typing the Reddit listing JSON

The media resolvers in `lib/slides.js` are the part most likely to break
silently when Reddit changes its JSON shape, so the listing shapes are typed.

### Where the types live

Listing types live in a **types-only module `lib/reddit-types.js`** - a `.js`
file containing only `@typedef`s plus a trailing `export {};` so it stays an ES
module. Do **not** use a `.d.ts`: that would be the codebase's only non-JS,
non-WXT source file and breaks the "plain JS by design" invariant.

Consume them with the TS 5.5 `@import` tag rather than inline `import("...")`:

```js
/** @import { RedditListing, RedditPost } from "./reddit-types.js" */
```

These tags affect type-checking only; they emit nothing at runtime.

### How to model the shape

Model **everything as optional** and narrow at the use site. The resolvers
already probe defensively (`post.crosspost_parent_list?.[0] ?? post`,
`meta?.status !== "valid"`, `preview?.images?.[0]?.source`), so a strict
"required fields" typedef would fight the existing guard style and force `!`
everywhere. Optional-everywhere matches reality (crossposts, deleted gallery
items, missing previews) and keeps `tsc` green against the existing code.

Type only the **subset of fields the resolvers actually read** - this is not the
full Reddit schema. The shape below is grounded in
`tests/fixtures/reddit-json/*.json`:

```js
/**
 * @typedef {object} RedditListing
 * @property {{ children?: RedditChild[], after?: string | null, before?: string | null }} [data]
 *
 * @typedef {object} RedditChild
 * @property {RedditPost} [data]
 *
 * @typedef {object} RedditPost
 * @property {string} [name]                      Fullname, e.g. "t3_abc".
 * @property {string} [title]
 * @property {string} [permalink]                 Relative path.
 * @property {boolean} [over_18]
 * @property {string} [url]
 * @property {string} [url_overridden_by_dest]
 * @property {string} [post_hint]                 e.g. "image", "hosted:video".
 * @property {boolean} [is_gallery]
 * @property {RedditGalleryData} [gallery_data]
 * @property {Record<string, RedditMediaMetaEntry>} [media_metadata]
 * @property {RedditMedia} [media]
 * @property {RedditMedia} [secure_media]
 * @property {RedditPreview} [preview]
 * @property {RedditPost[]} [crosspost_parent_list]
 *
 * @typedef {object} RedditGalleryData
 * @property {RedditGalleryItem[]} [items]
 *
 * @typedef {object} RedditGalleryItem
 * @property {string} [media_id]
 * @property {boolean} [is_deleted]
 *
 * @typedef {object} RedditMediaMetaEntry
 * @property {string} [status]                    "valid" when usable.
 * @property {{ u?: string, x?: number, y?: number }} [s]   Source image.
 *
 * @typedef {object} RedditMedia
 * @property {string} [type]                      e.g. "redgifs.com".
 * @property {RedditVideo} [reddit_video]
 * @property {{ width?: number, height?: number }} [oembed]
 *
 * @typedef {object} RedditVideo
 * @property {string} [fallback_url]
 * @property {string} [dash_url]
 * @property {string} [hls_url]
 * @property {number} [duration]
 * @property {number} [width]
 * @property {number} [height]
 * @property {boolean} [is_gif]
 * @property {boolean} [has_audio]
 *
 * @typedef {object} RedditPreview
 * @property {Array<{ source?: { url?: string, width?: number, height?: number } }>} [images]
 */
export {};
```

### Threading it through

- `slidesFromListing` → `@param {RedditListing} listing`.
- `slidesFromPost` → `@param {RedditPost | undefined} post`.
- `imageSlides` / `gallerySlides` / `redditVideoSlides` / `redgifsSlides` →
  `media` and `context` are both `RedditPost` (media is where the bytes live,
  context is the post the user sees - crossposts split these).
- The `is*Post` / `redditVideoOf` / `filenameHint` helpers →
  `@param {RedditPost | undefined}` (they all already `?.`-guard).
- `summarizeListing` (`reddit-listing.js`) and `buildQueuePage` (`queue.js`) →
  `@param {RedditListing} listing`; `fetchListingJson` returns
  `Promise<{ listing: RedditListing, summary: ListingSummary }>`.

Practical rule: when Reddit adds a field a resolver needs to read, add it to
`reddit-types.js` as optional - never reach for `any` to dodge a missing field.

## tsconfig strictness

`strict: true` is on. The remaining safe progression, in order:

1. **`noUncheckedIndexedAccess`** - adds `| undefined` to array/index access.
   The code is already written for it (`children?.[0]`,
   `media_metadata?.[item?.media_id]`, `match[1]` in `redgifsId`). Watch
   `entrypoints/options/main.js`: the `panZoomInputs[id]` reads and the
   `PAN_ZOOM_RANGES.map(([id]) => ...)` destructuring become `| undefined` and
   may need a guard. Do this alongside the Reddit typedefs.

2. **`exactOptionalPropertyTypes`** - distinguishes `prop?: T` from
   `prop: T | undefined`. This one needs prep: several `Slide` builders set
   optional props explicitly to `undefined` (`mimeType: mimeTypeFromUrl(url)`,
   `durationSeconds: ... : undefined`, `sourceWidth: previewSource?.width`).
   Before enabling, widen those `Slide`/`RedgifsMedia`/`ListingSummary`
   properties to explicit `| undefined` (e.g. `@property {number | undefined}
sourceWidth` rather than `@property {number} [sourceWidth]`). Highest churn
   of the three - land it after step 1 is green.

3. **`noPropertyAccessFromIndexSignature`** - low value here (only
   `media_metadata` and the `settings[id]` access are affected). Optional.

Target after step 1:

```jsonc
"compilerOptions": {
  "checkJs": true,
  "allowJs": true,
  "noEmit": true,
  "strict": true,
  "noUncheckedIndexedAccess": true
  // add "exactOptionalPropertyTypes": true once Slide optionals are widened
}
```

## The `requiredElement` helper for the options page

`entrypoints/options/main.js` repeats
`/** @type {HTMLInputElement} */ (document.querySelector("#x"))` ~13 times.
Those casts **lie**: `querySelector` returns `Element | null`, and the cast
silently asserts both non-null and the right subclass. A renamed id in
`index.html` then fails at runtime as `undefined.value`, with no type help.

Use a typed helper that does a real null-check and a real `instanceof` narrow
(put it in a small `lib/dom.js`):

```js
/**
 * Look up a required element and assert its concrete type. Throws if missing or
 * the wrong kind, so a renamed id fails loudly at startup instead of as a later
 * `undefined.value`.
 *
 * @template {Element} T
 * @param {string} selector
 * @param {new () => T} ctor   e.g. HTMLInputElement
 * @param {ParentNode} [root]
 * @returns {T}
 */
export function requiredElement(selector, ctor, root = document) {
  const el = root.querySelector(selector);
  if (!(el instanceof ctor)) {
    throw new Error(
      `Expected ${ctor.name} for "${selector}", got ${el?.constructor.name ?? "null"}`,
    );
  }
  return el;
}
```

```js
const timerSlider = requiredElement("#imageTimerSeconds", HTMLInputElement);
const maxLoadWait = requiredElement("#maxLoadWaitSeconds", HTMLSelectElement);
const panZoomCard = requiredElement("#panZoomCard", HTMLElement);
```

Note: passing a constructor like `HTMLInputElement` is a **runtime** reference,
so the DOM element constructors must be added to the `globals` block in
`eslint.config.js` (`HTMLInputElement`, `HTMLOutputElement`, `HTMLSelectElement`,
`HTMLElement`). Today's casts dodge this because they live in comments, not code.

## General type-management conventions

- **Type the message-router boundary.** `background-router.js` and
  `entrypoints/content.js` are the trust boundary and the second-biggest `any`
  cluster. Define a discriminated union for messages and a typed response shape
  (e.g. in `lib/messages.js`):

  ```js
  /**
   * @typedef {{ type: "slideshow.requestPage", payload: { pageUrl: string, after?: string } }
   *   | { type: "slideshow.fetchImage", payload: { url: string } }
   *   | { type: "slideshow.fetchMedia", payload: { url: string } }
   *   | { type: "slideshow.openOptions" }} SlideshowMessage
   */
  ```

  Keep the runtime guards (`typeof pageUrl !== "string"`) - the wire is
  untrusted. Types are additive validation, not a replacement. A typed response
  lets `session.js` drop `requestPage: (after?) => Promise<any>`.

- **No `any`, no `@ts-ignore`.** There are currently zero `@ts-ignore` /
  `@ts-expect-error` in the tree - keep it that way. If a suppression is ever
  truly needed, prefer `@ts-expect-error` (it fails once the underlying error is
  fixed, so it can't rot). Type third-party JSON (e.g. the Redgifs auth/gif
  responses in `redgifs.js`) with a small typedef rather than reading off `any`.
  Consider an `eslint-plugin-jsdoc` rule (`no-undefined-types`, `valid-types`)
  as a guardrail against typedef drift.

- **Narrow with guards, don't cast.** Prefer `instanceof` / `typeof` / `in`
  checks (as `requiredElement` and `isHttpUrl` do) over `/** @type {X} */`
  assertions. A cast asserts; a guard proves.

- **Const-correctness and cheap immutability.** Already strong: `const`
  throughout, `DEFAULT_SETTINGS` is `Object.freeze`d, and `prepare()` in
  `session.js` returns `{ ...p, slides }` instead of mutating. Keep new code in
  this shape; reach for `readonly`-style `@type {readonly T[]}` on params you
  don't mutate when it documents intent cheaply.

- **Error handling.** The existing pattern is the model: structured error
  classes that carry context (`RedditListingFetchError` with `jsonUrl`/`status`),
  tagged rejections (`withTimeout`), and deliberate fire-and-forget `catch {}`
  blocks with a one-line "why" comment. Resolvers return fallback slides instead
  of throwing into the UI.

## Suggested order of work

1. `lib/reddit-types.js` + thread through `slides.js` / `reddit-listing.js` /
   `queue.js` (highest value; kills the core `any` cluster).
2. Enable `noUncheckedIndexedAccess` alongside it.
3. `requiredElement` helper + the missing DOM globals in `eslint.config.js`.
4. Message-union + `session.js` injected-dep types.
5. Enable `exactOptionalPropertyTypes` after widening `Slide` optionals.
6. ESLint guardrail against new `any` / typedef drift; type the Redgifs JSON.

Each step keeps `npm run typecheck` green and is its own small commit.

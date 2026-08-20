# ADR 0020: Download folder as a subfolder setting, not a folder picker

Date: 2026-08-20
Status: Accepted

## Context

Users want saved media (ADR 0017) to land somewhere tidier than the top of the
browser's Downloads folder - ideally a folder of their choosing, picked once
via a browse dialog and remembered. The question was what the WebExtension
platform actually allows.

Research findings (2026-08):

- **`downloads.download()` accepts only a path relative to the browser's
  Downloads directory.** Absolute paths, empty paths, and `..` back-references
  are errors, in both Chrome and Firefox. The only picker the API offers is
  `saveAs: true` - the OS Save As dialog, shown on **every** download; there is
  no "pick once and remember" form of it.
- **The File System Access API (`showDirectoryPicker()`) is the only real
  folder-browse API, and it is not usable here.** Firefox - the primary
  browser - does not implement it at all (it ships only the sandboxed
  origin-private file system, whose files are invisible in Finder/Explorer;
  the community workaround extension requires a separately installed native
  helper app). On Chrome it exists, and Chrome 122 added an "Allow on every
  visit" persistent grant, but that is documented for websites and installed
  web apps; for extensions the grant is auto-revoked on every extension
  update (re-prompting users each update), the request for extension-persistent
  grants has been open since 2023 (crbug 1415150), and the picker is broken in
  some extension contexts.
- **File System Access saving would also break this project's permission
  model.** Writing via a directory handle means the extension fetches the media
  bytes itself, and background fetches only work cross-origin for hosts under
  `host_permissions` - deliberately scoped here (ADR 0004; no all-URLs). Image
  posts legitimately link to arbitrary hosts; `downloads.download` handles them
  because the browser's own network stack does the fetching. An FSA-based saver
  would fail for any host off the allowlist or force the all-URLs permission
  this project refuses.
- **The ecosystem confirms the ceiling.** Dedicated download-organizer
  extensions (Downloads Router, RegExp Download Organizer) all work the same
  way: rule-based relative paths under Downloads. None browse outside it.

## Decision

Add a **`downloadSubfolder` setting**: a plain text field on the options page
naming a folder (nesting allowed, e.g. `reddit/pics`) **inside the browser's
Downloads folder**. Empty - the default - saves straight into Downloads. No
folder picker, and no `saveAs` prompt.

- The value is sanitized on save (`sanitizeDownloadSubfolder` in
  `lib/settings.js`): split on both separators, drop traversal/empty/dot-only
  segments, strip characters and dot affixes Windows filesystems reject.
- The background router re-sanitizes the stored value at the download boundary
  (defense in depth against a corrupted stored value) and prefixes it to the
  already-basenamed filename from ADR 0017. If the settings read fails, the
  download falls back to the plain Downloads folder rather than losing the
  save.
- The options field writes back the sanitized value on change, so it always
  shows what will actually be used.

Power-user escape hatches, deliberately left to the user rather than the
extension: change the browser-wide download location in browser settings, or
symlink a folder inside Downloads to anywhere on disk and name the symlink in
the setting.

## Consequences

Benefits:

- Saved media can be organized without a per-download dialog, with the same
  behavior on Firefox and Chrome, and no new permissions.
- The two-layer sanitization keeps the existing guarantee: nothing the
  extension writes can escape the Downloads directory.

Costs / risks:

- A typed name is less discoverable than a browse dialog; the field's hint and
  placeholder carry that explanation.
- The folder is confined to Downloads. If the platform gap ever closes
  (extension-persistent File System Access grants on Chrome AND Firefox
  support), a real picker would still conflict with the scoped-host fetch
  model above - revisit only with that constraint in mind.

## Alternatives Considered

- **`saveAs: true` (OS Save As dialog):** the user can pick any folder, but is
  prompted on every single download. Rejected as the default; not offered as a
  toggle because the owner explicitly preferred a set-once setting.
- **File System Access API picker:** rejected per the research above - absent
  on Firefox, unreliable persistence for Chrome extensions, and incompatible
  with the scoped host permissions the download path relies on.
- **A fixed, non-configurable `Reddit Slideshow/` subfolder:** simpler, but a
  text field costs the same one settings row and lets users match their own
  folder scheme.

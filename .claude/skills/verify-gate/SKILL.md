---
name: verify-gate
description: Use before declaring any code change complete and before committing. Runs the project's full green-bar gate - typecheck, lint, format, unit tests, both browser builds, and the Mozilla web-ext lint - so "done" always means the whole suite passed, not a subset.
---

# Verify Gate

The single source of truth for "is this change actually done." Run the **whole**
gate before claiming a code change works and before any commit. A partial run
(e.g. tests only) is not "done."

## Commands, in order

Run each as its **own Bash call** - `AGENTS.md` requires one logical operation
per call, so `&&`-chaining is blocked. (If you must combine, put the chain
inside a single `bash -c "..."`.) `webext:lint` reads the Firefox build output,
so the build steps must run before it.

1. `npm run typecheck` - `tsc --noEmit` over the JSDoc-typed JS. Expect no output.
2. `npm run lint` - ESLint (includes `no-unsanitized` DOM checks). Expect no output.
3. `npm run format` - Prettier `--check`. If it fails, fix with `npx prettier --write .`, then re-run.
4. `npm test` - Vitest unit suite. Expect all tests passing.
5. `npm run build` - builds BOTH targets (Firefox MV3 → `.output/firefox-mv3/`, then Chrome MV3 → `.output/chrome-mv3/`). `npm run build:firefox` / `build:chrome` build one.
6. `npm run webext:lint` - Mozilla addons-linter on the built Firefox output. Expect `0 errors, 0 notices, 0 warnings`.

## What "green" means

- typecheck / lint / format: no error output, exit 0.
- tests: every test passes (no `failed`).
- builds: both finish with a `Built extension` success line.
- web-ext: `0 errors`, `0 warnings`, `0 notices`.

Judge each step by its **exit code**, not by eyeballing output. Piping through
`tail` or `grep` masks both the failure lines and the exit status (the pipe
returns the last command's status) - a lint failure once slipped through the
gate exactly this way. When trimming output, print the status explicitly:
`bash -c 'npm run lint > /tmp/gate.log 2>&1; echo "lint: $?"'`.

## On failure

Fix the cause, then **re-run the entire gate from the top** - a fix in one step
can break an earlier one. Never report a change as done while any step is red,
and never silently skip a step. If a step is intentionally skipped, say so
explicitly and why.

## Cross-browser sanity (when the manifest or background changed)

The two builds must stay correctly divergent: Firefox emits an event page
(`background.scripts` + `browser_specific_settings`), Chrome emits a
`service_worker` with no gecko block. Spot-check after a manifest change:

- `grep -o 'service_worker\|"scripts"\|browser_specific_settings' .output/chrome-mv3/manifest.json .output/firefox-mv3/manifest.json`

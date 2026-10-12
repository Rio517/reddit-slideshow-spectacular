# Building Reddit Slideshow Spectacular! (for AMO reviewers)

This extension is built with [WXT](https://wxt.dev), which uses Vite + esbuild to
bundle and minify the production output. The same source builds both the Firefox
and Chrome packages. All source is plain, readable, JSDoc-typed JavaScript —
nothing is obfuscated, and no code is fetched, generated at build time, or
`eval`'d at runtime.

## Build environment

- **Operating system:** Linux (CI builds on Ubuntu 24.04) or macOS. No
  OS-specific steps.
- **Node.js:** 20.x LTS recommended; also builds on Node 24 (the AMO reviewer
  default). Install from <https://nodejs.org/> or with nvm:
  ```sh
  nvm install 20 && nvm use 20
  ```
- **npm:** the version bundled with Node (10 or newer). No other global tools are
  required.
- `package-lock.json` is included in this source; `npm ci` installs the exact
  pinned dependency versions from it.

## Build

From the project root:

```sh
./build.sh
```

which runs:

```sh
npm ci        # install the exact pinned dependencies
npm run zip   # WXT build + package
```

The packaged add-on is written to
`.output/reddit-slideshow-<version>-firefox.zip` — this is the file submitted to
AMO. The same command also emits the Chrome zip and a fresh sources zip under
`.output/`.

To load it for manual testing instead of packaging:

```sh
npm run build:firefox
# then about:debugging → Load Temporary Add-on → .output/firefox-mv3/manifest.json
```

## Notes for reviewers

- `postinstall` runs `wxt prepare`, which only generates local TypeScript types
  under `.wxt/` — no network access and nothing that ships in the add-on.
- `lib/wordmark-spectacular.js` is a checked-in SVG outline of the "Spectacular!"
  wordmark, traced once from the bundled Monoton font (SIL OFL). It is readable
  vector data, not minified or obfuscated.

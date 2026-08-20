import js from "@eslint/js";
import noUnsanitized from "eslint-plugin-no-unsanitized";

export default [
  {
    ignores: [
      ".wxt/**",
      ".output/**",
      "node_modules/**",
      "dist/**",
      ".claude/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.{js,ts,mjs}"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: {
        browser: "readonly",
        document: "readonly",
        fetch: "readonly",
        Response: "readonly",
        console: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        window: "readonly",
        navigator: "readonly",
        Image: "readonly",
        Event: "readonly",
        Element: "readonly",
        HTMLElement: "readonly",
        HTMLInputElement: "readonly",
        HTMLOutputElement: "readonly",
        HTMLSelectElement: "readonly",
        HTMLButtonElement: "readonly",
        AbortController: "readonly",
        Blob: "readonly",
        TextDecoder: "readonly",
        atob: "readonly",
        btoa: "readonly",
        OffscreenCanvas: "readonly",
        createImageBitmap: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        defineBackground: "readonly",
        defineContentScript: "readonly",
      },
    },
    plugins: { "no-unsanitized": noUnsanitized },
    rules: {
      "no-unsanitized/method": "error",
      "no-unsanitized/property": "error",
    },
  },
  {
    // Maintainer scripts run on Node (build, screenshot, and hero harnesses).
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        process: "readonly",
        Buffer: "readonly",
      },
    },
  },
  {
    // Tests run on Node (vitest, or the Playwright e2e runner), so they see both
    // Node and extra DOM/extension globals the source files don't reach for. The
    // e2e .mjs also runs callbacks in the browser/extension (chrome.*).
    files: ["tests/**/*.{js,mjs}"],
    languageOptions: {
      globals: {
        process: "readonly",
        DOMParser: "readonly",
        KeyboardEvent: "readonly",
        MouseEvent: "readonly",
        WheelEvent: "readonly",
        chrome: "readonly",
      },
    },
  },
];

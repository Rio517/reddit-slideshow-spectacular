import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const html = readFileSync(
  resolve(process.cwd(), "entrypoints/options/index.html"),
  "utf8",
);

const doc = new DOMParser().parseFromString(html, "text/html");

describe("options page sections", () => {
  it("groups the controls under five localized headings", () => {
    const keys = [...doc.querySelectorAll(".group__title")].map((h) =>
      h.getAttribute("data-i18n"),
    );
    expect(keys).toEqual([
      "optSectionGeneral",
      "optSectionPlayback",
      "optSectionContent",
      "optSectionDisplay",
      "optSectionDownloads",
    ]);
  });

  it("keeps every control inside a section panel", () => {
    for (const id of [
      "locale",
      "shortcutInput",
      "imageTimerSeconds",
      "transition",
      "maxLoadWaitSeconds",
      "autoplay",
      "startMuted",
      "includeNsfw",
      "dedupe",
      "contentDedup",
      "alwaysShowCount",
      "alwaysShowMeta",
      "downloadSubfolder",
    ]) {
      expect(
        doc.querySelector(`#${id}`)?.closest(".group__panel"),
        id,
      ).not.toBeNull();
    }
  });
});

describe("options page footer", () => {
  it("links to the GitHub Sponsors page", () => {
    const link = doc.querySelector(
      'a[href="https://github.com/sponsors/Rio517"]',
    );
    expect(link).not.toBeNull();
  });

  it("opens the Sponsors link as a safe external link", () => {
    const link = doc.querySelector(
      'a[href="https://github.com/sponsors/Rio517"]',
    );
    expect(link?.getAttribute("target")).toBe("_blank");
    // noopener so the external tab can't reach window.opener.
    expect(link?.getAttribute("rel") ?? "").toContain("noopener");
  });
});

describe("options page always-show toggles", () => {
  it("has separate count and meta checkboxes", () => {
    expect(doc.querySelector("#alwaysShowCount")).not.toBeNull();
    expect(doc.querySelector("#alwaysShowMeta")).not.toBeNull();
  });
});

describe("options page download folder", () => {
  it("has a text field with a localized label and hint", () => {
    const input = doc.querySelector("#downloadSubfolder");
    expect(input?.getAttribute("type")).toBe("text");
    const field = input?.closest(".field");
    expect(
      field?.querySelector('[data-i18n="optDownloadSubfolder"]'),
    ).not.toBeNull();
    expect(
      field?.querySelector('[data-i18n="optDownloadSubfolderHint"]'),
    ).not.toBeNull();
  });
});

describe("options page language picker", () => {
  it("has a language select with auto + the six locales", () => {
    const sel = doc.querySelector("#locale");
    expect(sel).not.toBeNull();
    const opts = [...(sel?.querySelectorAll("option") ?? [])].map(
      (o) => /** @type {HTMLOptionElement} */ (o).value,
    );
    expect(opts).toEqual(["auto", "en", "es", "fr", "de", "it", "ar"]);
    expect(
      sel?.querySelector('option[value="auto"]')?.getAttribute("data-i18n"),
    ).toBe("optLanguageAuto");
  });
});

describe("options page shortcut card", () => {
  it("has the shortcut recorder markup with localized labels", () => {
    expect(doc.querySelector("#shortcutValue")).not.toBeNull();
    expect(doc.querySelector("#shortcutInput")).not.toBeNull();
    expect(doc.querySelector("#shortcutReset")?.getAttribute("data-i18n")).toBe(
      "optShortcutReset",
    );
    expect(doc.querySelector("#shortcutOpen")?.getAttribute("data-i18n")).toBe(
      "optShortcutOpenBrowser",
    );
    expect(doc.querySelector("#shortcutHint")?.getAttribute("data-i18n")).toBe(
      "optShortcutHint",
    );
    expect(doc.querySelector("#shortcutError")?.textContent).toBe("");
  });

  it("associates the recorder input with its label for accessibility", () => {
    expect(doc.querySelector("#shortcutLabel")).not.toBeNull();
    expect(
      doc.querySelector("#shortcutInput")?.getAttribute("aria-labelledby"),
    ).toBe("shortcutLabel");
  });
});

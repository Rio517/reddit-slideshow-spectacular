import { afterEach, describe, expect, it } from "vitest";
import { createHelpPanel } from "../../lib/overlay-help.js";
import { setMessageGetter } from "../../lib/i18n.js";
import { version } from "../../package.json";

afterEach(() => {
  document.body.innerHTML = "";
  setMessageGetter(null);
});

function make() {
  const panel = createHelpPanel(document);
  document.body.append(panel.root);
  return panel;
}

describe("createHelpPanel", () => {
  it("shows the extension version", () => {
    const panel = make();
    expect(
      panel.root.querySelector(".rs-help-panel__version")?.textContent,
    ).toBe(`v${version}`);
  });

  it("returns a hidden labelled region", () => {
    const panel = make();
    expect(panel.root.className).toBe("rs-help-panel");
    expect(panel.root.hidden).toBe(true);
    expect(panel.root.getAttribute("role")).toBe("region");
    expect(panel.root.getAttribute("aria-label")).toMatch(/shortcuts/i);
  });

  it("has a header with a title and a close button", () => {
    const panel = make();
    expect(
      panel.root.querySelector(".rs-help-panel__title")?.textContent,
    ).toMatch(/shortcuts/i);
    const close = panel.root.querySelector(".rs-help-panel__close");
    expect(close?.getAttribute("aria-label")).toBe("Close keyboard shortcuts");
  });

  it("close button hides the panel", () => {
    const panel = make();
    panel.root.hidden = false;
    /** @type {HTMLElement} */ (
      panel.root.querySelector(".rs-help-panel__close")
    ).click();
    expect(panel.root.hidden).toBe(true);
  });

  it("lists one row per shortcut, each with a key badge and a description", () => {
    const panel = make();
    const rows = panel.root.querySelectorAll(".rs-help-panel__row");
    expect(rows.length).toBe(14);
    for (const row of rows) {
      expect(row.querySelector(".rs-help-panel__key")).not.toBeNull();
      expect(
        row.querySelector(".rs-help-panel__desc")?.textContent?.length ?? 0,
      ).toBeGreaterThan(0);
    }
  });

  it("lists the ? key that toggles this panel", () => {
    const panel = make();
    const keys = [...panel.root.querySelectorAll(".rs-help-panel__key")].map(
      (k) => k.textContent,
    );
    expect(keys).toContain("?");
  });

  it("lists the paused inspect-zoom keys", () => {
    const panel = make();
    const keys = [...panel.root.querySelectorAll(".rs-help-panel__key")].map(
      (k) => k.textContent,
    );
    expect(keys).toContain("+");
    expect(keys).toContain("−");
  });

  it("documents launch, navigation, and escape shortcuts", () => {
    const panel = make();
    const text = panel.root.textContent ?? "";
    expect(text).toContain("Alt");
    expect(text).toContain("Shift");
    expect(text).toContain("Page");
    expect(text).toContain("Esc");
    expect(text).toContain("\u2190");
    expect(text).toContain("\u2192");
  });

  it("renders an intro line with the italicized product name", () => {
    const { root } = make();
    const intro = /** @type {HTMLElement} */ (
      root.querySelector(".rs-help-panel__intro")
    );
    expect(intro.textContent).toContain(
      "optimized for hands-free or keyboard navigation",
    );
    const em = /** @type {HTMLElement} */ (intro.querySelector("em"));
    expect(em.textContent).toBe("Reddit Slideshow Spectacular!");
  });

  it("renders an about footer with open-source and donation links", () => {
    const { root } = make();
    const about = /** @type {HTMLElement} */ (
      root.querySelector(".rs-help-panel__about")
    );
    const links = /** @type {NodeListOf<HTMLAnchorElement>} */ (
      about.querySelectorAll("a")
    );
    expect(links).toHaveLength(2);
    const [source, donation] = links;
    expect(source.getAttribute("href")).toBe(
      "https://github.com/Rio517/reddit-slideshow-spectacular",
    );
    expect(donation.getAttribute("href")).toBe(
      "https://github.com/sponsors/Rio517",
    );
    for (const a of links) {
      expect(a.getAttribute("target")).toBe("_blank");
      expect(a.getAttribute("rel")).toContain("noopener");
    }
  });

  it("orders the panel as intro, list, about", () => {
    const { root } = make();
    const intro = /** @type {HTMLElement} */ (
      root.querySelector(".rs-help-panel__intro")
    );
    const list = /** @type {HTMLElement} */ (
      root.querySelector(".rs-help-panel__list")
    );
    const about = /** @type {HTMLElement} */ (
      root.querySelector(".rs-help-panel__about")
    );
    // Intro precedes the list; about follows it (DOM document order).
    const following = intro.DOCUMENT_POSITION_FOLLOWING;
    expect(intro.compareDocumentPosition(list) & following).toBeTruthy();
    expect(list.compareDocumentPosition(about) & following).toBeTruthy();
  });
});

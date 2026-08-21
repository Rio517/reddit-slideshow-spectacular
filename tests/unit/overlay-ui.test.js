import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOverlay } from "../../lib/overlay-ui.js";
import { setLocale } from "../../lib/i18n.js";
import { imageTimerStopSeconds } from "../../lib/settings.js";

/** @typedef {ReturnType<typeof createOverlay>} Overlay */

/**
 * @param {Partial<import("../../lib/slides.js").Slide>} [overrides]
 * @returns {import("../../lib/slides.js").Slide}
 */
function imageSlide(overrides) {
  return {
    id: "t3_x:0",
    postId: "t3_x",
    provider: "reddit-image",
    kind: "image",
    mediaUrl: "https://i.redd.it/x.jpg",
    sourceUrl: "https://i.redd.it/x.jpg",
    permalink: "https://old.reddit.com/r/x/comments/x/x/",
    title: "A title",
    over18: false,
    durationMode: "timer",
    audioAvailable: false,
    sourceWidth: 1000,
    sourceHeight: 800,
    quality: "original",
    mimeType: "image/jpeg",
    filenameHint: "t3_x.jpg",
    ...overrides,
  };
}

const PANEL_SETTINGS = {
  imageTimerSeconds: 5,
  startMuted: true,
  autoplay: true,
  includeNsfw: true,
  dedupe: true,
  contentDedup: false,
  alwaysShowMeta: true,
  maxLoadWaitSeconds: 5,
  timerBar: "all",
  panZoom: false,
};

/** @param {Overlay} overlay */
function renderProxiedVideo(overlay) {
  overlay.renderCurrent(
    imageSlide({
      kind: "video",
      durationMode: "media",
      proxied: true,
      mediaUrl: "https://media.redgifs.com/X.mp4",
    }),
    { index: 0, total: 1, exhausted: true, effectiveSeconds: 5, playing: true },
  );
}

function noopHandlers() {
  return {
    onPrev() {},
    onNext() {},
    onTogglePlay() {},
    onClose() {},
    onOpenOriginal() {},
    onMediaEnded() {},
    onMediaReady() {},
    onToggleMute() {},
    onOpenPreferences() {},
    isPaused: () => true,
  };
}

/**
 * @param {Element} root
 * @param {string} prefix
 */
function clickByLabel(root, prefix) {
  const el = /** @type {HTMLElement | null} */ (
    root.querySelector(`[aria-label^="${prefix}"]`)
  );
  el?.click();
}

describe("createOverlay", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    // show() makes the page inert; tests that don't hide() must not leak it.
    document.body.inert = false;
    // The RTL test sets the locale to Arabic; reset so this realm-shared module
    // state (vitest isolate:false) can't leak into other tests/files.
    setLocale("en");
  });

  it("builds the chrome with eleven controls, hidden by default", () => {
    const overlay = createOverlay(noopHandlers());
    expect(overlay.root.querySelector(".rs-stage")).toBeTruthy();
    expect(overlay.root.querySelector(".rs-timer")).toBeTruthy();
    expect(overlay.root.querySelectorAll(".rs-btn").length).toBe(11);
    expect(overlay.isOpen()).toBe(false);
  });

  it("mounts the UI inside an open shadow root on the host, with the CSS", () => {
    const overlay = createOverlay(
      noopHandlers(),
      document,
      "#reddit-slideshow-root .rs-stage{color:red}",
    );
    // The mounted element is the host; the UI container lives in its shadow,
    // isolating the overlay from host/RES page styles.
    expect(overlay.host).toBeTruthy();
    const shadow = overlay.host.shadowRoot;
    expect(shadow).toBeTruthy();
    expect(shadow?.querySelector("#reddit-slideshow-root")).toBe(overlay.root);
    expect(shadow?.querySelector("style")?.textContent).toContain(".rs-stage");
    // Nothing leaks into the light DOM.
    expect(overlay.host.querySelector(".rs-stage")).toBeNull();
  });

  it("renders the wordmark with the inline-SVG 'Spectacular!' mark on the splash and end card", () => {
    const overlay = createOverlay(noopHandlers());

    overlay.showLoading();
    const name = overlay.root.querySelector(".rs-logo__name");
    // "Reddit Slideshow " is sans text; "Spectacular!" is an inline SVG outline
    // (no webfont) labelled for screen readers.
    expect(name?.firstChild?.textContent).toBe("Reddit Slideshow ");
    const neon = overlay.root.querySelector(".rs-logo__neon");
    expect(neon?.tagName.toLowerCase()).toBe("svg");
    expect(neon?.getAttribute("aria-label")).toBe("Spectacular!");
    expect(neon?.querySelector("path")).toBeTruthy();

    overlay.showEnd();
    expect(
      overlay.root.querySelector(".rs-logo__neon")?.getAttribute("aria-label"),
    ).toBe("Spectacular!");
  });

  it("makes the page inert while shown and restores it on hide", () => {
    const overlay = createOverlay(noopHandlers());
    document.documentElement.append(overlay.host);
    overlay.show();
    expect(document.body.inert).toBe(true);
    overlay.hide();
    expect(document.body.inert).toBe(false);
    overlay.host.remove();
  });

  it("flags the play button as paused (turquoise pulse) only while paused", () => {
    const overlay = createOverlay(noopHandlers());
    const play = overlay.root.querySelector(".rs-btn--primary");
    overlay.setPlaying(false);
    expect(play?.classList.contains("rs-btn--paused")).toBe(true);
    overlay.setPlaying(true);
    expect(play?.classList.contains("rs-btn--paused")).toBe(false);
  });

  it("wires the popout control to onPopout", () => {
    const onPopout = vi.fn();
    const overlay = createOverlay({ ...noopHandlers(), onPopout });
    clickByLabel(overlay.root, "Open in a window");
    expect(onPopout).toHaveBeenCalledTimes(1);
  });

  it("shows the D shortcut in the download control's tooltip", () => {
    const overlay = createOverlay(noopHandlers());
    const btn = /** @type {HTMLButtonElement | null} */ (
      overlay.root.querySelector(".rs-meta__download")
    );
    expect(btn?.title).toBe("Download (D)");
  });

  it("wires the download control to onDownload", () => {
    const onDownload = vi.fn();
    const overlay = createOverlay({ ...noopHandlers(), onDownload });
    clickByLabel(overlay.root, "Download");
    expect(onDownload).toHaveBeenCalledTimes(1);
  });

  it("flashes vote feedback for up, down, cleared, and error", () => {
    const overlay = createOverlay(noopHandlers());
    overlay.show();
    overlay.flashVote(1);
    const flash = /** @type {HTMLElement | null} */ (
      overlay.root.querySelector(".rs-vote-flash")
    );
    expect(flash?.hidden).toBe(false);
    expect(flash?.textContent).toContain("Upvoted");
    overlay.flashVote(-1);
    expect(flash?.textContent).toContain("Downvoted");
    overlay.flashVote(0);
    expect(flash?.textContent).toContain("removed");
    overlay.flashVote("error");
    expect(flash?.textContent).toContain("Couldn't");
  });

  it("enables download for a downloadable image, disables it for an embed", () => {
    const overlay = createOverlay({ ...noopHandlers(), onDownload() {} });
    overlay.show();
    const dl = () =>
      /** @type {HTMLButtonElement | null} */ (
        overlay.root.querySelector('[aria-label^="Download"]')
      );
    overlay.renderCurrent(imageSlide(), {
      index: 0,
      total: 1,
      exhausted: true,
      effectiveSeconds: 5,
      playing: true,
    });
    expect(dl()?.disabled).toBe(false);
    overlay.renderCurrent(
      imageSlide({
        kind: "embed",
        provider: "redgifs",
        mediaUrl: "https://www.redgifs.com/ifr/x",
        embedUrl: "https://www.redgifs.com/ifr/x",
      }),
      {
        index: 1,
        total: 2,
        exhausted: true,
        effectiveSeconds: 5,
        playing: true,
      },
    );
    expect(dl()?.disabled).toBe(true);
  });

  it("attaches a synced companion audio for a video slide with an audio track", () => {
    const overlay = createOverlay(noopHandlers());
    overlay.show();
    overlay.renderCurrent(
      imageSlide({
        kind: "video",
        durationMode: "media",
        mediaUrl: "https://v.redd.it/b/CMAF_720.mp4",
        audioUrl: "https://v.redd.it/b/DASH_AUDIO_128.mp4",
      }),
      {
        index: 0,
        total: 1,
        exhausted: true,
        effectiveSeconds: 5,
        playing: true,
      },
    );
    const audio = overlay.root.querySelector("audio");
    expect(audio?.getAttribute("src")).toBe(
      "https://v.redd.it/b/DASH_AUDIO_128.mp4",
    );
  });

  it("attaches no companion audio for a video without an audio track", () => {
    const overlay = createOverlay(noopHandlers());
    overlay.show();
    overlay.renderCurrent(
      imageSlide({
        kind: "video",
        durationMode: "media",
        mediaUrl: "https://v.redd.it/b/CMAF_720.mp4",
      }),
      {
        index: 0,
        total: 1,
        exhausted: true,
        effectiveSeconds: 5,
        playing: true,
      },
    );
    expect(overlay.root.querySelector("audio")).toBeNull();
  });

  it("ignores a companion audio url that isn't on a reddit host", () => {
    const overlay = createOverlay(noopHandlers());
    overlay.show();
    overlay.renderCurrent(
      imageSlide({
        kind: "video",
        durationMode: "media",
        mediaUrl: "https://v.redd.it/b/CMAF_720.mp4",
        audioUrl: "https://evil.example/track.mp4",
      }),
      {
        index: 0,
        total: 1,
        exhausted: true,
        effectiveSeconds: 5,
        playing: true,
      },
    );
    expect(overlay.root.querySelector("audio")).toBeNull();
  });

  it("a backdrop click with the settings panel open closes the panel, not the show", () => {
    const onClose = vi.fn();
    const overlay = createOverlay({ ...noopHandlers(), onClose });
    // Open the settings panel via the gear.
    clickByLabel(overlay.root, "Settings");
    const panel = /** @type {HTMLElement | null} */ (
      overlay.root.querySelector(".rs-settings-panel")
    );
    expect(panel?.hidden).toBe(false);
    // Click the backdrop (the root itself).
    overlay.root.dispatchEvent(new Event("click", { bubbles: true }));
    expect(panel?.hidden).toBe(true); // panel dismissed
    expect(onClose).not.toHaveBeenCalled(); // slideshow stays open
  });

  it("toggles the inline settings panel from the gear", () => {
    const overlay = createOverlay(noopHandlers());
    const panel = /** @type {HTMLElement | null} */ (
      overlay.root.querySelector(".rs-settings-panel")
    );
    expect(panel?.hidden).toBe(true);
    clickByLabel(overlay.root, "Settings");
    expect(panel?.hidden).toBe(false);
    clickByLabel(overlay.root, "Settings");
    expect(panel?.hidden).toBe(true);
  });

  it("opens full preferences from the settings panel", () => {
    const onOpenPreferences = vi.fn();
    const overlay = createOverlay({ ...noopHandlers(), onOpenPreferences });
    clickByLabel(overlay.root, "Settings");
    overlay.root
      .querySelector(".rs-settings-panel__more")
      ?.dispatchEvent(new Event("click", { bubbles: true }));
    expect(onOpenPreferences).toHaveBeenCalledTimes(1);
  });

  it("applies a settings panel change via onChangeSetting", () => {
    const onChangeSetting = vi.fn();
    const overlay = createOverlay({ ...noopHandlers(), onChangeSetting });
    overlay.setSettings(/** @type {any} */ ({ ...PANEL_SETTINGS }));
    const range = /** @type {HTMLInputElement | null} */ (
      overlay.root.querySelector(".rs-set__range")
    );
    if (range) {
      range.value = "12";
      range.dispatchEvent(new Event("change", { bubbles: true }));
    }
    // The range is a stops index; the panel emits that stop's seconds.
    expect(onChangeSetting).toHaveBeenCalledWith({
      imageTimerSeconds: imageTimerStopSeconds(12),
    });
  });

  it("renders a slide with the position counter, title, and NSFW tag", () => {
    const overlay = createOverlay(noopHandlers());
    overlay.show();
    overlay.renderCurrent(imageSlide({ title: "Hello", over18: true }), {
      index: 0,
      total: 50,
      exhausted: false,
      effectiveSeconds: 5,
      playing: true,
    });
    expect(overlay.root.querySelector(".rs-meta__counter")?.textContent).toBe(
      "1 / 50+",
    );
    expect(
      overlay.root.querySelector(".rs-meta__title-text")?.textContent,
    ).toBe("Hello");
    const nsfw = /** @type {HTMLElement | null} */ (
      overlay.root.querySelector(".rs-meta__nsfw")
    );
    expect(nsfw?.hidden).toBe(false);
    expect(
      overlay.root.querySelector("img.reddit-slideshow-media"),
    ).toBeTruthy();
  });

  it("truncates a long title to 50 chars + ellipsis, keeping the full title on hover", () => {
    const overlay = createOverlay(noopHandlers());
    overlay.show();
    const full =
      "This is a very long title that goes well beyond fifty characters in length";
    overlay.renderCurrent(imageSlide({ title: full }), {
      index: 0,
      total: 1,
      exhausted: true,
      effectiveSeconds: 5,
      playing: true,
    });
    const text = /** @type {HTMLElement | null} */ (
      overlay.root.querySelector(".rs-meta__title-text")
    );
    expect(text?.textContent).toBe(`${full.slice(0, 50).trimEnd()}…`);
    // Truncated visible text is 50 chars of title plus the ellipsis.
    expect(text?.textContent?.length).toBe(51);
    expect(text?.title).toBe(full);
  });

  it("renders a clickable /u/author byline rooted at the permalink origin", () => {
    const overlay = createOverlay(noopHandlers());
    overlay.show();
    overlay.renderCurrent(
      imageSlide({
        author: "alice",
        permalink: "https://old.reddit.com/r/x/comments/1/t/",
      }),
      {
        index: 0,
        total: 1,
        exhausted: true,
        effectiveSeconds: 5,
        playing: true,
      },
    );
    const author = /** @type {HTMLAnchorElement | null} */ (
      overlay.root.querySelector(".rs-meta__author")
    );
    expect(author?.hidden).toBe(false);
    expect(author?.textContent).toBe("/u/alice");
    expect(author?.href).toBe("https://old.reddit.com/user/alice");
  });

  it("stacks the bottom-left meta as nsfw, title, byline, source (bottom)", () => {
    const overlay = createOverlay(noopHandlers());
    overlay.show();
    overlay.renderCurrent(imageSlide({ over18: true }), {
      index: 0,
      total: 1,
      exhausted: true,
      effectiveSeconds: 5,
      playing: true,
    });
    const meta = /** @type {HTMLElement} */ (
      overlay.root.querySelector(".rs-meta")
    );
    // DOM top→bottom; the column lays the last child at the bottom, anchored.
    const order = [...meta.children].map((c) => c.className.split(" ")[0]);
    expect(order).toEqual([
      "rs-meta__nsfw",
      "rs-meta__title",
      "rs-meta__byline",
      "rs-meta__source",
    ]);
  });

  it("orders the title row as vote, title text, open, download, then spinner", () => {
    const overlay = createOverlay({ ...noopHandlers(), onDownload() {} });
    overlay.show();
    overlay.renderCurrent(imageSlide(), {
      index: 0,
      total: 1,
      exhausted: true,
      effectiveSeconds: 5,
      playing: true,
    });
    const row = /** @type {HTMLElement} */ (
      overlay.root.querySelector(".rs-meta__title")
    );
    const order = [
      ...row.querySelectorAll(
        ".rs-meta__vote, .rs-meta__title-text, .rs-meta__open, .rs-meta__download, .rs-meta__spinner",
      ),
    ].map((el) => [...el.classList].find((c) => c.startsWith("rs-meta__")));
    expect(order).toEqual([
      "rs-meta__vote",
      "rs-meta__title-text",
      "rs-meta__open",
      "rs-meta__download",
      "rs-meta__spinner",
    ]);
  });

  it("keeps author and subreddit on the byline, dropping from/at connectives", () => {
    const overlay = createOverlay(noopHandlers());
    overlay.show();
    overlay.renderCurrent(
      imageSlide({
        author: "alice",
        subreddit: "aww",
        sourceWidth: 1920,
        sourceHeight: 1080,
        sourceUrl: "https://i.redd.it/x.jpg",
      }),
      {
        index: 0,
        total: 1,
        exhausted: true,
        effectiveSeconds: 5,
        playing: true,
      },
    );
    const byline = /** @type {HTMLElement} */ (
      overlay.root.querySelector(".rs-meta__byline")
    );
    expect(byline.querySelector(".rs-meta__author")?.textContent).toBe(
      "/u/alice",
    );
    const sub = /** @type {HTMLAnchorElement | null} */ (
      byline.querySelector(".rs-meta__subreddit")
    );
    expect(sub?.textContent).toBe("/r/aww");
    expect(sub?.href).toBe("https://old.reddit.com/r/aww");
    // Domain and resolution no longer live on the byline.
    expect(byline.querySelector(".rs-meta__domain")).toBeNull();
    expect(byline.querySelector(".rs-meta__res")).toBeNull();
    // The dropped "from"/"at" words leave only the "to" connective.
    const seps = [...byline.querySelectorAll(".rs-meta__sep")].filter(
      (s) => !(/** @type {HTMLElement} */ (s).hidden),
    );
    expect(seps).toHaveLength(1);
  });

  it("breaks domain and resolution onto a source line, bulleted between", () => {
    const overlay = createOverlay(noopHandlers());
    overlay.show();
    overlay.renderCurrent(
      imageSlide({
        sourceWidth: 1920,
        sourceHeight: 1080,
        sourceUrl: "https://i.redd.it/x.jpg",
      }),
      {
        index: 0,
        total: 1,
        exhausted: true,
        effectiveSeconds: 5,
        playing: true,
      },
    );
    const source = /** @type {HTMLElement} */ (
      overlay.root.querySelector(".rs-meta__source")
    );
    expect(source.querySelector(".rs-meta__domain")?.textContent).toBe(
      "i.redd.it",
    );
    expect(source.querySelector(".rs-meta__res")?.textContent).toBe(
      "1920×1080",
    );
    const sep = /** @type {HTMLElement | null} */ (
      source.querySelector(".rs-meta__sep")
    );
    expect(sep?.hidden).toBe(false);
    expect(sep?.textContent).toBe("•");
  });

  it("hides the source line entirely when there is no domain or resolution", () => {
    const overlay = createOverlay(noopHandlers());
    overlay.show();
    overlay.renderCurrent(
      imageSlide({
        sourceUrl: "",
        mediaUrl: "",
        sourceWidth: undefined,
        sourceHeight: undefined,
      }),
      {
        index: 0,
        total: 1,
        exhausted: true,
        effectiveSeconds: 5,
        playing: true,
      },
    );
    expect(
      /** @type {HTMLElement | null} */ (
        overlay.root.querySelector(".rs-meta__source")
      )?.hidden,
    ).toBe(true);
  });

  it("marks the title with a vote arrow reflecting the current vote", () => {
    const overlay = createOverlay(noopHandlers());
    overlay.show();
    const vote = () =>
      /** @type {HTMLElement} */ (overlay.root.querySelector(".rs-meta__vote"));
    const render = (/** @type {boolean | null} */ likes) =>
      overlay.renderCurrent(imageSlide({ likes }), {
        index: 0,
        total: 1,
        exhausted: true,
        effectiveSeconds: 5,
        playing: true,
      });

    render(null); // no vote → soft/neutral
    expect(vote().classList.contains("rs-meta__vote--none")).toBe(true);
    render(true); // upvoted
    expect(vote().classList.contains("rs-meta__vote--up")).toBe(true);
    render(false); // downvoted
    expect(vote().classList.contains("rs-meta__vote--down")).toBe(true);
  });

  it("updates the vote arrow live via setVote without a re-render", () => {
    const overlay = createOverlay(noopHandlers());
    overlay.show();
    overlay.renderCurrent(imageSlide({ likes: null }), {
      index: 0,
      total: 1,
      exhausted: true,
      effectiveSeconds: 5,
      playing: true,
    });
    const vote = /** @type {HTMLElement} */ (
      overlay.root.querySelector(".rs-meta__vote")
    );
    overlay.setVote(true);
    expect(vote.classList.contains("rs-meta__vote--up")).toBe(true);
    overlay.setVote(false);
    expect(vote.classList.contains("rs-meta__vote--down")).toBe(true);
    overlay.setVote(null);
    expect(vote.classList.contains("rs-meta__vote--none")).toBe(true);
  });

  it("hides the resolution on the source line when the slide has no dimensions", () => {
    const overlay = createOverlay(noopHandlers());
    overlay.show();
    overlay.renderCurrent(
      imageSlide({ sourceWidth: undefined, sourceHeight: undefined }),
      {
        index: 0,
        total: 1,
        exhausted: true,
        effectiveSeconds: 5,
        playing: true,
      },
    );
    const res = /** @type {HTMLElement | null} */ (
      overlay.root.querySelector(".rs-meta__res")
    );
    expect(res?.hidden).toBe(true);
    // The domain still shows.
    expect(overlay.root.querySelector(".rs-meta__domain")?.textContent).toBe(
      "i.redd.it",
    );
  });

  it("hides the author byline when the slide has no author", () => {
    const overlay = createOverlay(noopHandlers());
    overlay.show();
    overlay.renderCurrent(imageSlide({ author: undefined }), {
      index: 0,
      total: 1,
      exhausted: true,
      effectiveSeconds: 5,
      playing: true,
    });
    const author = /** @type {HTMLElement | null} */ (
      overlay.root.querySelector(".rs-meta__author")
    );
    expect(author?.hidden).toBe(true);
  });

  it("wraps the byline data tokens in <bdi> so LTR tokens stay readable in RTL", () => {
    const overlay = createOverlay(noopHandlers());
    overlay.show();
    overlay.renderCurrent(
      imageSlide({
        author: "alice",
        subreddit: "aww",
        sourceWidth: 1920,
        sourceHeight: 1080,
        sourceUrl: "https://i.redd.it/x.jpg",
      }),
      {
        index: 0,
        total: 1,
        exhausted: true,
        effectiveSeconds: 5,
        playing: true,
      },
    );
    // Four data tokens present (author + subreddit on the byline, domain +
    // resolution on the source line), each a <bdi> (the anchors wrap an inner
    // one; domain/res are themselves <bdi>).
    const bdis = overlay.root.querySelectorAll(
      ".rs-meta__byline bdi, .rs-meta__source bdi",
    );
    expect(bdis.length).toBeGreaterThanOrEqual(4);
    // The connectives ("to") and the source bullet are NOT bidi-wrapped.
    for (const sep of overlay.root.querySelectorAll(".rs-meta__sep")) {
      expect(sep.querySelector("bdi")).toBeNull();
    }
    // The exact token text is preserved (the overlay-ui guard contract).
    expect(overlay.root.querySelector(".rs-meta__author")?.textContent).toBe(
      "/u/alice",
    );
    expect(overlay.root.querySelector(".rs-meta__domain")?.textContent).toBe(
      "i.redd.it",
    );
    expect(overlay.root.querySelector(".rs-meta__res")?.textContent).toBe(
      "1920×1080",
    );
  });

  it("defaults the overlay root to dir=ltr", () => {
    const overlay = createOverlay(noopHandlers());
    expect(overlay.root.dir).toBe("ltr");
  });

  it("mirrors the overlay root to dir=rtl under an RTL locale", () => {
    setLocale("ar");
    const overlay = createOverlay(noopHandlers());
    expect(overlay.root.dir).toBe("rtl");
  });

  it("shows the title spinner during the pending window and clears it on failure", () => {
    const overlay = createOverlay({ ...noopHandlers(), onMediaFailed() {} });
    overlay.show();
    overlay.renderCurrent(imageSlide(), {
      index: 0,
      total: 1,
      exhausted: false,
      effectiveSeconds: 5,
      playing: true,
    });
    const spinner = /** @type {HTMLElement | null} */ (
      overlay.root.querySelector(".rs-meta__spinner")
    );
    // On while the next slide's media is still loading.
    expect(spinner?.classList.contains("rs-meta__spinner--on")).toBe(true);
    overlay.root
      .querySelector(".reddit-slideshow-media")
      ?.dispatchEvent(new Event("error"));
    expect(spinner?.classList.contains("rs-meta__spinner--on")).toBe(false);
  });

  it("drops the + from the counter when the queue is exhausted", () => {
    const overlay = createOverlay(noopHandlers());
    overlay.renderCurrent(imageSlide(), {
      index: 2,
      total: 3,
      exhausted: true,
      effectiveSeconds: 5,
      playing: true,
    });
    expect(overlay.root.querySelector(".rs-meta__counter")?.textContent).toBe(
      "3 / 3",
    );
  });

  it("wires control buttons to handlers", () => {
    /** @type {string[]} */
    const calls = [];
    const overlay = createOverlay({
      onPrev: () => calls.push("prev"),
      onNext: () => calls.push("next"),
      onTogglePlay: () => calls.push("play"),
      onClose: () => calls.push("close"),
      onOpenOriginal: () => calls.push("open"),
      onMediaEnded: () => {},
      onMediaReady: () => {},
      onToggleMute: () => calls.push("mute"),
      onOpenPreferences: () => calls.push("prefs"),
    });
    overlay.renderCurrent(imageSlide(), {
      index: 0,
      total: 1,
      exhausted: true,
      effectiveSeconds: 5,
      playing: true,
    });
    clickByLabel(overlay.root, "Next");
    clickByLabel(overlay.root, "Previous");
    clickByLabel(overlay.root, "Open");
    clickByLabel(overlay.root, "Mute");
    clickByLabel(overlay.root, "Close");
    expect(calls).toEqual(["next", "prev", "open", "mute", "close"]);
  });

  it("loads a proxied video through resolveMedia as a blob src", async () => {
    vi.useRealTimers();
    const resolveMedia = vi.fn(async () => "blob:fake-123");
    const overlay = createOverlay({ ...noopHandlers(), resolveMedia });
    overlay.renderCurrent(
      imageSlide({
        kind: "video",
        durationMode: "media",
        proxied: true,
        mediaUrl: "https://media.redgifs.com/X.mp4",
      }),
      {
        index: 0,
        total: 1,
        exhausted: true,
        effectiveSeconds: 5,
        playing: true,
      },
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    const video = overlay.root.querySelector("video.reddit-slideshow-media");
    expect(resolveMedia).toHaveBeenCalledWith(
      "https://media.redgifs.com/X.mp4",
    );
    expect(video?.getAttribute("src")).toBe("blob:fake-123");
  });

  it("shows a video's first frame without playing it while paused/manual", () => {
    const overlay = createOverlay(noopHandlers());
    overlay.renderCurrent(
      imageSlide({
        kind: "video",
        durationMode: "media",
        mediaUrl: "https://v.redd.it/x/CMAF_720.mp4",
      }),
      {
        index: 0,
        total: 1,
        exhausted: true,
        effectiveSeconds: 5,
        playing: false,
      },
    );
    const video = /** @type {HTMLVideoElement} */ (
      overlay.root.querySelector("video.reddit-slideshow-media")
    );
    // The element must not auto-start on its own either.
    expect(video.autoplay).toBe(false);
    const play = vi.fn(() => Promise.resolve());
    video.play = play;
    video.dispatchEvent(new Event("loadeddata"));
    expect(play).not.toHaveBeenCalled();
  });

  it("starts a direct video on load when the show is playing", () => {
    const overlay = createOverlay(noopHandlers());
    overlay.renderCurrent(
      imageSlide({
        kind: "video",
        durationMode: "media",
        mediaUrl: "https://v.redd.it/x/CMAF_720.mp4",
      }),
      {
        index: 0,
        total: 1,
        exhausted: true,
        effectiveSeconds: 5,
        playing: true,
      },
    );
    const video = /** @type {HTMLVideoElement} */ (
      overlay.root.querySelector("video.reddit-slideshow-media")
    );
    const play = vi.fn(() => Promise.resolve());
    video.play = play;
    video.dispatchEvent(new Event("loadeddata"));
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("toggles the help panel via the exposed toggleHelp (the ? key path)", () => {
    const overlay = createOverlay(noopHandlers());
    const help = /** @type {HTMLElement | null} */ (
      overlay.root.querySelector(".rs-help-panel")
    );
    expect(help?.hidden).toBe(true);
    overlay.toggleHelp();
    expect(help?.hidden).toBe(false);
    overlay.toggleHelp();
    expect(help?.hidden).toBe(true);
  });

  it("moves focus into the help panel on open and back to the trigger on Escape", () => {
    const overlay = createOverlay(noopHandlers());
    document.documentElement.append(overlay.host);
    const shadow = /** @type {ShadowRoot} */ (overlay.host.shadowRoot);
    try {
      overlay.show();
      const helpBtn = /** @type {HTMLElement} */ (
        overlay.root.querySelector('[aria-label^="Keyboard shortcuts"]')
      );
      helpBtn.focus();
      helpBtn.click(); // open help
      // Focus moved into the panel - its × close is the first focusable.
      expect(shadow.activeElement).toBe(
        overlay.root.querySelector(".rs-help-panel__close"),
      );
      // Escape closes it and returns focus to the control that opened it.
      overlay.dismissTopLayer();
      expect(shadow.activeElement).toBe(helpBtn);
    } finally {
      overlay.host.remove();
    }
  });

  it("focuses and traps Tab within the close-confirm modal", () => {
    const overlay = createOverlay(noopHandlers());
    document.documentElement.append(overlay.host);
    const shadow = /** @type {ShadowRoot} */ (overlay.host.shadowRoot);
    try {
      overlay.show();
      // Render deep into the show so a backdrop click guards with the confirm.
      overlay.renderCurrent(imageSlide(), {
        index: 25,
        total: 50,
        exhausted: false,
        effectiveSeconds: 5,
        playing: true,
      });
      overlay.root.dispatchEvent(new Event("click", { bubbles: true }));
      const confirm = /** @type {HTMLElement} */ (
        overlay.root.querySelector(".rs-confirm")
      );
      const keep = /** @type {HTMLElement} */ (
        overlay.root.querySelector(
          ".rs-confirm__btn:not(.rs-confirm__btn--danger)",
        )
      );
      const danger = /** @type {HTMLElement} */ (
        overlay.root.querySelector(".rs-confirm__btn--danger")
      );
      expect(confirm.hidden).toBe(false);
      // Focus lands on "Keep watching".
      expect(shadow.activeElement).toBe(keep);
      // Tab cycles between the two buttons, never leaving the modal.
      const tab = () => {
        const ev = new Event("keydown", { bubbles: true, cancelable: true });
        Object.defineProperty(ev, "key", { value: "Tab" });
        /** @type {HTMLElement} */ (shadow.activeElement).dispatchEvent(ev);
      };
      tab();
      expect(shadow.activeElement).toBe(danger);
      tab();
      expect(shadow.activeElement).toBe(keep);
      // Escape dismisses it.
      overlay.dismissTopLayer();
      expect(confirm.hidden).toBe(true);
    } finally {
      overlay.host.remove();
    }
  });

  it("a backdrop click asks before closing once well into the show; media/control clicks do not", () => {
    const onClose = vi.fn();
    const overlay = createOverlay({ ...noopHandlers(), onClose });
    // Past slide 20, so a backdrop click guards instead of closing outright.
    overlay.renderCurrent(imageSlide(), {
      index: 24,
      total: 50,
      exhausted: false,
      effectiveSeconds: 5,
      playing: true,
    });
    const click = (/** @type {Element | null | undefined} */ el) =>
      el?.dispatchEvent(new Event("click", { bubbles: true }));

    click(overlay.root.querySelector(".rs-slide")); // the media - no close
    click(overlay.root.querySelector(".rs-btn")); // a control - no close
    expect(onClose).not.toHaveBeenCalled();

    // A backdrop click guards against an accidental click - it confirms first.
    click(overlay.root.querySelector(".rs-stage"));
    expect(onClose).not.toHaveBeenCalled();
    const confirm = /** @type {HTMLElement | null} */ (
      overlay.root.querySelector(".rs-confirm")
    );
    expect(confirm?.hidden).toBe(false);
    click(overlay.root.querySelector(".rs-confirm__btn--danger")); // "Close"
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("a backdrop click closes immediately in the first 20 slides (no confirm)", () => {
    const onClose = vi.fn();
    const overlay = createOverlay({ ...noopHandlers(), onClose });
    overlay.renderCurrent(imageSlide(), {
      index: 5,
      total: 50,
      exhausted: false,
      effectiveSeconds: 5,
      playing: true,
    });
    overlay.root
      .querySelector(".rs-stage")
      ?.dispatchEvent(new Event("click", { bubbles: true }));
    // No confirm popover; the show just closes.
    expect(
      /** @type {HTMLElement | null} */ (
        overlay.root.querySelector(".rs-confirm")
      )?.hidden,
    ).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("the X button and Keep-watching skip / dismiss the confirm", () => {
    const onClose = vi.fn();
    const overlay = createOverlay({ ...noopHandlers(), onClose });
    // Past slide 20 so a backdrop click confirms rather than closing outright.
    overlay.renderCurrent(imageSlide(), {
      index: 24,
      total: 50,
      exhausted: false,
      effectiveSeconds: 5,
      playing: true,
    });
    const click = (/** @type {Element | null | undefined} */ el) =>
      el?.dispatchEvent(new Event("click", { bubbles: true }));
    const confirm = /** @type {HTMLElement | null} */ (
      overlay.root.querySelector(".rs-confirm")
    );

    // The X (top-right) closes immediately, no confirm.
    clickByLabel(overlay.root, "Close");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(confirm?.hidden).toBe(true);

    // A backdrop click then "Keep watching" dismisses without closing.
    click(overlay.root.querySelector(".rs-stage"));
    expect(confirm?.hidden).toBe(false);
    const keep = [...overlay.root.querySelectorAll(".rs-confirm__btn")].find(
      (b) => !b.classList.contains("rs-confirm__btn--danger"),
    );
    click(keep);
    expect(confirm?.hidden).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1); // still just the X
  });

  it("counts down in the Keep-watching button and auto-dismisses", () => {
    const onClose = vi.fn();
    const overlay = createOverlay({ ...noopHandlers(), onClose });
    overlay.renderCurrent(imageSlide(), {
      index: 24,
      total: 50,
      exhausted: false,
      effectiveSeconds: 5,
      playing: true,
    });
    const click = (/** @type {Element | null | undefined} */ el) =>
      el?.dispatchEvent(new Event("click", { bubbles: true }));
    click(overlay.root.querySelector(".rs-stage"));
    const confirm = /** @type {HTMLElement | null} */ (
      overlay.root.querySelector(".rs-confirm")
    );
    const keep = [...overlay.root.querySelectorAll(".rs-confirm__btn")].find(
      (b) => !b.classList.contains("rs-confirm__btn--danger"),
    );
    expect(keep?.textContent).toBe("Keep watching (5s)");
    vi.advanceTimersByTime(1000);
    expect(keep?.textContent).toBe("Keep watching (4s)");
    vi.advanceTimersByTime(4000); // reaches 0 → self-dismiss
    expect(confirm?.hidden).toBe(true);
    expect(keep?.textContent).toBe("Keep watching"); // reset
    expect(onClose).not.toHaveBeenCalled();
  });

  it("puts the close button in the top-right corner, off the control rail", () => {
    const overlay = createOverlay(noopHandlers());
    const close = /** @type {HTMLElement | null} */ (
      overlay.root.querySelector('[aria-label^="Close"]')
    );
    expect(close?.classList.contains("rs-close-top")).toBe(true);
    expect(overlay.root.querySelector(".rs-controls .rs-close-top")).toBeNull();
  });

  it("keeps the controls up while the pointer rests on them", () => {
    const overlay = createOverlay(noopHandlers());
    overlay.show();
    overlay.root.dispatchEvent(new Event("mouseleave")); // force idle
    expect(overlay.root.classList.contains("rs-idle")).toBe(true);
    overlay.root
      .querySelector(".rs-controls")
      ?.dispatchEvent(new Event("mouseenter"));
    expect(overlay.root.classList.contains("rs-idle")).toBe(false);
  });

  it("keeps the overlay awake while the pointer rests on the jump list", () => {
    const overlay = createOverlay(noopHandlers());
    overlay.show();
    overlay.root.dispatchEvent(new Event("mouseleave")); // force idle
    expect(overlay.root.classList.contains("rs-idle")).toBe(true);
    overlay.root
      .querySelector(".rs-jump-panel")
      ?.dispatchEvent(new Event("mouseenter"));
    expect(overlay.root.classList.contains("rs-idle")).toBe(false);
  });

  it("keeps the overlay awake while the pointer rests on the counter cluster", () => {
    const overlay = createOverlay(noopHandlers());
    overlay.show();
    clickByLabel(overlay.root, "Jump to a post");
    const panel = /** @type {HTMLElement | null} */ (
      overlay.root.querySelector(".rs-jump-panel")
    );
    expect(panel?.hidden).toBe(false);
    // Pointer resting on the counter (no further movement) must not let the
    // idle timer yank the open jump list closed.
    overlay.root
      .querySelector(".rs-topleft")
      ?.dispatchEvent(new Event("mouseenter"));
    vi.advanceTimersByTime(10_000);
    expect(panel?.hidden).toBe(false);
    expect(overlay.root.classList.contains("rs-idle")).toBe(false);
  });

  it("keeps the overlay awake while the pointer rests on the skipped list", () => {
    const overlay = createOverlay(noopHandlers());
    overlay.show();
    overlay.root.dispatchEvent(new Event("mouseleave")); // force idle
    expect(overlay.root.classList.contains("rs-idle")).toBe(true);
    overlay.root
      .querySelector(".rs-skipped-panel")
      ?.dispatchEvent(new Event("mouseenter"));
    expect(overlay.root.classList.contains("rs-idle")).toBe(false);
  });

  it("dismisses an open settings panel when the overlay goes idle", () => {
    const overlay = createOverlay(noopHandlers());
    overlay.show();
    clickByLabel(overlay.root, "Settings");
    const panel = /** @type {HTMLElement | null} */ (
      overlay.root.querySelector(".rs-settings-panel")
    );
    expect(panel?.hidden).toBe(false);
    overlay.root.dispatchEvent(new Event("mouseleave")); // leave → idle
    expect(panel?.hidden).toBe(true);
    expect(overlay.root.classList.contains("rs-idle")).toBe(true);
  });

  it("renders a status message", () => {
    const overlay = createOverlay(noopHandlers());
    overlay.showStatus("No supported media on this page.");
    expect(overlay.root.querySelector(".rs-status")?.textContent).toBe(
      "No supported media on this page.",
    );
  });

  it("clicking play/pause toggles playback without closing the slideshow", () => {
    const onClose = vi.fn();
    /** @type {any} */
    let overlay;
    // The real wiring swaps the icon on toggle, which detaches the click
    // target - the backdrop-close handler must not mistake that for a backdrop.
    const onTogglePlay = vi.fn(() => overlay.setPlaying(false));
    overlay = createOverlay({ ...noopHandlers(), onClose, onTogglePlay });
    overlay.renderCurrent(imageSlide(), {
      index: 0,
      total: 1,
      exhausted: true,
      effectiveSeconds: 5,
      playing: true,
    });
    const play = overlay.root.querySelector(".rs-btn--primary");
    const icon = play?.querySelector(".rs-icon") ?? play;
    icon?.dispatchEvent(new Event("click", { bubbles: true }));
    expect(onTogglePlay).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows a branded logo splash while loading", () => {
    const overlay = createOverlay(noopHandlers());
    overlay.showLoading();
    expect(overlay.root.querySelector(".rs-logo__mark")).toBeTruthy();
    expect(overlay.root.querySelector(".rs-logo__name")?.textContent).toBe(
      "Reddit Slideshow ",
    );
    expect(
      overlay.root.querySelector(".rs-logo__neon")?.getAttribute("aria-label"),
    ).toBe("Spectacular!");
    expect(overlay.root.querySelector(".rs-logo__sub")?.textContent).toBe(
      "Loading…",
    );
  });

  it("clears the loading splash once the first slide renders", () => {
    const overlay = createOverlay(noopHandlers());
    overlay.showLoading();
    expect(overlay.root.querySelector(".rs-logo")).toBeTruthy();
    overlay.renderCurrent(imageSlide(), {
      index: 0,
      total: 1,
      exhausted: true,
      effectiveSeconds: 5,
      playing: true,
    });
    // The splash must not linger as a second grid item beneath the slide.
    expect(overlay.root.querySelector(".rs-logo")).toBeNull();
  });

  it("pins counts and meta independently via rs-pin-count / rs-pin-meta", () => {
    const overlay = createOverlay(noopHandlers());
    overlay.setSettings(
      /** @type {any} */ ({
        ...PANEL_SETTINGS,
        alwaysShowCount: true,
        alwaysShowMeta: false,
      }),
    );
    expect(overlay.root.classList.contains("rs-pin-count")).toBe(true);
    expect(overlay.root.classList.contains("rs-pin-meta")).toBe(false);
    overlay.setSettings(
      /** @type {any} */ ({
        ...PANEL_SETTINGS,
        alwaysShowCount: false,
        alwaysShowMeta: true,
      }),
    );
    expect(overlay.root.classList.contains("rs-pin-count")).toBe(false);
    expect(overlay.root.classList.contains("rs-pin-meta")).toBe(true);
  });

  it("marks the corner load spinner active while a slide is loading", () => {
    const overlay = createOverlay(noopHandlers());
    const dot = /** @type {HTMLElement} */ (
      overlay.root.querySelector(".rs-loaddot")
    );
    expect(dot).not.toBeNull();
    expect(dot.classList.contains("rs-loaddot--on")).toBe(false);
    // Rendering a slide arms the loading spinner (media never "loads" in the
    // DOM-less test, so it stays on).
    overlay.renderCurrent(imageSlide(), {
      index: 0,
      total: 1,
      exhausted: true,
      effectiveSeconds: 5,
      playing: true,
    });
    expect(dot.classList.contains("rs-loaddot--on")).toBe(true);
    overlay.hide();
    expect(dot.classList.contains("rs-loaddot--on")).toBe(false);
  });

  it("stops and detaches the current video on hide so audio can't keep playing", async () => {
    vi.useRealTimers();
    const overlay = createOverlay({
      ...noopHandlers(),
      resolveMedia: vi.fn(async () => "blob:fake-hide"),
    });
    renderProxiedVideo(overlay);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(overlay.root.querySelector("video")).toBeTruthy();
    overlay.hide();
    expect(overlay.root.querySelector("video")).toBeNull();
  });

  it("tears down the current video when a status card replaces it", async () => {
    vi.useRealTimers();
    const overlay = createOverlay({
      ...noopHandlers(),
      resolveMedia: vi.fn(async () => "blob:fake-status"),
    });
    renderProxiedVideo(overlay);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(overlay.root.querySelector("video")).toBeTruthy();
    overlay.showStatus("No more media to show.");
    expect(overlay.root.querySelector("video")).toBeNull();
    expect(overlay.root.querySelector(".rs-status")?.textContent).toBe(
      "No more media to show.",
    );
  });

  it("reports the true skip total even when the retained list is capped", () => {
    const overlay = createOverlay(noopHandlers());
    const badge = /** @type {HTMLElement | null} */ (
      overlay.root.querySelector(".rs-skipped")
    );
    // 250 skips occurred but only the most recent one is retained.
    overlay.setSkipped([imageSlide({ title: "most recent skip" })], 250);
    expect(badge?.textContent).toBe("250 skipped");
    badge?.dispatchEvent(new Event("click", { bubbles: true }));
    expect(
      overlay.root.querySelector(".rs-skipped-panel__note")?.textContent,
    ).toBe("Showing the most recent 1.");
  });

  it("skips broken media via onMediaFailed instead of dwelling", () => {
    const onMediaFailed = vi.fn();
    const overlay = createOverlay({ ...noopHandlers(), onMediaFailed });
    overlay.renderCurrent(imageSlide({ title: "Broken" }), {
      index: 0,
      total: 2,
      exhausted: false,
      effectiveSeconds: 5,
      playing: true,
    });
    overlay.root
      .querySelector(".reddit-slideshow-media")
      ?.dispatchEvent(new Event("error"));
    expect(onMediaFailed).toHaveBeenCalledTimes(1);
    expect(onMediaFailed.mock.calls[0][1]).toBe("Image didn't load");
    expect(overlay.root.querySelector(".rs-placeholder")).toBeNull();
  });

  it("shows a clickable skipped count and lists the skipped items", () => {
    const onOpenOriginal = vi.fn();
    const overlay = createOverlay({ ...noopHandlers(), onOpenOriginal });
    const badge = /** @type {HTMLElement | null} */ (
      overlay.root.querySelector(".rs-skipped")
    );
    expect(badge?.hidden).toBe(true);

    overlay.setSkipped([
      imageSlide({ title: "Dead clip", sourceUrl: "https://v.redd.it/x" }),
    ]);
    expect(badge?.hidden).toBe(false);
    expect(badge?.textContent).toBe("1 skipped");

    badge?.dispatchEvent(new Event("click", { bubbles: true }));
    const item = overlay.root.querySelector(".rs-skipped-panel__item");
    expect(item?.textContent).toBe("Dead clip");
    item?.dispatchEvent(new Event("click", { bubbles: true }));
    expect(onOpenOriginal).toHaveBeenCalledTimes(1);
  });

  it("shows the skip reason next to each skipped item", () => {
    const overlay = createOverlay(noopHandlers());
    overlay.setSkipped(
      [imageSlide({ title: "Dupe", skipReason: "Duplicate image" })],
      1,
    );
    /** @type {HTMLElement} */ (
      overlay.root.querySelector(".rs-skipped")
    ).dispatchEvent(new Event("click", { bubbles: true }));
    expect(
      overlay.root.querySelector(".rs-skipped-panel__text")?.textContent,
    ).toBe("Dupe");
    expect(
      overlay.root.querySelector(".rs-skipped-panel__reason")?.textContent,
    ).toBe("Duplicate image");
  });

  it("shows domain + type columns and flags auto-skipped slides in the jump list", () => {
    const overlay = createOverlay(noopHandlers());
    overlay.setJumpList(
      [
        imageSlide({ sourceUrl: "https://i.redd.it/a.jpg" }),
        imageSlide({ kind: "video", sourceUrl: "https://v.redd.it/b" }),
        imageSlide({ isGif: true, sourceUrl: "https://i.imgur.com/c.gif" }),
        imageSlide({
          skipReason: "Unavailable",
          sourceUrl: "https://www.redgifs.com/watch/d",
        }),
      ],
      0,
      1,
    );
    /** @type {HTMLElement} */ (
      overlay.root.querySelector(".rs-meta__counter")
    ).dispatchEvent(new Event("click", { bubbles: true }));
    // The click bubbles to the backdrop handler; the counter's cluster must be on
    // its allowlist or the panel would be dismissed the instant it opened.
    expect(
      /** @type {HTMLElement | null} */ (
        overlay.root.querySelector(".rs-jump-panel")
      )?.hidden,
    ).toBe(false);
    const items = overlay.root.querySelectorAll(".rs-jump-panel__item");
    const domain = (/** @type {number} */ i) =>
      items[i].querySelector(".rs-jump-panel__domain")?.textContent;
    const type = (/** @type {number} */ i) =>
      items[i].querySelector(".rs-jump-panel__type")?.textContent;
    // Domain column = source host (www. stripped); type column = asset kind.
    expect(domain(0)).toBe("i.redd.it");
    expect(type(0)).toBe("image");
    expect(type(1)).toBe("video");
    expect(domain(2)).toBe("i.imgur.com");
    expect(type(2)).toBe("gif");
    // An auto-skipped slide stays listed, dimmed, with the type column showing
    // the specific skip reason in place of the asset kind.
    expect(domain(3)).toBe("redgifs.com");
    expect(items[3].classList.contains("rs-jump-panel__item--skipped")).toBe(
      true,
    );
    expect(type(3)).toBe("Unavailable");
    expect(
      items[3]
        .querySelector(".rs-jump-panel__type")
        ?.classList.contains("rs-jump-panel__type--reason"),
    ).toBe(true);
  });

  it("shows each post's title as the primary line, with domain + type as a subline", () => {
    const overlay = createOverlay(noopHandlers());
    overlay.setJumpList(
      [
        imageSlide({
          title: "First post",
          sourceUrl: "https://i.redd.it/a.jpg",
        }),
        imageSlide({
          title: "Second post",
          isGif: true,
          sourceUrl: "https://i.imgur.com/c.gif",
        }),
      ],
      0,
      1,
    );
    /** @type {HTMLElement} */ (
      overlay.root.querySelector(".rs-meta__counter")
    ).dispatchEvent(new Event("click", { bubbles: true }));
    const items = overlay.root.querySelectorAll(".rs-jump-panel__item");
    const name = (/** @type {number} */ i) =>
      items[i].querySelector(".rs-jump-panel__name");
    // The post title is the primary line; full text stays in the DOM (CSS
    // ellipsizes it) and on the title attribute for hover.
    expect(name(0)?.textContent).toBe("First post");
    expect(name(0)?.getAttribute("title")).toBe("First post");
    expect(name(1)?.textContent).toBe("Second post");
    // The domain + type still render alongside it as the muted subline.
    expect(items[0].querySelector(".rs-jump-panel__domain")?.textContent).toBe(
      "i.redd.it",
    );
    expect(items[1].querySelector(".rs-jump-panel__type")?.textContent).toBe(
      "gif",
    );
  });

  it("scrolls to the current post once the jump panel is shown, not while hidden", () => {
    const overlay = createOverlay(noopHandlers());
    overlay.setJumpList(
      [
        imageSlide({ title: "a" }),
        imageSlide({ title: "b" }),
        imageSlide({ title: "c" }),
      ],
      2,
      1,
    );
    const panel = /** @type {HTMLElement} */ (
      overlay.root.querySelector(".rs-jump-panel")
    );
    // scrollIntoView is a no-op while the panel is display:none, so the fix must
    // scroll only after it's unhidden. Record the panel's hidden state per call.
    /** @type {boolean[]} */
    const hiddenAtScroll = [];
    const spy = vi
      .spyOn(Element.prototype, "scrollIntoView")
      .mockImplementation(() => {
        hiddenAtScroll.push(panel.hidden);
      });
    try {
      /** @type {HTMLElement} */ (
        overlay.root.querySelector(".rs-meta__counter")
      ).dispatchEvent(new Event("click", { bubbles: true }));
    } finally {
      spy.mockRestore();
    }
    expect(hiddenAtScroll).toEqual([false]);
  });

  it("pulses the position counter on a manual nav", () => {
    const overlay = createOverlay(noopHandlers());
    const counter = overlay.root.querySelector(".rs-meta__counter");
    expect(counter?.classList.contains("rs-meta__counter--pulse")).toBe(false);
    overlay.notifyManualNav();
    expect(counter?.classList.contains("rs-meta__counter--pulse")).toBe(true);
  });

  it("skips a slide whose media URL is unsafe (non-HTTPS)", async () => {
    const onMediaFailed = vi.fn();
    const overlay = createOverlay({ ...noopHandlers(), onMediaFailed });
    overlay.renderCurrent(imageSlide({ mediaUrl: "http://i.redd.it/x.jpg" }), {
      index: 0,
      total: 2,
      exhausted: false,
      effectiveSeconds: 5,
      playing: true,
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(onMediaFailed).toHaveBeenCalledTimes(1);
    expect(onMediaFailed.mock.calls[0][1]).toBe("Unsupported link");
  });

  it("swaps in a placeholder when media fails to load", () => {
    const overlay = createOverlay(noopHandlers());
    overlay.renderCurrent(imageSlide({ title: "Removed post" }), {
      index: 0,
      total: 1,
      exhausted: true,
      effectiveSeconds: 5,
      playing: true,
    });
    const media = overlay.root.querySelector(".reddit-slideshow-media");
    media?.dispatchEvent(new Event("error"));
    expect(
      overlay.root.querySelector(".rs-placeholder__title")?.textContent,
    ).toBe("Removed post");
  });

  it("shows the timer bar only for video slides under the default mode", async () => {
    vi.useRealTimers();
    const overlay = createOverlay(noopHandlers());
    overlay.show();
    const timer = /** @type {HTMLElement | null} */ (
      overlay.root.querySelector(".rs-timer")
    );

    // Default mode is "video": an image slide gets no bar.
    overlay.renderCurrent(
      imageSlide({ id: "img", mediaUrl: "https://i.redd.it/img.jpg" }),
      {
        index: 0,
        total: 2,
        exhausted: false,
        effectiveSeconds: 5,
        playing: true,
      },
    );
    overlay.root
      .querySelector('img[src="https://i.redd.it/img.jpg"]')
      ?.dispatchEvent(new Event("load"));
    await Promise.resolve();
    await Promise.resolve();
    expect(timer?.hidden).toBe(true);

    // A video slide does get the bar.
    overlay.renderCurrent(
      imageSlide({
        id: "vid",
        kind: "video",
        durationMode: "media",
        mediaUrl: "https://v.redd.it/vid.mp4",
      }),
      {
        index: 1,
        total: 2,
        exhausted: false,
        effectiveSeconds: 5,
        playing: true,
      },
    );
    overlay.root.querySelector("video")?.dispatchEvent(new Event("loadeddata"));
    await Promise.resolve();
    await Promise.resolve();
    expect(timer?.hidden).toBe(false);
  });

  it("shows the timer bar for images when the mode is 'all'", async () => {
    vi.useRealTimers();
    const overlay = createOverlay(noopHandlers());
    overlay.setSettings(
      /** @type {any} */ ({ ...PANEL_SETTINGS, timerBar: "all" }),
    );
    overlay.show();
    overlay.renderCurrent(imageSlide({ mediaUrl: "https://i.redd.it/a.jpg" }), {
      index: 0,
      total: 1,
      exhausted: true,
      effectiveSeconds: 5,
      playing: true,
    });
    overlay.root
      .querySelector('img[src="https://i.redd.it/a.jpg"]')
      ?.dispatchEvent(new Event("load"));
    await Promise.resolve();
    await Promise.resolve();
    expect(
      /** @type {HTMLElement | null} */ (
        overlay.root.querySelector(".rs-timer")
      )?.hidden,
    ).toBe(false);
  });

  it("toggles the buffering hint", () => {
    const overlay = createOverlay(noopHandlers());
    const hint = /** @type {HTMLElement | null} */ (
      overlay.root.querySelector(".rs-buffering")
    );
    expect(hint?.hidden).toBe(true);
    overlay.setBuffering(true);
    expect(hint?.hidden).toBe(false);
    overlay.setBuffering(false);
    expect(hint?.hidden).toBe(true);
  });

  /**
   * @param {Overlay} overlay
   * @param {string} id
   * @param {number} index
   * @param {string} [transition]
   */
  function renderImageAt(overlay, id, index, transition = "fade") {
    overlay.renderCurrent(
      imageSlide({ id, mediaUrl: `https://i.redd.it/${id}.jpg` }),
      {
        index,
        total: 3,
        exhausted: false,
        effectiveSeconds: 5,
        playing: true,
        transition,
      },
    );
  }

  /**
   * @param {Overlay} overlay
   * @param {string} id
   */
  function imgFor(overlay, id) {
    return /** @type {HTMLImageElement | null} */ (
      overlay.root.querySelector(`img[src="https://i.redd.it/${id}.jpg"]`)
    );
  }

  /**
   * Drive an image slide to "ready": dispatch load, then flush the decode()
   * microtask the swap waits on.
   * @param {Overlay} overlay
   * @param {string} id
   */
  async function markImageReady(overlay, id) {
    imgFor(overlay, id)?.dispatchEvent(new Event("load"));
    await Promise.resolve();
    await Promise.resolve();
  }

  it("holds the previous slide on screen until the next is decoded (no gap)", async () => {
    vi.useRealTimers();
    const overlay = createOverlay(noopHandlers());
    overlay.show();

    renderImageAt(overlay, "a", 0);
    await markImageReady(overlay, "a");
    expect(overlay.root.querySelectorAll(".rs-slide").length).toBe(1);

    // Advance: the new slide is not ready yet, so "a" must stay on screen
    // rather than being replaced by a black/loading gap.
    renderImageAt(overlay, "b", 1);
    expect(overlay.root.querySelectorAll(".rs-slide").length).toBe(2);
    expect(imgFor(overlay, "a")).toBeTruthy();

    // Once "b" is decoded, "a" transitions out and is retired.
    await markImageReady(overlay, "b");
    overlay.root
      .querySelector(".rs-slide--exit")
      ?.dispatchEvent(new Event("animationend"));
    expect(imgFor(overlay, "a")).toBeNull();
    expect(imgFor(overlay, "b")).toBeTruthy();
    expect(overlay.root.querySelectorAll(".rs-slide").length).toBe(1);
  });

  it("holds the committed frame, not an undecoded pending one, on a rapid 3rd advance", async () => {
    vi.useRealTimers();
    const overlay = createOverlay(noopHandlers());
    overlay.show();

    // A committed + visible.
    renderImageAt(overlay, "a", 0);
    await markImageReady(overlay, "a");
    expect(overlay.root.querySelectorAll(".rs-slide").length).toBe(1);

    // Advance to B but never ready it - A stays visible under the pending B.
    renderImageAt(overlay, "b", 1);
    expect(overlay.root.querySelectorAll(".rs-slide").length).toBe(2);

    // Advance again to C (also unready). The flush must retire the never-committed
    // pending B and keep the committed A, so the only visible frame is never
    // removed while an undecoded frame is held.
    renderImageAt(overlay, "c", 2);
    expect(imgFor(overlay, "a")).toBeTruthy(); // committed A still on screen
    expect(imgFor(overlay, "b")).toBeNull(); // pending B retired, not held
    expect(imgFor(overlay, "c")).toBeTruthy(); // new pending C layered on
    const a = imgFor(overlay, "a")?.closest(".rs-slide");
    expect(a?.classList.contains("rs-slide--pending")).toBe(false); // A is the live frame

    // Once C decodes, A transitions out and is retired.
    await markImageReady(overlay, "c");
    overlay.root
      .querySelector(".rs-slide--exit")
      ?.dispatchEvent(new Event("animationend"));
    expect(imgFor(overlay, "a")).toBeNull();
    expect(imgFor(overlay, "c")).toBeTruthy();
    expect(overlay.root.querySelectorAll(".rs-slide").length).toBe(1);
  });

  it("tags the incoming frame with the chosen transition and direction", async () => {
    vi.useRealTimers();
    const overlay = createOverlay(noopHandlers());
    overlay.show();

    renderImageAt(overlay, "a", 1, "slide");
    await markImageReady(overlay, "a");
    const frame = /** @type {HTMLElement | null} */ (
      overlay.root.querySelector(".rs-slide")
    );
    expect(frame?.classList.contains("rs-tx-slide")).toBe(true);
    expect(frame?.classList.contains("rs-dir-fwd")).toBe(true);

    // Going backward (lower index) flips the direction class on the next frame.
    renderImageAt(overlay, "b", 0, "slide");
    await markImageReady(overlay, "b");
    const incoming = imgFor(overlay, "b")?.closest(".rs-slide");
    expect(incoming?.classList.contains("rs-dir-back")).toBe(true);
  });

  it("exposes dialog roles and a polite live region", () => {
    const overlay = createOverlay(noopHandlers());
    expect(overlay.root.getAttribute("role")).toBe("dialog");
    expect(overlay.root.getAttribute("aria-modal")).toBe("true");
    expect(overlay.root.getAttribute("aria-label")).toBe("Reddit slideshow");
    const confirm = /** @type {HTMLElement | null} */ (
      overlay.root.querySelector(".rs-confirm")
    );
    expect(confirm?.getAttribute("role")).toBe("alertdialog");
    expect(confirm?.getAttribute("aria-labelledby")).toBe("rs-confirm-text");
    const live = /** @type {HTMLElement | null} */ (
      overlay.root.querySelector(".rs-live")
    );
    expect(live?.getAttribute("aria-live")).toBe("polite");
  });

  it("moves focus into the dialog on show and restores it on hide", () => {
    const prior = document.createElement("button");
    document.body.append(prior);
    prior.focus();
    expect(document.activeElement).toBe(prior);

    const overlay = createOverlay(noopHandlers());
    document.documentElement.append(overlay.root);
    overlay.show();
    expect(document.activeElement).toBe(overlay.root);
    overlay.hide();
    expect(document.activeElement).toBe(prior);

    overlay.root.remove();
    prior.remove();
  });

  it("announces the slide position and title in the live region", () => {
    const overlay = createOverlay(noopHandlers());
    overlay.show();
    overlay.renderCurrent(imageSlide({ title: "Sunset", over18: true }), {
      index: 2,
      total: 50,
      exhausted: false,
      effectiveSeconds: 5,
      playing: true,
    });
    expect(overlay.root.querySelector(".rs-live")?.textContent).toBe(
      "3 of 50, Sunset, NSFW",
    );
  });

  it("announces a fresh auto-skip but not the start-of-run reset", () => {
    const overlay = createOverlay(noopHandlers());
    const live = /** @type {HTMLElement | null} */ (
      overlay.root.querySelector(".rs-live")
    );
    // Start-of-run reset to zero: no announcement.
    overlay.setSkipped([], 0);
    expect(live?.textContent).toBe("");
    // A new skip increments the total → announce it.
    overlay.setSkipped([imageSlide({ title: "Dead clip" })], 1);
    expect(live?.textContent).toBe("Skipped unavailable media: Dead clip");
  });

  it("pluralizes the skipped badge and tooltip via tn() for singular and plural counts", () => {
    const overlay = createOverlay(noopHandlers());
    const badge = /** @type {HTMLElement | null} */ (
      overlay.root.querySelector(".rs-skipped")
    );
    // Singular (total = 1): _one category.
    overlay.setSkipped([imageSlide({ title: "Dead clip" })], 1);
    expect(badge?.textContent).toBe("1 skipped");
    expect(badge?.title).toBe("1 item skipped - click to view");
    // Plural (total = 3): _other category.
    overlay.setSkipped(
      [
        imageSlide({ title: "Dead clip 1" }),
        imageSlide({ title: "Dead clip 2" }),
        imageSlide({ title: "Dead clip 3" }),
      ],
      3,
    );
    expect(badge?.textContent).toBe("3 skipped");
    expect(badge?.title).toBe("3 items skipped - click to view");
  });

  it("dismissTopLayer closes the confirm first, then panels, returning false when empty", () => {
    const overlay = createOverlay(noopHandlers());
    expect(overlay.dismissTopLayer()).toBe(false); // nothing open

    // Open the settings panel; dismissTopLayer closes it and reports true.
    clickByLabel(overlay.root, "Settings");
    const panel = /** @type {HTMLElement | null} */ (
      overlay.root.querySelector(".rs-settings-panel")
    );
    expect(panel?.hidden).toBe(false);
    expect(overlay.dismissTopLayer()).toBe(true);
    expect(panel?.hidden).toBe(true);

    // The confirm popover is dismissed before any panel.
    const click = (/** @type {Element | null | undefined} */ el) =>
      el?.dispatchEvent(new Event("click", { bubbles: true }));
    overlay.show();
    // Past slide 20 so a backdrop click raises the confirm.
    overlay.renderCurrent(imageSlide(), {
      index: 24,
      total: 50,
      exhausted: false,
      effectiveSeconds: 5,
      playing: true,
    });
    click(overlay.root.querySelector(".rs-stage")); // backdrop → confirm
    const confirm = /** @type {HTMLElement | null} */ (
      overlay.root.querySelector(".rs-confirm")
    );
    expect(confirm?.hidden).toBe(false);
    expect(overlay.dismissTopLayer()).toBe(true);
    expect(confirm?.hidden).toBe(true);
  });

  it("flashMessage shows a transient toast with the given text", () => {
    const overlay = createOverlay(noopHandlers());
    overlay.flashMessage("Blocked u/spez");
    const flash = /** @type {HTMLElement} */ (
      overlay.root.querySelector(".rs-vote-flash")
    );
    expect(flash.textContent).toBe("Blocked u/spez");
    expect(flash.hidden).toBe(false);
    vi.advanceTimersByTime(1300);
    expect(flash.hidden).toBe(true);
  });

  it("flashMessage error variant uses the error class", () => {
    const overlay = createOverlay(noopHandlers());
    overlay.flashMessage("Couldn't do that", "error");
    const flash = /** @type {HTMLElement} */ (
      overlay.root.querySelector(".rs-vote-flash")
    );
    expect(flash.className).toContain("rs-vote-flash--error");
  });
});

describe("help panel", () => {
  const helpLabel = "Keyboard shortcuts (?)";
  /** @param {Overlay} overlay @returns {HTMLElement | undefined} */
  function helpBtn(overlay) {
    return /** @type {HTMLElement | undefined} */ (
      [...overlay.root.querySelectorAll(".rs-controls .rs-btn")].find(
        (b) => b.getAttribute("aria-label") === helpLabel,
      )
    );
  }
  /** @param {Overlay} overlay @returns {HTMLElement | null} */
  const helpPanel = (overlay) => overlay.root.querySelector(".rs-help-panel");
  /** @param {Overlay} overlay @returns {HTMLElement | null} */
  const settingsPanel = (overlay) =>
    overlay.root.querySelector(".rs-settings-panel");

  it("has a (?) help button in the control rail", () => {
    const overlay = createOverlay(noopHandlers());
    expect(helpBtn(overlay)).toBeTruthy();
  });

  it("toggles the shortcuts panel from the help button", () => {
    const overlay = createOverlay(noopHandlers());
    overlay.show();
    const panel = helpPanel(overlay);
    expect(panel?.hidden).toBe(true);
    helpBtn(overlay)?.click();
    expect(panel?.hidden).toBe(false);
    helpBtn(overlay)?.click();
    expect(panel?.hidden).toBe(true);
  });

  it("opening help closes the settings panel (centered cards don't stack)", () => {
    const overlay = createOverlay(noopHandlers());
    overlay.show();
    const gear = /** @type {HTMLElement | undefined} */ (
      [...overlay.root.querySelectorAll(".rs-controls .rs-btn")].find(
        (b) => b.getAttribute("aria-label") === "Settings",
      )
    );
    gear?.click();
    expect(settingsPanel(overlay)?.hidden).toBe(false);
    helpBtn(overlay)?.click();
    expect(helpPanel(overlay)?.hidden).toBe(false);
    expect(settingsPanel(overlay)?.hidden).toBe(true);
  });

  it("a backdrop click dismisses the help panel, not the show", () => {
    const onClose = vi.fn();
    const overlay = createOverlay({ ...noopHandlers(), onClose });
    overlay.show();
    helpBtn(overlay)?.click();
    expect(helpPanel(overlay)?.hidden).toBe(false);
    overlay.root.dispatchEvent(new Event("click", { bubbles: true }));
    expect(helpPanel(overlay)?.hidden).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("dismissTopLayer closes the help panel and returns true", () => {
    const overlay = createOverlay(noopHandlers());
    overlay.show();
    helpBtn(overlay)?.click();
    expect(overlay.dismissTopLayer()).toBe(true);
    expect(helpPanel(overlay)?.hidden).toBe(true);
    expect(overlay.dismissTopLayer()).toBe(false);
  });

  it("hide() closes the help panel", () => {
    const overlay = createOverlay(noopHandlers());
    overlay.show();
    helpBtn(overlay)?.click();
    overlay.hide();
    expect(helpPanel(overlay)?.hidden).toBe(true);
  });

  it("going idle hides the help panel", () => {
    const overlay = createOverlay(noopHandlers());
    overlay.show();
    helpBtn(overlay)?.click();
    overlay.root.dispatchEvent(new Event("mouseleave"));
    expect(helpPanel(overlay)?.hidden).toBe(true);
  });
});

describe("auto-hide video controls", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    document.body.inert = false;
  });

  /** @param {Overlay} overlay @returns {HTMLVideoElement} */
  function renderVideoSlide(overlay) {
    overlay.renderCurrent(
      imageSlide({
        kind: "video",
        durationMode: "media",
        mediaUrl: "https://v.redd.it/abc123/DASH_720.mp4",
        sourceUrl: "https://v.redd.it/abc123/DASH_720.mp4",
      }),
      {
        index: 0,
        total: 1,
        exhausted: true,
        effectiveSeconds: 5,
        playing: true,
      },
    );
    return /** @type {HTMLVideoElement} */ (
      overlay.root.querySelector("video")
    );
  }

  it("starts with native controls hidden", () => {
    const overlay = createOverlay(noopHandlers());
    overlay.show();
    expect(renderVideoSlide(overlay).controls).toBe(false);
  });

  it("reveals controls on pointer activity over the video", () => {
    const overlay = createOverlay(noopHandlers());
    overlay.show();
    const video = renderVideoSlide(overlay);
    video.dispatchEvent(new Event("pointermove"));
    expect(video.controls).toBe(true);
  });

  it("hides controls when the pointer leaves the video", () => {
    const overlay = createOverlay(noopHandlers());
    overlay.show();
    const video = renderVideoSlide(overlay);
    video.dispatchEvent(new Event("pointerenter"));
    expect(video.controls).toBe(true);
    video.dispatchEvent(new Event("pointerleave"));
    expect(video.controls).toBe(false);
  });

  it("re-hides controls after the pointer goes idle", () => {
    const overlay = createOverlay(noopHandlers());
    overlay.show();
    const video = renderVideoSlide(overlay);
    video.dispatchEvent(new Event("pointermove"));
    expect(video.controls).toBe(true);
    vi.advanceTimersByTime(2000);
    expect(video.controls).toBe(false);
  });

  it("re-shows controls on a later pointer move after idle", () => {
    const overlay = createOverlay(noopHandlers());
    overlay.show();
    const video = renderVideoSlide(overlay);
    video.dispatchEvent(new Event("pointermove"));
    vi.advanceTimersByTime(2000);
    expect(video.controls).toBe(false);
    video.dispatchEvent(new Event("pointermove"));
    expect(video.controls).toBe(true);
  });

  it("does not reveal controls at the start or end of the clip", () => {
    const overlay = createOverlay(noopHandlers());
    overlay.show();
    const video = renderVideoSlide(overlay);
    video.dispatchEvent(new Event("loadeddata")); // playback starts
    expect(video.controls).toBe(false);
    video.dispatchEvent(new Event("ended")); // playback ends
    expect(video.controls).toBe(false);
  });

  it("tears down the pointer listeners when the frame is retired", () => {
    const overlay = createOverlay(noopHandlers());
    overlay.show();
    const video = renderVideoSlide(overlay);
    video.dispatchEvent(new Event("pointermove"));
    expect(video.controls).toBe(true);
    // A new render aborts the old frame's media listeners, which hides its
    // controls; further pointer events on the detached video do nothing.
    overlay.renderCurrent(
      imageSlide({ id: "later", mediaUrl: "https://i.redd.it/later.jpg" }),
      {
        index: 1,
        total: 2,
        exhausted: true,
        effectiveSeconds: 5,
        playing: true,
      },
    );
    expect(video.controls).toBe(false);
    video.dispatchEvent(new Event("pointermove"));
    expect(video.controls).toBe(false);
  });
});

describe("mute state (single source of truth)", () => {
  /**
   * @param {Overlay} overlay
   * @returns {HTMLVideoElement}
   */
  function renderRedditVideo(overlay) {
    overlay.renderCurrent(
      imageSlide({
        kind: "video",
        durationMode: "media",
        mediaUrl: "https://v.redd.it/abc/DASH_720.mp4",
        sourceUrl: "https://v.redd.it/abc/DASH_720.mp4",
      }),
      {
        index: 0,
        total: 1,
        exhausted: true,
        effectiveSeconds: 5,
        playing: true,
      },
    );
    return /** @type {HTMLVideoElement} */ (
      overlay.root.querySelector("video")
    );
  }

  it("reads the muted state from the isMuted handler at render", () => {
    const overlay = createOverlay({ ...noopHandlers(), isMuted: () => false });
    overlay.show();
    expect(renderRedditVideo(overlay).muted).toBe(false);
  });

  it("defaults to muted when no isMuted handler is provided", () => {
    const overlay = createOverlay(noopHandlers());
    overlay.show();
    expect(renderRedditVideo(overlay).muted).toBe(true);
  });
});

describe("manual zoom while paused", () => {
  afterEach(() => {
    document.body.inert = false;
  });

  /** @param {Overlay} overlay */
  async function renderPausedImage(overlay) {
    overlay.show();
    overlay.setPlaying(false);
    overlay.renderCurrent(imageSlide({ mediaUrl: "https://i.redd.it/a.jpg" }), {
      index: 0,
      total: 1,
      exhausted: true,
      effectiveSeconds: 5,
      playing: false,
    });
    overlay.root
      .querySelector('img[src="https://i.redd.it/a.jpg"]')
      ?.dispatchEvent(new Event("load"));
    await Promise.resolve();
    await Promise.resolve();
    return /** @type {HTMLElement} */ (overlay.root.querySelector(".rs-slide"));
  }

  /** @param {Element} target @param {number} deltaY */
  function spinWheel(target, deltaY) {
    target.dispatchEvent(
      new WheelEvent("wheel", {
        deltaY,
        clientX: 120,
        clientY: 90,
        bubbles: true,
        cancelable: true,
      }),
    );
  }

  it("wheel over a paused slide zooms the frame about the pointer", async () => {
    const overlay = createOverlay(noopHandlers());
    const frame = await renderPausedImage(overlay);
    spinWheel(frame, -100);
    expect(frame.style.transform).toMatch(/scale\(1\.\d/);
    expect(frame.style.transformOrigin).toBe("0 0");
    expect(frame.classList.contains("rs-slide--zoomed")).toBe(true);
  });

  it("ignores the wheel when the session reports playing", async () => {
    const overlay = createOverlay({ ...noopHandlers(), isPaused: () => false });
    const frame = await renderPausedImage(overlay);
    spinWheel(frame, -100);
    expect(frame.style.transform).toBe("");
  });

  it("denies zoom when no isPaused handler is wired", async () => {
    // Zoom is a paused-only feature: a host that doesn't report pause state
    // gets no zoom, rather than an always-on one.
    const overlay = createOverlay({ ...noopHandlers(), isPaused: undefined });
    const frame = await renderPausedImage(overlay);
    spinWheel(frame, -100);
    overlay.manualZoomStep(1);
    expect(frame.style.transform).toBe("");
  });

  describe("auto-pause on zoom", () => {
    function playingHandlers() {
      let paused = false;
      const h = {
        ...noopHandlers(),
        toggles: 0,
        isPaused: () => paused,
        onTogglePlay() {
          paused = !paused;
          h.toggles += 1;
        },
      };
      return h;
    }

    it("wheel over a playing slide pauses, zooms, and toasts", async () => {
      const h = playingHandlers();
      const overlay = createOverlay(h);
      const frame = await renderPausedImage(overlay);
      spinWheel(frame, -100);
      expect(h.toggles).toBe(1);
      expect(frame.style.transform).toMatch(/scale\(1\./);
      expect(overlay.root.querySelector(".rs-toast")?.textContent).toMatch(
        /paused/i,
      );
    });

    it("zooming back out fully auto-resumes with a toast", async () => {
      const h = playingHandlers();
      const overlay = createOverlay(h);
      const frame = await renderPausedImage(overlay);
      spinWheel(frame, -100);
      spinWheel(frame, 100);
      expect(h.toggles).toBe(2);
      expect(frame.style.transform).toBe("");
      expect(overlay.root.querySelector(".rs-toast")?.textContent).toMatch(
        /resumed/i,
      );
    });

    it("a manually paused show never auto-resumes on zoom-out", async () => {
      let toggles = 0;
      const overlay = createOverlay({
        ...noopHandlers(),
        onTogglePlay: () => {
          toggles += 1;
        },
      });
      const frame = await renderPausedImage(overlay);
      spinWheel(frame, -100);
      spinWheel(frame, 100);
      expect(toggles).toBe(0);
      expect(overlay.root.querySelector(".rs-toast")).toBeNull();
    });
  });

  it("steps in via manualZoomStep, and Esc-dismiss resets it", async () => {
    const overlay = createOverlay(noopHandlers());
    const frame = await renderPausedImage(overlay);
    overlay.manualZoomStep(1);
    expect(frame.style.transform).toMatch(/scale\(1\.3/);
    // Zoomed counts as the top layer: dismiss resets it instead of closing.
    expect(overlay.dismissTopLayer()).toBe(true);
    expect(frame.style.transform).toBe("");
    // Nothing zoomed and no panel open: nothing to dismiss.
    expect(overlay.dismissTopLayer()).toBe(false);
  });

  it("stepping out never goes below 1 and clears the zoom marker", async () => {
    const overlay = createOverlay(noopHandlers());
    const frame = await renderPausedImage(overlay);
    overlay.manualZoomStep(1);
    overlay.manualZoomStep(-1);
    expect(frame.style.transform).toBe("");
    expect(frame.classList.contains("rs-slide--zoomed")).toBe(false);
  });

  it("keeps the outgoing frame zoomed while the next slide loads", async () => {
    const overlay = createOverlay(noopHandlers());
    const frame = await renderPausedImage(overlay);
    overlay.manualZoomStep(1);
    overlay.renderCurrent(imageSlide({ mediaUrl: "https://i.redd.it/b.jpg" }), {
      index: 1,
      total: 2,
      exhausted: true,
      effectiveSeconds: 5,
      playing: false,
    });
    // The retiring frame holds its zoom until the new slide commits.
    expect(frame.style.transform).toMatch(/scale\(1\.3/);
    overlay.root
      .querySelector('img[src="https://i.redd.it/b.jpg"]')
      ?.dispatchEvent(new Event("load"));
    await Promise.resolve();
    await Promise.resolve();
    const frames = overlay.root.querySelectorAll(".rs-slide");
    const next = /** @type {HTMLElement} */ (frames[frames.length - 1]);
    expect(next.style.transform).toBe("");
  });

  it("resuming play resets the zoom", async () => {
    const overlay = createOverlay(noopHandlers());
    const frame = await renderPausedImage(overlay);
    overlay.manualZoomStep(1);
    overlay.setPlaying(true);
    expect(frame.style.transform).toBe("");
  });

  it("engaging the zoom rewinds a paused pan & zoom hold", async () => {
    const overlay = createOverlay(noopHandlers());
    const frame = await renderPausedImage(overlay);
    const media = /** @type {HTMLElement} */ (
      frame.querySelector(".reddit-slideshow-media")
    );
    // A paused Ken Burns hold mid-sequence; its scale would compound with the
    // manual one, so engaging must rewind it to the whole-image frame.
    const anim = { currentTime: 5000 };
    media.getAnimations = () => [/** @type {Animation} */ (anim)];
    overlay.manualZoomStep(1);
    expect(anim.currentTime).toBe(0);
  });

  /**
   * Give the slide's media real geometry: a source size and an on-screen box
   * that grows with the frame's manual scale, as a real rect would (happy-dom
   * rects are all zeros). The happy-dom viewport is 1024x768 at DPR 1.
   * @param {HTMLElement} frame
   * @param {{ w: number, h: number, naturalW: number, naturalH: number }} geo
   */
  function stubMediaGeometry(frame, geo) {
    const media = /** @type {HTMLImageElement} */ (
      frame.querySelector(".reddit-slideshow-media")
    );
    Object.defineProperty(media, "naturalWidth", { value: geo.naturalW });
    Object.defineProperty(media, "naturalHeight", { value: geo.naturalH });
    media.getBoundingClientRect = () => {
      const m = /scale\(([\d.]+)\)/.exec(frame.style.transform);
      const s = m ? Number(m[1]) : 1;
      return /** @type {DOMRect} */ ({
        left: 0,
        top: 0,
        width: geo.w * s,
        height: geo.h * s,
      });
    };
  }

  it("wheel zoom stops at twice the source's native detail", async () => {
    const overlay = createOverlay(noopHandlers());
    const frame = await renderPausedImage(overlay);
    // 1200x900 source shown at 400x300: native 1:1 at 3x, headroom to 6x.
    stubMediaGeometry(frame, { w: 400, h: 300, naturalW: 1200, naturalH: 900 });
    for (let i = 0; i < 12; i += 1) spinWheel(frame, -100);
    const scale = Number(/scale\(([\d.]+)\)/.exec(frame.style.transform)?.[1]);
    expect(scale).toBeCloseTo(6);
  });

  describe("LOD canvas for very large images", () => {
    /** @type {Array<[string, unknown[]]>} */
    let ctxCalls;
    let closed = 0;
    const proto = window.HTMLCanvasElement.prototype;
    const origGetContext = proto.getContext;

    beforeEach(() => {
      ctxCalls = [];
      closed = 0;
      /** @this {HTMLCanvasElement} */
      function fakeGetContext() {
        return {
          canvas: this,
          imageSmoothingQuality: "",
          clearRect: /** @type {(...a: unknown[]) => void} */ (
            (...a) => ctxCalls.push(["clear", a])
          ),
          drawImage: /** @type {(...a: unknown[]) => void} */ (
            (...a) => ctxCalls.push(["draw", a])
          ),
        };
      }
      proto.getContext = /** @type {typeof proto.getContext} */ (
        /** @type {unknown} */ (fakeGetContext)
      );
      /** @param {ImageBitmapSource} _src @param {ImageBitmapOptions} [opts] */
      const fakeCreateImageBitmap = async (_src, opts) => ({
        // A resize-less call (the retained full-resolution level) reports
        // the source's natural size, like the real API.
        width:
          opts?.resizeWidth ??
          /** @type {HTMLImageElement} */ (_src)?.naturalWidth ??
          0,
        height:
          opts?.resizeHeight ??
          /** @type {HTMLImageElement} */ (_src)?.naturalHeight ??
          0,
        close: () => {
          closed += 1;
        },
      });
      window.createImageBitmap =
        /** @type {typeof window.createImageBitmap} */ (
          /** @type {unknown} */ (fakeCreateImageBitmap)
        );
    });

    afterEach(() => {
      proto.getContext = origGetContext;
      Reflect.deleteProperty(window, "createImageBitmap");
    });

    /**
     * First wheel starts the mip build on the transform path; once the
     * levels resolve, the next interaction activates the canvas.
     * @param {Overlay} overlay
     */
    async function zoomHuge(overlay) {
      const frame = await renderPausedImage(overlay);
      stubMediaGeometry(frame, {
        w: 700,
        h: 933,
        naturalW: 9000,
        naturalH: 12000,
      });
      spinWheel(frame, -100);
      for (let i = 0; i < 8; i += 1) await Promise.resolve();
      spinWheel(frame, -100);
      return frame;
    }

    it("zooms a huge image through a canvas, hiding the media", async () => {
      const overlay = createOverlay(noopHandlers());
      const frame = await zoomHuge(overlay);
      const canvas = overlay.root.querySelector(".rs-zoom-canvas");
      expect(canvas).toBeTruthy();
      expect(frame.classList.contains("rs-slide--lod")).toBe(true);
      const img = /** @type {HTMLElement} */ (
        frame.querySelector(".reddit-slideshow-media")
      );
      expect(img.style.visibility).toBe("hidden");
      expect(ctxCalls.some(([op]) => op === "draw")).toBe(true);
    });

    it("pausing pre-builds the levels so the first zoom uses the canvas", async () => {
      const overlay = createOverlay(noopHandlers());
      const frame = await renderPausedImage(overlay);
      stubMediaGeometry(frame, {
        w: 700,
        h: 933,
        naturalW: 9000,
        naturalH: 12000,
      });
      overlay.setPlaying(false);
      for (let i = 0; i < 8; i += 1) await Promise.resolve();
      spinWheel(frame, -100);
      expect(overlay.root.querySelector(".rs-zoom-canvas")).toBeTruthy();
    });

    it("a slide rendered while paused pre-builds its levels", async () => {
      // Skipping to the next slide while paused must re-arm the prebuild -
      // pausing itself is not the only way to land on a paused slide.
      const overlay = createOverlay(noopHandlers());
      overlay.show();
      overlay.setPlaying(false);
      overlay.renderCurrent(
        imageSlide({ mediaUrl: "https://i.redd.it/b.jpg" }),
        {
          index: 0,
          total: 1,
          exhausted: true,
          effectiveSeconds: 5,
          playing: false,
        },
      );
      const img = overlay.root.querySelector(
        'img[src="https://i.redd.it/b.jpg"]',
      );
      const frame = /** @type {HTMLElement} */ (img?.closest(".rs-slide"));
      stubMediaGeometry(frame, {
        w: 700,
        h: 933,
        naturalW: 9000,
        naturalH: 12000,
      });
      img?.dispatchEvent(new Event("load"));
      for (let i = 0; i < 8; i += 1) await Promise.resolve();
      spinWheel(frame, -100);
      expect(overlay.root.querySelector(".rs-zoom-canvas")).toBeTruthy();
    });

    it("a huge slide pre-builds its levels even while playing", async () => {
      // Auto-pause means a zoom can start from playback at any moment: the
      // levels must already exist by then.
      let paused = false;
      const overlay = createOverlay({
        ...noopHandlers(),
        isPaused: () => paused,
        onTogglePlay() {
          paused = !paused;
        },
      });
      overlay.show();
      overlay.renderCurrent(
        imageSlide({ mediaUrl: "https://i.redd.it/c.jpg" }),
        {
          index: 0,
          total: 1,
          exhausted: true,
          effectiveSeconds: 5,
          playing: true,
        },
      );
      const img = overlay.root.querySelector(
        'img[src="https://i.redd.it/c.jpg"]',
      );
      const frame = /** @type {HTMLElement} */ (img?.closest(".rs-slide"));
      stubMediaGeometry(frame, {
        w: 700,
        h: 933,
        naturalW: 9000,
        naturalH: 12000,
      });
      img?.dispatchEvent(new Event("load"));
      for (let i = 0; i < 8; i += 1) await Promise.resolve();
      spinWheel(frame, -100);
      expect(overlay.root.querySelector(".rs-zoom-canvas")).toBeTruthy();
      expect(paused).toBe(true);
    });

    it("deep zoom retains one full-resolution bitmap instead of re-reading", async () => {
      const overlay = createOverlay(noopHandlers());
      const frame = await zoomHuge(overlay);
      // Zoom until the needed detail exceeds the top mip (naturalW / 2).
      for (let i = 0; i < 10; i += 1) spinWheel(frame, -100);
      for (let i = 0; i < 8; i += 1) await Promise.resolve();
      spinWheel(frame, -100);
      const draws = ctxCalls.filter(([op]) => op === "draw");
      const lastSrc = /** @type {{ width: number }} */ (
        draws[draws.length - 1][1][0]
      );
      // The draw sources the retained full-size bitmap (fake reports the
      // source's natural size for a resize-less createImageBitmap call).
      expect(lastSrc.width).toBe(9000);
    });

    it("commits on the preview, then upgrades to the original in place", async () => {
      const overlay = createOverlay(noopHandlers());
      overlay.show();
      overlay.setPlaying(false);
      overlay.renderCurrent(
        imageSlide({
          mediaUrl: "https://i.redd.it/orig.jpg",
          previewUrl: "https://preview.redd.it/orig.jpg?width=1080",
          sourceWidth: 9000,
          sourceHeight: 12000,
        }),
        {
          index: 0,
          total: 1,
          exhausted: true,
          effectiveSeconds: 5,
          playing: false,
        },
      );
      const img = /** @type {HTMLImageElement} */ (
        overlay.root.querySelector(
          'img[src="https://preview.redd.it/orig.jpg?width=1080"]',
        )
      );
      expect(img).toBeTruthy();
      img.dispatchEvent(new Event("load"));
      for (let i = 0; i < 4; i += 1) await Promise.resolve();
      // Committed on the preview; the same element now loads the original.
      expect(img.src).toBe("https://i.redd.it/orig.jpg");
      // The upgrade's load arms the LOD prep with the real dimensions.
      const frame = /** @type {HTMLElement} */ (img.closest(".rs-slide"));
      stubMediaGeometry(frame, {
        w: 700,
        h: 933,
        naturalW: 9000,
        naturalH: 12000,
      });
      img.dispatchEvent(new Event("load"));
      for (let i = 0; i < 8; i += 1) await Promise.resolve();
      spinWheel(frame, -100);
      expect(overlay.root.querySelector(".rs-zoom-canvas")).toBeTruthy();
    });

    it("keeps the LOD canvas up while the next slide loads", async () => {
      const overlay = createOverlay(noopHandlers());
      await zoomHuge(overlay);
      expect(overlay.root.querySelector(".rs-zoom-canvas")).toBeTruthy();
      overlay.renderCurrent(
        imageSlide({ mediaUrl: "https://i.redd.it/next.jpg" }),
        {
          index: 1,
          total: 2,
          exhausted: true,
          effectiveSeconds: 5,
          playing: false,
        },
      );
      // Still up during the load; gone once the new slide commits.
      expect(overlay.root.querySelector(".rs-zoom-canvas")).toBeTruthy();
      overlay.root
        .querySelector('img[src="https://i.redd.it/next.jpg"]')
        ?.dispatchEvent(new Event("load"));
      for (let i = 0; i < 8; i += 1) await Promise.resolve();
      expect(overlay.root.querySelector(".rs-zoom-canvas")).toBeNull();
    });

    it("stays on the transform path until the levels are built", async () => {
      const overlay = createOverlay(noopHandlers());
      const frame = await renderPausedImage(overlay);
      stubMediaGeometry(frame, {
        w: 700,
        h: 933,
        naturalW: 9000,
        naturalH: 12000,
      });
      spinWheel(frame, -100);
      expect(overlay.root.querySelector(".rs-zoom-canvas")).toBeNull();
      expect(frame.style.transform).toMatch(/scale\(1\./);
    });

    it("keeps the transform path for ordinary images", async () => {
      const overlay = createOverlay(noopHandlers());
      const frame = await renderPausedImage(overlay);
      stubMediaGeometry(frame, {
        w: 700,
        h: 933,
        naturalW: 4000,
        naturalH: 5333,
      });
      spinWheel(frame, -100);
      expect(overlay.root.querySelector(".rs-zoom-canvas")).toBeNull();
    });

    it("dismissing restores the media and closes the levels", async () => {
      const overlay = createOverlay(noopHandlers());
      const frame = await zoomHuge(overlay);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      expect(overlay.dismissTopLayer()).toBe(true);
      expect(overlay.root.querySelector(".rs-zoom-canvas")).toBeNull();
      const img = /** @type {HTMLElement} */ (
        frame.querySelector(".reddit-slideshow-media")
      );
      expect(img.style.visibility).toBe("");
      expect(closed).toBeGreaterThan(0);
    });

    it("the surface budget does not cap an LOD zoom", async () => {
      const overlay = createOverlay(noopHandlers());
      const frame = await zoomHuge(overlay);
      for (let i = 0; i < 12; i += 1) spinWheel(frame, -100);
      const scale = Number(
        /scale\(([\d.]+)\)/.exec(frame.style.transform)?.[1],
      );
      expect(scale).toBeCloseTo(8);
    });
  });

  it("the surface budget still caps an oversized media box", async () => {
    const overlay = createOverlay(noopHandlers());
    const frame = await renderPausedImage(overlay);
    // If a huge media box slips past the pan & zoom rewind, the
    // rasterized-surface budget keeps the cap small.
    stubMediaGeometry(frame, {
      w: 2048,
      h: 1536,
      naturalW: 2048,
      naturalH: 1536,
    });
    for (let i = 0; i < 10; i += 1) spinWheel(frame, -100);
    const scale = Number(/scale\(([\d.]+)\)/.exec(frame.style.transform)?.[1]);
    expect(scale).toBeCloseTo(2);
  });

  /**
   * @param {Element} target
   * @param {string} type
   * @param {number} x
   * @param {number} y
   * @param {number} [pointerId]
   */
  function pointer(target, type, x, y, pointerId) {
    const event = new MouseEvent(type, {
      clientX: x,
      clientY: y,
      button: 0,
      bubbles: true,
      cancelable: true,
    });
    if (pointerId != null) {
      Object.defineProperty(event, "pointerId", { value: pointerId });
    }
    target.dispatchEvent(event);
  }

  /**
   * happy-dom rects are all zeros; give the frame a real oversized box so
   * the pan clamp allows movement.
   * @param {HTMLElement} frame
   */
  function stubOversizedRect(frame) {
    frame.getBoundingClientRect = () =>
      /** @type {DOMRect} */ ({
        left: -200,
        top: -150,
        width: 1600,
        height: 1200,
      });
  }

  it("dragging a zoomed slide pans it", async () => {
    const overlay = createOverlay(noopHandlers());
    const frame = await renderPausedImage(overlay);
    overlay.manualZoomStep(1);
    const before = frame.style.transform;
    stubOversizedRect(frame);
    pointer(frame, "pointerdown", 300, 300);
    expect(frame.classList.contains("rs-slide--panning")).toBe(true);
    pointer(frame, "pointermove", 260, 320);
    pointer(frame, "pointerup", 260, 320);
    expect(frame.style.transform).not.toBe(before);
    expect(frame.style.transform).toMatch(/scale\(1\.3/); // scale untouched
    expect(frame.classList.contains("rs-slide--panning")).toBe(false);
  });

  it("suppresses the click that follows a drag, so the show stays open", async () => {
    const onClose = vi.fn();
    const overlay = createOverlay({ ...noopHandlers(), onClose });
    const frame = await renderPausedImage(overlay);
    overlay.manualZoomStep(1);
    stubOversizedRect(frame);
    pointer(frame, "pointerdown", 300, 300);
    pointer(frame, "pointermove", 250, 250);
    pointer(frame, "pointerup", 250, 250);
    // The browser fires a click after the drag; its target after retargeting
    // is an ancestor (the root), which the backdrop-close handler would act on.
    pointer(overlay.root, "click", 250, 250);
    expect(onClose).not.toHaveBeenCalled();
    // A later plain backdrop click still closes.
    pointer(overlay.root, "click", 10, 10);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not pan when not zoomed", async () => {
    const overlay = createOverlay(noopHandlers());
    const frame = await renderPausedImage(overlay);
    pointer(frame, "pointerdown", 300, 300);
    pointer(frame, "pointermove", 250, 250);
    pointer(frame, "pointerup", 250, 250);
    expect(frame.style.transform).toBe("");
    expect(frame.classList.contains("rs-slide--panning")).toBe(false);
  });

  it("a second pointer can neither hijack nor end an active drag", async () => {
    const overlay = createOverlay(noopHandlers());
    const frame = await renderPausedImage(overlay);
    overlay.manualZoomStep(1);
    stubOversizedRect(frame);
    pointer(frame, "pointerdown", 300, 300, 1);
    pointer(frame, "pointermove", 260, 300, 1);
    const afterFirstMove = frame.style.transform;
    // A second touch presses and releases mid-drag; the first drag survives.
    pointer(frame, "pointerdown", 500, 500, 2);
    pointer(frame, "pointerup", 500, 500, 2);
    expect(frame.classList.contains("rs-slide--panning")).toBe(true);
    pointer(frame, "pointermove", 220, 300, 1);
    expect(frame.style.transform).not.toBe(afterFirstMove);
    pointer(frame, "pointerup", 220, 300, 1);
    expect(frame.classList.contains("rs-slide--panning")).toBe(false);
  });

  it("a fullscreen or viewport change resets the zoom (its anchors are stale)", async () => {
    const overlay = createOverlay(noopHandlers());
    const frame = await renderPausedImage(overlay);
    overlay.manualZoomStep(1);
    expect(frame.style.transform).not.toBe("");
    document.dispatchEvent(new Event("fullscreenchange"));
    expect(frame.style.transform).toBe("");
    overlay.manualZoomStep(1);
    window.dispatchEvent(new Event("resize"));
    expect(frame.style.transform).toBe("");
  });

  it("keeps native video controls hidden while inspect-zoomed", async () => {
    const overlay = createOverlay(noopHandlers());
    overlay.show();
    overlay.setPlaying(false);
    overlay.renderCurrent(
      imageSlide({
        kind: "video",
        durationMode: "media",
        mediaUrl: "https://v.redd.it/z/DASH_720.mp4",
      }),
      {
        index: 0,
        total: 1,
        exhausted: true,
        effectiveSeconds: 5,
        playing: false,
      },
    );
    const video = /** @type {HTMLVideoElement} */ (
      overlay.root.querySelector("video")
    );
    video.dispatchEvent(new Event("loadeddata"));
    await Promise.resolve();
    await Promise.resolve();
    // Hovering reveals the native controls on an unzoomed video.
    video.dispatchEvent(new Event("pointermove"));
    expect(video.controls).toBe(true);
    // Zooming hides them, and hovering can't bring them back while zoomed -
    // a drag-to-pan must never fight the native scrub bar.
    overlay.manualZoomStep(1);
    expect(video.controls).toBe(false);
    video.dispatchEvent(new Event("pointermove"));
    expect(video.controls).toBe(false);
  });

  it("a new slide render starts unzoomed", async () => {
    const overlay = createOverlay(noopHandlers());
    await renderPausedImage(overlay);
    overlay.manualZoomStep(1);
    overlay.renderCurrent(
      imageSlide({ id: "next", mediaUrl: "https://i.redd.it/b.jpg" }),
      {
        index: 1,
        total: 2,
        exhausted: true,
        effectiveSeconds: 5,
        playing: false,
      },
    );
    overlay.root
      .querySelector('img[src="https://i.redd.it/b.jpg"]')
      ?.dispatchEvent(new Event("load"));
    await Promise.resolve();
    await Promise.resolve();
    const frames = overlay.root.querySelectorAll(".rs-slide");
    const next = /** @type {HTMLElement} */ (frames[frames.length - 1]);
    expect(next.style.transform).toBe("");
    overlay.manualZoomStep(1);
    expect(next.style.transform).toMatch(/scale\(1\.3/);
  });
});

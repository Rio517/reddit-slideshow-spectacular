import { afterEach, describe, expect, it, vi } from "vitest";
import { createOverlay } from "../../lib/overlay-ui.js";
import { createSlideshowSession } from "../../lib/session.js";
import { imageTimerStopSeconds } from "../../lib/settings.js";

const HOST = "#reddit-slideshow-host";
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

// The overlay UI lives inside the host's open shadow root; query through it.
function shadow() {
  const host = document.querySelector(HOST);
  return /** @type {ShadowRoot | null} */ (host?.shadowRoot ?? null);
}
/** @param {string} sel */
const q = (sel) => shadow()?.querySelector(sel) ?? null;
/** @param {string} sel */
const qa = (sel) => [...(shadow()?.querySelectorAll(sel) ?? [])];

/** @type {Array<{ close: () => void }>} */
let sessions = [];

afterEach(() => {
  for (const session of sessions) session.close();
  sessions = [];
  document.querySelectorAll(HOST).forEach((el) => el.remove());
  document.documentElement.style.overflow = "";
  document.body.inert = false;
});

/**
 * @param {string} id
 * @param {Partial<import("../../lib/slides.js").Slide>} [overrides]
 * @returns {import("../../lib/slides.js").Slide}
 */
function imageSlide(id, overrides) {
  return /** @type {any} */ ({
    id,
    postId: id,
    provider: "reddit-image",
    kind: "image",
    mediaUrl: `https://i.redd.it/${id}.jpg`,
    sourceUrl: `https://i.redd.it/${id}.jpg`,
    permalink: "https://old.reddit.com/r/x/comments/x/x/",
    title: id,
    over18: false,
    durationMode: "timer",
    audioAvailable: false,
    quality: "original",
    filenameHint: `${id}.jpg`,
    ...overrides,
  });
}

/** @param {string} id @param {Record<string, unknown>} [overrides] */
function videoSlide(id, overrides) {
  return /** @type {any} */ ({
    id,
    postId: id,
    provider: "reddit-video",
    kind: "video",
    mediaUrl: `https://v.redd.it/${id}/CMAF_720.mp4`,
    sourceUrl: `https://v.redd.it/${id}`,
    permalink: "https://old.reddit.com/r/x/comments/x/x/",
    title: id,
    over18: false,
    durationMode: "media",
    audioAvailable: false,
    quality: "original",
    filenameHint: `${id}.mp4`,
    ...overrides,
  });
}

/** @param {string} id @param {string | null} after */
function pageOf(id, after) {
  return {
    ok: true,
    page: {
      slides: [imageSlide(id)],
      after,
      exhausted: false,
      postsScanned: 50,
    },
  };
}

/** @param {Record<string, unknown>} [overrides] */
function settings(overrides) {
  return {
    imageTimerSeconds: 5,
    startMuted: true,
    autoplay: false, // deterministic: no auto-advance timer in tests
    includeNsfw: true,
    dedupe: true,
    contentDedup: false,
    alwaysShowCount: true,
    alwaysShowMeta: true,
    maxLoadWaitSeconds: 5,
    transition: "fade",
    timerBar: "all",
    panZoom: false,
    panZoomScale: 2,
    panZoomShowSeconds: 2,
    panZoomZoomInSeconds: 2,
    panZoomPanSeconds: 6,
    panZoomZoomOutSeconds: 2,
    panZoomShowEndSeconds: 2,
    panZoomMinOversize: 1.5,
    locale: "auto",
    downloadSubfolder: "",
    ...overrides,
  };
}

/** @param {Array<any>} pages */
function fakeRequest(pages) {
  let i = 0;
  /** @type {Array<string | undefined>} */
  const calls = [];
  const fn = async (/** @type {string=} */ after) => {
    calls.push(after);
    const page = pages[i++];
    if (page === "fail") return { ok: false, error: { message: "boom" } };
    if (!page) {
      return {
        ok: true,
        page: { slides: [], after: null, exhausted: true, postsScanned: 0 },
      };
    }
    return { ok: true, page };
  };
  return Object.assign(fn, { calls });
}

/**
 * @param {{ pages?: any[], settingsOverrides?: Record<string, unknown>, openUrl?: (url: string) => void, openPopout?: () => void, saveSettings?: (patch: object) => Promise<unknown>, computeImageHash?: (url: string) => Promise<string | null>, createImage?: () => { src: string, decoding?: string }, createVideo?: () => { src: string, preload?: string, muted?: boolean }, resolveMedia?: (url: string) => Promise<string | null>, downloadMedia?: (url: string, filename: string) => void, resolveRedgifs?: (slide: any) => Promise<any>, resolveRedditAudio?: (slide: any) => Promise<string | null>, vote?: (id: string, dir: number) => Promise<any>, block?: (name: string) => Promise<{ ok?: boolean }>, friend?: (name: string) => Promise<{ ok?: boolean }>, frontend?: "old" | "new" }} [opts]
 */
function makeSession({
  pages,
  settingsOverrides,
  openUrl,
  openPopout,
  saveSettings,
  computeImageHash,
  createImage,
  createVideo,
  resolveMedia,
  downloadMedia,
  resolveRedgifs,
  resolveRedditAudio,
  vote,
  block,
  friend,
  frontend,
} = {}) {
  const request = fakeRequest(
    pages ?? [
      {
        slides: [imageSlide("a"), imageSlide("b")],
        after: null,
        exhausted: true,
        postsScanned: 2,
      },
    ],
  );
  const session = createSlideshowSession({
    doc: document,
    createOverlay,
    getSettings: async () => settings(settingsOverrides),
    saveSettings: saveSettings ?? (async () => {}),
    requestPage: request,
    getStartCursor: () => undefined,
    openUrl: openUrl ?? (() => {}),
    openPopout,
    createImage: createImage ?? (() => ({ src: "", decoding: "" })),
    createVideo,
    computeImageHash,
    resolveMedia,
    downloadMedia,
    resolveRedgifs,
    resolveRedditAudio,
    vote,
    block,
    friend,
    frontend,
  });
  sessions.push(session);
  return { session, request };
}

/** @param {string} sel */
const text = (sel) => q(sel)?.textContent;
// The current slide is the newest frame: a render layers it over the previous
// one, which is only retired once the new media is ready (it never "loads" in
// these DOM-less tests, so read the last frame).
const mediaSrc = () => {
  const imgs = qa("img.reddit-slideshow-media");
  return imgs[imgs.length - 1]?.getAttribute("src");
};
/** @param {string} k @returns {any} */
const key = (k) => ({
  key: k,
  isTrusted: true, // a real keypress, not page-script-dispatched
  preventDefault() {},
  stopImmediatePropagation() {},
});

describe("createSlideshowSession", () => {
  it("renders the first slide and position counter", async () => {
    const { session } = makeSession();
    await session.start();
    expect(mediaSrc()).toBe("https://i.redd.it/a.jpg");
    expect(text(".rs-meta__counter")).toBe("1 / 2");
    expect(session.isOpen()).toBe(true);
  });

  it("shows a status when the page has no supported media", async () => {
    const { session } = makeSession({
      pages: [{ slides: [], after: null, exhausted: true, postsScanned: 0 }],
    });
    await session.start();
    expect(text(".rs-status")).toBe("No supported media on this page.");
  });

  it("surfaces a fetch error as a status", async () => {
    const { session } = makeSession({ pages: ["fail"] });
    await session.start();
    expect(text(".rs-status")).toBe("boom");
  });

  it("advances and goes back with arrow keys", async () => {
    const { session } = makeSession();
    await session.start();
    session.handleKeydown(key("ArrowRight"));
    expect(mediaSrc()).toBe("https://i.redd.it/b.jpg");
    expect(text(".rs-meta__counter")).toBe("2 / 2");
    session.handleKeydown(key("ArrowLeft"));
    expect(mediaSrc()).toBe("https://i.redd.it/a.jpg");
  });

  it("shows the end card and replays from the top on the next forward press", async () => {
    const page = {
      slides: [imageSlide("a"), imageSlide("b")],
      after: null,
      exhausted: true,
      postsScanned: 2,
    };
    // Same page both times: a restart re-fetches from the start cursor.
    const { session } = makeSession({ pages: [page, page] });
    await session.start();
    session.handleKeydown(key("ArrowRight")); // -> b (last)
    expect(mediaSrc()).toBe("https://i.redd.it/b.jpg");

    session.handleKeydown(key("ArrowRight")); // past the end -> end card
    expect(q(".rs-logo")).not.toBeNull();
    expect(text(".rs-logo__sub")).toContain("start over");

    session.handleKeydown(key("ArrowRight")); // restart from the top
    await flush();
    expect(mediaSrc()).toBe("https://i.redd.it/a.jpg");
    expect(text(".rs-meta__counter")).toBe("1 / 2");
  });

  it("hands off to a popout window and closes this tab's slideshow", async () => {
    const openPopout = vi.fn();
    const { session } = makeSession({ openPopout });
    await session.start();
    expect(session.isOpen()).toBe(true);
    /** @type {HTMLElement} */ (q('[aria-label^="Open in a window"]')).click();
    expect(openPopout).toHaveBeenCalledTimes(1);
    expect(session.isOpen()).toBe(false);
  });

  it("ignores keys when the overlay is closed", async () => {
    const { session } = makeSession();
    await session.start();
    session.close();
    expect(session.isOpen()).toBe(false);
    // No throw, no effect.
    session.handleKeydown(key("ArrowRight"));
  });

  it("fetches the next page when nearing the end, then can advance into it", async () => {
    const { session, request } = makeSession({
      pages: [
        {
          slides: [imageSlide("a")],
          after: "t3_next",
          exhausted: false,
          postsScanned: 50,
        },
        {
          slides: [imageSlide("b")],
          after: null,
          exhausted: true,
          postsScanned: 50,
        },
      ],
    });
    await session.start();
    await flush(); // let the async pagination fetch resolve
    expect(request.calls).toContain("t3_next");
    session.handleKeydown(key("ArrowRight"));
    expect(mediaSrc()).toBe("https://i.redd.it/b.jpg");
  });

  it("a restart while a pagination fetch is in flight does not corrupt the new run", async () => {
    let calls = 0;
    /** @type {(reason?: unknown) => void} */
    let rejectStale = () => {};
    const requestPage = async () => {
      calls += 1;
      // Run 1's first page (a) and run 2's (b) carry a cursor; the paginations
      // they trigger stay pending (run 1's is the one we later reject).
      if (calls === 1) {
        return pageOf("a", "t3_p2");
      }
      if (calls === 2) {
        return new Promise((_resolve, reject) => {
          rejectStale = reject;
        });
      }
      if (calls === 3) {
        return pageOf("b", "t3_q2");
      }
      return new Promise(() => {}); // run 2's pagination: pending forever
    };
    const session = createSlideshowSession({
      doc: document,
      createOverlay,
      getSettings: async () => settings(),
      saveSettings: async () => {},
      requestPage,
      getStartCursor: () => undefined,
      openUrl: () => {},
      createImage: () => ({ src: "", decoding: "" }),
    });
    sessions.push(session);

    await session.start();
    session.handleKeydown(key("ArrowRight")); // run 1 → waiting, pagination pending
    await flush();

    // Restart with a fresh controller while run 1's fetch is still pending.
    await session.start();
    await flush();
    expect(mediaSrc()).toBe("https://i.redd.it/b.jpg");
    session.handleKeydown(key("ArrowRight")); // run 2 → waiting on its own page
    expect(text(".rs-status")).toBeUndefined();

    // Run 1's fetch now rejects onto the shared controller binding. The catch's
    // runId guard must drop it, not append a phantom exhausted page to run 2.
    rejectStale(new Error("aborted"));
    await flush();

    expect(text(".rs-status")).toBeUndefined(); // not "No more media to show."
    expect(mediaSrc()).toBe("https://i.redd.it/b.jpg");
  });

  it("applies the NSFW filter", async () => {
    const { session } = makeSession({
      settingsOverrides: { includeNsfw: false },
      pages: [
        {
          slides: [imageSlide("a", { over18: true }), imageSlide("b")],
          after: null,
          exhausted: true,
          postsScanned: 2,
        },
      ],
    });
    await session.start();
    expect(mediaSrc()).toBe("https://i.redd.it/b.jpg");
    expect(text(".rs-meta__counter")).toBe("1 / 1");
  });

  it("drops duplicates by media id", async () => {
    const dupe = imageSlide("a", {
      provider: "reddit-gallery",
      mediaUrl: "https://preview.redd.it/a.jpg?width=640&s=x",
    });
    const { session } = makeSession({
      pages: [
        {
          slides: [imageSlide("a"), dupe, imageSlide("b")],
          after: null,
          exhausted: true,
          postsScanned: 3,
        },
      ],
    });
    await session.start();
    expect(text(".rs-meta__counter")).toBe("1 / 2"); // dupe removed
  });

  it("skips a perceptual duplicate image when content dedup is on", async () => {
    /** @type {Record<string, string>} */
    const hashes = {
      "https://i.redd.it/a.jpg": "ffffffffffffffff",
      "https://i.redd.it/b.jpg": "ffffffffffffffff", // same as a → duplicate
      "https://i.redd.it/c.jpg": "0000000000000000",
    };
    const { session } = makeSession({
      settingsOverrides: { contentDedup: true },
      computeImageHash: async (url) => hashes[url] ?? null,
      pages: [
        {
          slides: [imageSlide("a"), imageSlide("b"), imageSlide("c")],
          after: null,
          exhausted: true,
          postsScanned: 3,
        },
      ],
    });
    await session.start();
    await flush(); // "a" hashed and recorded
    expect(mediaSrc()).toBe("https://i.redd.it/a.jpg");
    session.handleKeydown(key("ArrowRight")); // -> "b", a perceptual dup of "a"
    await flush(); // "b" hashed → skipped → "c"
    expect(mediaSrc()).toBe("https://i.redd.it/c.jpg");
  });

  it("hashes a slide's small preview URL instead of re-fetching the full mediaUrl", async () => {
    /** @type {string[]} */
    const hashedUrls = [];
    const { session } = makeSession({
      settingsOverrides: { contentDedup: true },
      computeImageHash: async (url) => {
        hashedUrls.push(url);
        return null;
      },
      pages: [
        {
          slides: [
            imageSlide("a", {
              hashUrl: "https://preview.redd.it/a-small.jpg",
            }),
          ],
          after: null,
          exhausted: true,
          postsScanned: 1,
        },
      ],
    });
    await session.start();
    await flush();
    expect(hashedUrls).toContain("https://preview.redd.it/a-small.jpg");
    expect(hashedUrls).not.toContain("https://i.redd.it/a.jpg");
  });

  it("resolves v.redd.it audio for an upcoming video and plays it from a companion element", async () => {
    const audioTrack = "https://v.redd.it/b/DASH_AUDIO_128.mp4";
    const { session } = makeSession({
      resolveRedditAudio: async (/** @type {any} */ slide) =>
        slide.dashUrl ? audioTrack : null,
      pages: [
        {
          slides: [
            imageSlide("a"),
            videoSlide("b", {
              audioAvailable: true,
              dashUrl: "https://v.redd.it/b/DASHPlaylist.mpd",
            }),
          ],
          after: null,
          exhausted: true,
          postsScanned: 2,
        },
      ],
    });
    await session.start();
    await flush(); // "a" shown; "b"'s audio resolved during the preload window
    session.handleKeydown(key("ArrowRight")); // -> "b"
    await flush();
    const audio = shadow()?.querySelector("audio");
    expect(audio?.getAttribute("src")).toBe(audioTrack);
  });

  it("upgrades an upcoming redgifs embed to native video before it is shown", async () => {
    /** @param {string} id */
    const redgifsEmbed = (id) =>
      imageSlide(id, {
        provider: "redgifs",
        kind: "embed",
        mediaUrl: `https://www.redgifs.com/ifr/${id}`,
        embedUrl: `https://www.redgifs.com/ifr/${id}`,
        sourceUrl: `https://www.redgifs.com/watch/${id}`,
      });
    /** @type {string[]} */
    const resolved = [];
    const { session } = makeSession({
      resolveRedgifs: async (/** @type {any} */ slide) => {
        resolved.push(slide.id);
        return {
          ...slide,
          kind: "video",
          durationMode: "media",
          mediaUrl: "https://media.redgifs.com/X.mp4",
          audioAvailable: true,
          mimeType: "video/mp4",
        };
      },
      pages: [
        {
          slides: [imageSlide("a"), redgifsEmbed("b")],
          after: null,
          exhausted: true,
          postsScanned: 2,
        },
      ],
    });
    await session.start();
    await flush(); // "a" shown; "b" resolved during the preload window
    expect(resolved).toContain("b");
    session.handleKeydown(key("ArrowRight")); // -> "b", now native video
    await flush();
    const video = shadow()?.querySelector("video.reddit-slideshow-media");
    expect(video?.getAttribute("src")).toBe("https://media.redgifs.com/X.mp4");
  });

  it("upvotes the current post with ArrowUp and toggles it off on a second press", async () => {
    /** @type {Array<[string, number]>} */
    const votes = [];
    const { session } = makeSession({
      vote: async (id, dir) => {
        votes.push([id, dir]);
        return { ok: true };
      },
      pages: [
        {
          slides: [imageSlide("t3_a")],
          after: null,
          exhausted: true,
          postsScanned: 1,
        },
      ],
    });
    await session.start();
    session.handleKeydown(key("ArrowUp"));
    await flush();
    expect(votes).toEqual([["t3_a", 1]]);
    session.handleKeydown(key("ArrowUp")); // same direction again clears it
    await flush();
    expect(votes).toEqual([
      ["t3_a", 1],
      ["t3_a", 0],
    ]);
  });

  it("downvotes the current post with ArrowDown", async () => {
    /** @type {Array<[string, number]>} */
    const votes = [];
    const { session } = makeSession({
      vote: async (id, dir) => {
        votes.push([id, dir]);
        return { ok: true };
      },
      pages: [
        {
          slides: [imageSlide("t3_a")],
          after: null,
          exhausted: true,
          postsScanned: 1,
        },
      ],
    });
    await session.start();
    session.handleKeydown(key("ArrowDown"));
    await flush();
    expect(votes).toEqual([["t3_a", -1]]);
  });

  it("doesn't vote when an arrow key is pressed inside an open panel", async () => {
    /** @type {Array<[string, number]>} */
    const votes = [];
    const { session } = makeSession({
      vote: async (id, dir) => {
        votes.push([id, dir]);
        return { ok: true };
      },
    });
    await session.start();
    // A key event targeting a control inside the settings panel (e.g. a focused
    // slider) must reach the panel, not fire a vote.
    const panel = document.createElement("div");
    panel.className = "rs-settings-panel";
    const slider = document.createElement("input");
    panel.append(slider);
    session.handleKeydown(
      /** @type {any} */ ({
        key: "ArrowUp",
        isTrusted: true,
        target: slider,
        preventDefault() {},
        stopImmediatePropagation() {},
      }),
    );
    await flush();
    expect(votes).toEqual([]);
  });

  it("seeds the vote toggle from the post's existing vote state", async () => {
    /** @type {Array<[string, number]>} */
    const votes = [];
    const { session } = makeSession({
      vote: async (id, dir) => {
        votes.push([id, dir]);
        return { ok: true };
      },
      pages: [
        {
          slides: [imageSlide("t3_a", { likes: true })], // already upvoted
          after: null,
          exhausted: true,
          postsScanned: 1,
        },
      ],
    });
    await session.start();
    session.handleKeydown(key("ArrowUp")); // pressing up on an upvoted post clears it
    await flush();
    expect(votes).toEqual([["t3_a", 0]]);
  });

  it("keeps the upvote tint when advancing to the next image of the same post", async () => {
    const { session } = makeSession({
      vote: async () => ({ ok: true }),
      pages: [
        {
          slides: [
            imageSlide("t3_g0", { postId: "t3_g" }),
            imageSlide("t3_g1", { postId: "t3_g" }),
          ],
          after: null,
          exhausted: true,
          postsScanned: 1,
        },
      ],
    });
    await session.start();
    session.handleKeydown(key("ArrowUp"));
    await flush();
    expect(q(".rs-meta__vote--up")).toBeTruthy();
    session.handleKeydown(key("ArrowRight")); // next image of the same gallery
    expect(q(".rs-meta__vote--up")).toBeTruthy();
  });

  it("reverts the vote tint on every image of the post when the write fails", async () => {
    const { session } = makeSession({
      vote: async () => ({ ok: false }),
      pages: [
        {
          slides: [
            imageSlide("t3_g0", { postId: "t3_g" }),
            imageSlide("t3_g1", { postId: "t3_g" }),
          ],
          after: null,
          exhausted: true,
          postsScanned: 1,
        },
      ],
    });
    await session.start();
    session.handleKeydown(key("ArrowUp"));
    await flush(); // rejected write reverts the optimistic vote
    session.handleKeydown(key("ArrowRight"));
    expect(q(".rs-meta__vote--up")).toBeNull();
    expect(q(".rs-meta__vote--none")).toBeTruthy();
  });

  it("downloads the current slide's media via the download control", async () => {
    /** @type {Array<{ url: string, filename: string }>} */
    const calls = [];
    const { session } = makeSession({
      downloadMedia: (url, filename) => calls.push({ url, filename }),
    });
    await session.start();
    /** @type {HTMLButtonElement | null} */ (
      q('[aria-label^="Download"]')
    )?.click();
    expect(calls).toEqual([
      { url: "https://i.redd.it/a.jpg", filename: "a.jpg" },
    ]);
  });

  it("filters a perceptual duplicate during preload, before it is shown", async () => {
    /** @type {Record<string, string>} */
    const hashes = {
      "https://i.redd.it/a.jpg": "ffffffffffffffff",
      "https://i.redd.it/b.jpg": "ffffffffffffffff", // same as a → duplicate
      "https://i.redd.it/c.jpg": "0000000000000000",
    };
    const { session } = makeSession({
      settingsOverrides: { contentDedup: true },
      computeImageHash: async (url) => hashes[url] ?? null,
      pages: [
        {
          slides: [imageSlide("a"), imageSlide("b"), imageSlide("c")],
          after: null,
          exhausted: true,
          postsScanned: 3,
        },
      ],
    });
    await session.start();
    await flush();
    expect(mediaSrc()).toBe("https://i.redd.it/a.jpg");
    // "b" is hashed in "a"'s preload window and marked skipped before it is ever
    // shown - no flash of the duplicate on advance.
    expect(text(".rs-skipped")).toBe("1 skipped");
    session.handleKeydown(key("ArrowRight")); // steps over the pre-marked "b"
    await flush();
    expect(mediaSrc()).toBe("https://i.redd.it/c.jpg");
  });

  it("doesn't yank a paused autoplaying viewer off a late-resolving duplicate", async () => {
    /** @type {Record<string, string>} */
    const hashes = {
      "https://i.redd.it/a.jpg": "ffffffffffffffff",
      "https://i.redd.it/b.jpg": "ffffffffffffffff", // same as a → duplicate
      "https://i.redd.it/c.jpg": "0000000000000000",
    };
    // Defer "b"'s hash so it becomes current before it's known to be a dup -
    // the fallback path where pre-filtering didn't get there in time.
    /** @type {(value?: unknown) => void} */
    let releaseB = () => {};
    const bHashed = new Promise((resolve) => {
      releaseB = resolve;
    });
    const { session } = makeSession({
      settingsOverrides: { contentDedup: true, autoplay: true },
      computeImageHash: async (url) => {
        if (url === "https://i.redd.it/b.jpg") await bHashed;
        return hashes[url] ?? null;
      },
      pages: [
        {
          slides: [imageSlide("a"), imageSlide("b"), imageSlide("c")],
          after: null,
          exhausted: true,
          postsScanned: 3,
        },
      ],
    });
    await session.start();
    await flush(); // "a" hashed; the worker then blocks on "b"
    session.handleKeydown(key(" ")); // pause the playing show
    session.handleKeydown(key("ArrowRight")); // -> "b" (its hash still pending)
    await flush();
    expect(mediaSrc()).toBe("https://i.redd.it/b.jpg");
    releaseB(); // "b"'s hash resolves now, while "b" is current and paused
    await flush();
    // Paused autoplay: record the skip but leave the viewer on the duplicate;
    // don't yank them to "c". (Manual mode still auto-skips.)
    expect(mediaSrc()).toBe("https://i.redd.it/b.jpg");
    expect(text(".rs-skipped")).toBe("1 skipped");
  });

  it("records a slide's hash even if the show advances before it resolves", async () => {
    /** @type {Record<string, string>} */
    const hashes = {
      "https://i.redd.it/a.jpg": "ffffffffffffffff",
      "https://i.redd.it/b.jpg": "0000000000000000",
      "https://i.redd.it/c.jpg": "ffffffffffffffff", // a perceptual dup of "a"
    };
    // Defer "a"'s hash so the show can advance off it before it resolves - the
    // race that used to discard the first copy's hash.
    /** @type {(value?: unknown) => void} */
    let releaseA = () => {};
    const aHashed = new Promise((resolve) => {
      releaseA = resolve;
    });
    const { session } = makeSession({
      settingsOverrides: { contentDedup: true },
      computeImageHash: async (url) => {
        if (url === "https://i.redd.it/a.jpg") await aHashed;
        return hashes[url] ?? null;
      },
      pages: [
        {
          slides: [imageSlide("a"), imageSlide("b"), imageSlide("c")],
          after: null,
          exhausted: true,
          postsScanned: 3,
        },
      ],
    });
    await session.start();
    session.handleKeydown(key("ArrowRight")); // -> "b" before "a" finished hashing
    await flush();
    expect(mediaSrc()).toBe("https://i.redd.it/b.jpg");

    releaseA(); // "a"'s hash resolves now, while "a" is no longer current
    await flush();

    // "c" is a perceptual dup of "a"; it's skipped only if "a"'s hash was
    // recorded despite the race.
    session.handleKeydown(key("ArrowRight")); // -> "c"
    await flush();
    expect(text(".rs-skipped")).toBe("1 skipped");
  });

  it("locks page scroll while open and restores it on close", async () => {
    document.documentElement.style.overflow = "scroll";
    const { session } = makeSession();
    await session.start();
    expect(document.documentElement.style.overflow).toBe("hidden");
    session.close();
    expect(document.documentElement.style.overflow).toBe("scroll");
  });

  it("bounds and cancels image preloads", async () => {
    /** @type {Array<{ src: string }>} */
    const created = [];
    const { session } = makeSession({
      pages: [
        {
          slides: ["a", "b", "c", "d", "e"].map((id) => imageSlide(id)),
          after: null,
          exhausted: true,
          postsScanned: 5,
        },
      ],
      createImage: () => {
        const img = { src: "", decoding: "" };
        created.push(img);
        return img;
      },
    });
    await session.start();
    session.handleKeydown(key("ArrowRight"));
    session.handleKeydown(key("ArrowRight"));
    // Only the look-ahead window stays in flight; the rest were cancelled.
    expect(created.filter((img) => img.src !== "").length).toBeLessThanOrEqual(
      2,
    );
    session.close();
    expect(created.every((img) => img.src === "")).toBe(true);
  });

  it("pre-decodes preloaded images, not just their bytes", async () => {
    // The renderer's decode() gate is the long pole on huge images; the
    // preload must warm the decoded-surface cache, not only the network.
    let decodes = 0;
    const { session } = makeSession({
      pages: [
        {
          slides: ["a", "b", "c"].map((id) => imageSlide(id)),
          after: null,
          exhausted: true,
          postsScanned: 3,
        },
      ],
      createImage: () => ({
        src: "",
        decoding: "",
        decode: () => {
          decodes += 1;
          return Promise.resolve();
        },
      }),
    });
    await session.start();
    await flush();
    expect(decodes).toBeGreaterThan(0);
  });

  it("does not preload an upcoming image whose URL is unsafe", async () => {
    /** @type {Array<{ src: string }>} */
    const created = [];
    const { session } = makeSession({
      pages: [
        {
          slides: [
            imageSlide("a"),
            imageSlide("bad", { mediaUrl: "http://i.redd.it/bad.jpg" }),
          ],
          after: null,
          exhausted: true,
          postsScanned: 2,
        },
      ],
      createImage: () => {
        const img = { src: "", decoding: "" };
        created.push(img);
        return img;
      },
    });
    await session.start();
    // "a" is showing; the only upcoming image ("bad") is non-HTTPS, so the
    // preloader must skip it rather than set img.src past the safety gate.
    expect(created.every((img) => img.src !== "http://i.redd.it/bad.jpg")).toBe(
      true,
    );
  });

  it("warms the cache for the nearest upcoming direct video, skipping proxied", async () => {
    /** @type {Array<{ src: string, preload?: string }>} */
    const videos = [];
    const { session } = makeSession({
      pages: [
        {
          // A proxied clip sits between "a" and a direct one: it can't be
          // cache-warmed here, so the preloader reaches past it to the direct clip.
          slides: [
            imageSlide("a"),
            videoSlide("prox", { proxied: true }),
            videoSlide("vid"),
          ],
          after: null,
          exhausted: true,
          postsScanned: 3,
        },
      ],
      createVideo: () => {
        const v = { src: "", preload: "" };
        videos.push(v);
        return v;
      },
    });
    await session.start();
    const buffered = videos.filter((v) => v.src !== "");
    expect(buffered.map((v) => v.src)).toEqual([
      "https://v.redd.it/vid/CMAF_720.mp4",
    ]);
    expect(buffered[0].preload).toBe("auto");
    session.close();
    expect(videos.every((v) => v.src === "")).toBe(true);
  });

  it("suppresses handled keys but not others", async () => {
    const { session } = makeSession();
    await session.start();
    let prevented = 0;
    let stopped = 0;
    const ev = (/** @type {string} */ k) => ({
      key: k,
      isTrusted: true,
      preventDefault: () => {
        prevented += 1;
      },
      stopImmediatePropagation: () => {
        stopped += 1;
      },
    });
    session.handleKeydown(/** @type {any} */ (ev("ArrowRight")));
    expect(prevented).toBe(1);
    expect(stopped).toBe(1);
    session.handleKeydown(/** @type {any} */ (ev("x"))); // unhandled
    expect(prevented).toBe(1);
    expect(stopped).toBe(1);
  });

  it("toggles the help panel on the ? key", async () => {
    const { session } = makeSession();
    await session.start();
    const help = () =>
      /** @type {HTMLElement | null} */ (q(".rs-help-panel"))?.hidden;
    expect(help()).toBe(true);
    session.handleKeydown(key("?"));
    expect(help()).toBe(false);
    session.handleKeydown(key("?")); // toggles back off
    expect(help()).toBe(true);
  });

  it("applies a changed image timer to the running slideshow without reload", async () => {
    const { session } = makeSession();
    await session.start();
    session.applyLiveSettings(
      /** @type {any} */ (settings({ imageTimerSeconds: 20 })),
    );
    const fill = /** @type {HTMLElement | null} */ (q(".rs-timer__fill"));
    expect(fill?.style.animation).toContain("20s");
  });

  it("skips broken media and records it in the skipped list", async () => {
    const { session } = makeSession({
      pages: [
        {
          slides: [imageSlide("a"), imageSlide("b")],
          after: null,
          exhausted: true,
          postsScanned: 2,
        },
      ],
    });
    await session.start();
    expect(mediaSrc()).toBe("https://i.redd.it/a.jpg");

    q(".reddit-slideshow-media")?.dispatchEvent(new Event("error"));

    expect(mediaSrc()).toBe("https://i.redd.it/b.jpg"); // advanced past the broken one
    expect(text(".rs-skipped")).toBe("1 skipped");
  });

  it("holds on the failure card when the user pauses, instead of advancing", async () => {
    const { session } = makeSession({
      settingsOverrides: { autoplay: true }, // a playing show the user then pauses
      pages: [
        {
          slides: [imageSlide("a"), imageSlide("b")],
          after: null,
          exhausted: true,
          postsScanned: 2,
        },
      ],
    });
    await session.start();
    expect(mediaSrc()).toBe("https://i.redd.it/a.jpg");

    session.handleKeydown(key(" ")); // pause the playing show
    q(".reddit-slideshow-media")?.dispatchEvent(new Event("error"));

    // Paused: show the broken-media card and stay on "a"; don't advance to "b".
    expect(q(".rs-placeholder")).not.toBeNull();
    expect(text(".rs-meta__counter")).toBe("1 / 2");
    expect(text(".rs-skipped")).toBe("1 skipped");

    // Resuming moves on at once, not after a full dwell on the broken slide.
    session.handleKeydown(key(" "));
    expect(mediaSrc()).toBe("https://i.redd.it/b.jpg");
  });

  it("falls back to the blob proxy when a direct CDN video fails", async () => {
    /** @type {any} */
    const redgifs = {
      id: "rg",
      postId: "rg",
      provider: "redgifs",
      kind: "video",
      mediaUrl: "https://media.redgifs.com/X.mp4", // a proxy-capable host
      sourceUrl: "https://www.redgifs.com/watch/x",
      permalink: "https://old.reddit.com/r/x/comments/x/x/",
      title: "rg",
      over18: false,
      durationMode: "media",
      audioAvailable: true,
      quality: "original",
      filenameHint: "x.mp4", // not proxied → renders direct first
    };
    const { session } = makeSession({
      resolveMedia: async () => "blob:fake", // the proxy fallback succeeds
      pages: [
        { slides: [redgifs], after: null, exhausted: true, postsScanned: 1 },
      ],
    });
    await session.start();
    // The direct CDN <video> errors (e.g. a CSP-blocked page) → fall back to the
    // background blob proxy, which re-renders the same slide with a blob: src.
    q("video.reddit-slideshow-media")?.dispatchEvent(new Event("error"));
    await flush();
    expect(q("video.reddit-slideshow-media")?.getAttribute("src")).toBe(
      "blob:fake",
    );
  });

  it("steps back over a skipped slide without re-skipping it", async () => {
    const { session } = makeSession({
      pages: [
        {
          slides: [imageSlide("a"), imageSlide("b"), imageSlide("c")],
          after: null,
          exhausted: true,
          postsScanned: 3,
        },
      ],
    });
    await session.start();
    // Break "a": it is recorded once and the show moves to "b".
    q(".reddit-slideshow-media")?.dispatchEvent(new Event("error"));
    expect(mediaSrc()).toBe("https://i.redd.it/b.jpg");
    expect(text(".rs-skipped")).toBe("1 skipped");

    // Back from "b": "a" is skipped, so it does not land on it or re-skip it.
    session.handleKeydown(key("ArrowLeft"));
    expect(mediaSrc()).toBe("https://i.redd.it/b.jpg");
    expect(text(".rs-skipped")).toBe("1 skipped");
  });

  it("changes a setting from the in-overlay panel (persist + live)", async () => {
    /** @type {object[]} */
    const saved = [];
    const { session } = makeSession({
      saveSettings: async (patch) => saved.push(patch),
    });
    await session.start();
    // Open the inline settings panel and bump the per-image timer.
    /** @type {HTMLElement} */ (q('[aria-label^="Settings"]')).click();
    const range = /** @type {HTMLInputElement} */ (q(".rs-set__range"));
    range.value = "20";
    range.dispatchEvent(new Event("change", { bubbles: true }));

    // The range is a stops index; index 20 maps to its stop's seconds.
    const expected = imageTimerStopSeconds(20);
    expect(saved.at(-1)).toEqual({ imageTimerSeconds: expected });
    const fill = /** @type {HTMLElement | null} */ (q(".rs-timer__fill"));
    expect(fill?.style.animation).toContain(`${expected}s`);
  });

  it("pan-zooms only oversized (UHD) images", async () => {
    /** @type {Array<{ slide: any, info: any }>} */
    const renders = [];
    const fakeOverlay = () => ({
      root: document.createElement("div"),
      host: Object.assign(document.createElement("div"), {
        id: "reddit-slideshow-host",
      }),
      show() {},
      hide() {},
      isOpen: () => true,
      showStatus() {},
      showLoading() {},
      showEnd() {},
      notifyManualNav() {},
      setSkipped() {},
      setSettings() {},
      setMuted() {},
      setBuffering() {},
      setPlaying() {},
      restartTimer() {},
      setJumpList() {},
      renderCurrent: (/** @type {any} */ slide, /** @type {any} */ info) =>
        renders.push({ slide, info }),
    });
    const big = imageSlide("big", { sourceWidth: 12000, sourceHeight: 8000 });
    const small = imageSlide("small", { sourceWidth: 800, sourceHeight: 600 });
    const session = createSlideshowSession({
      doc: document,
      createOverlay: /** @type {any} */ (fakeOverlay),
      // total = 3 + 3 + 4 + 0 + 0 = 10s
      getSettings: async () =>
        /** @type {any} */ (
          settings({
            panZoom: true,
            panZoomShowSeconds: 3,
            panZoomZoomInSeconds: 3,
            panZoomPanSeconds: 4,
            panZoomZoomOutSeconds: 0,
            panZoomShowEndSeconds: 0,
          })
        ),
      saveSettings: async () => {},
      requestPage: async () => ({
        ok: true,
        page: {
          slides: [big, small],
          after: null,
          exhausted: true,
          postsScanned: 2,
        },
      }),
      getStartCursor: () => undefined,
      openUrl: () => {},
      createImage: () => ({ src: "", decoding: "" }),
    });
    sessions.push(session);
    await session.start();
    session.handleKeydown(key("ArrowRight")); // advance to the small image

    expect(renders[0].slide.id).toBe("big");
    expect(renders[0].info.panZoom).not.toBeNull(); // oversized → pan-zoom
    expect(renders[0].info.effectiveSeconds).toBe(10); // runs the full sequence

    expect(renders[1].slide.id).toBe("small");
    expect(renders[1].info.panZoom).toBeNull(); // too small → no pan-zoom
    expect(renders[1].info.effectiveSeconds).toBe(5); // normal image timer
  });

  it("scales the pan-zoom by image resolution, capped at the configured max", async () => {
    /** @type {Array<{ slide: any, info: any }>} */
    const renders = [];
    const fakeOverlay = () => ({
      root: document.createElement("div"),
      host: Object.assign(document.createElement("div"), {
        id: "reddit-slideshow-host",
      }),
      show() {},
      hide() {},
      isOpen: () => true,
      showStatus() {},
      showLoading() {},
      showEnd() {},
      notifyManualNav() {},
      setSkipped() {},
      setSettings() {},
      setMuted() {},
      setBuffering() {},
      setPlaying() {},
      restartTimer() {},
      setJumpList() {},
      renderCurrent: (/** @type {any} */ slide, /** @type {any} */ info) =>
        renders.push({ slide, info }),
    });
    // jsdom's view is 1024×768 @ dpr 1. The huge image's native density far
    // exceeds the 6× cap; the mid image reaches 1:1 at exactly 2×.
    const huge = imageSlide("huge", { sourceWidth: 12000, sourceHeight: 8000 });
    const mid = imageSlide("mid", { sourceWidth: 2048, sourceHeight: 1536 });
    const session = createSlideshowSession({
      doc: document,
      createOverlay: /** @type {any} */ (fakeOverlay),
      getSettings: async () =>
        /** @type {any} */ (settings({ panZoom: true, panZoomScale: 6 })),
      saveSettings: async () => {},
      requestPage: async () => ({
        ok: true,
        page: {
          slides: [huge, mid],
          after: null,
          exhausted: true,
          postsScanned: 2,
        },
      }),
      getStartCursor: () => undefined,
      openUrl: () => {},
      createImage: () => ({ src: "", decoding: "" }),
    });
    sessions.push(session);
    await session.start();
    session.handleKeydown(key("ArrowRight")); // advance to the mid image

    expect(renders[0].slide.id).toBe("huge");
    expect(renders[0].info.panZoom.scale).toBe(6); // capped
    expect(renders[1].slide.id).toBe("mid");
    expect(renders[1].info.panZoom.scale).toBeCloseTo(2); // its own 1:1
  });

  it("pan-zooms every image when the threshold is 'All images' (1×)", async () => {
    /** @type {Array<{ slide: any, info: any }>} */
    const renders = [];
    const fakeOverlay = () => ({
      root: document.createElement("div"),
      host: Object.assign(document.createElement("div"), {
        id: "reddit-slideshow-host",
      }),
      show() {},
      hide() {},
      isOpen: () => true,
      showStatus() {},
      showLoading() {},
      showEnd() {},
      notifyManualNav() {},
      setSkipped() {},
      setSettings() {},
      setMuted() {},
      setBuffering() {},
      setPlaying() {},
      restartTimer() {},
      setJumpList() {},
      renderCurrent: (/** @type {any} */ slide, /** @type {any} */ info) =>
        renders.push({ slide, info }),
    });
    // A sub-window image that wouldn't normally pan-zoom.
    const small = imageSlide("small", { sourceWidth: 800, sourceHeight: 600 });
    const session = createSlideshowSession({
      doc: document,
      createOverlay: /** @type {any} */ (fakeOverlay),
      getSettings: async () =>
        /** @type {any} */ (settings({ panZoom: true, panZoomMinOversize: 1 })),
      saveSettings: async () => {},
      requestPage: async () => ({
        ok: true,
        page: {
          slides: [small],
          after: null,
          exhausted: true,
          postsScanned: 1,
        },
      }),
      getStartCursor: () => undefined,
      openUrl: () => {},
      createImage: () => ({ src: "", decoding: "" }),
    });
    sessions.push(session);
    await session.start();
    expect(renders[0].slide.id).toBe("small");
    expect(renders[0].info.panZoom).not.toBeNull(); // moves anyway at "All images"
  });

  it("jumps to a loaded post from the counter list", async () => {
    const { session } = makeSession({
      pages: [
        {
          slides: [imageSlide("a"), imageSlide("b"), imageSlide("c")],
          after: null,
          exhausted: true,
          postsScanned: 3,
        },
      ],
    });
    await session.start();
    session.handleKeydown(key("ArrowRight")); // -> b
    session.handleKeydown(key("ArrowRight")); // -> c
    expect(mediaSrc()).toBe("https://i.redd.it/c.jpg");

    // Open the jump list from the counter, then click the first post.
    /** @type {HTMLElement} */ (q(".rs-meta__counter")).click();
    const items = qa(".rs-jump-panel__item");
    expect(items.length).toBe(3);
    /** @type {HTMLElement} */ (items[0]).click();
    expect(mediaSrc()).toBe("https://i.redd.it/a.jpg");
    expect(text(".rs-meta__counter")).toBe("1 / 3");
  });

  it("Escape dismisses an open panel before closing the show", async () => {
    const { session } = makeSession();
    await session.start();
    expect(session.isOpen()).toBe(true);

    // Open the inline settings panel via the gear.
    /** @type {HTMLElement} */ (q('[aria-label^="Settings"]')).click();
    const panel = /** @type {HTMLElement | null} */ (q(".rs-settings-panel"));
    expect(panel?.hidden).toBe(false);

    // First Escape closes the panel, not the show.
    session.handleKeydown(key("Escape"));
    expect(panel?.hidden).toBe(true);
    expect(session.isOpen()).toBe(true);

    // Second Escape (nothing open) closes the show.
    session.handleKeydown(key("Escape"));
    expect(session.isOpen()).toBe(false);
  });

  it("lets Space act natively on a focused control instead of toggling play", async () => {
    const { session } = makeSession();
    await session.start();
    const range = /** @type {HTMLInputElement} */ (q(".rs-set__range"));
    let prevented = false;
    session.handleKeydown(
      /** @type {any} */ ({
        key: " ",
        isTrusted: true,
        target: range,
        preventDefault: () => {
          prevented = true;
        },
        stopImmediatePropagation: () => {},
      }),
    );
    // The handler returned early, so it neither prevented the key nor paused.
    expect(prevented).toBe(false);
  });

  it("persists the mute preference when toggled", async () => {
    /** @type {object[]} */
    const saved = [];
    const { session } = makeSession({
      saveSettings: async (patch) => saved.push(patch),
    });
    await session.start();
    session.handleKeydown(key("m"));
    expect(saved.at(-1)).toEqual({ startMuted: false });
  });

  it("downloads the current slide's media with the D key", async () => {
    /** @type {Array<{ url: string, filename: string }>} */
    const calls = [];
    const { session } = makeSession({
      downloadMedia: (url, filename) => calls.push({ url, filename }),
    });
    await session.start();
    session.handleKeydown(key("d"));
    await flush();
    expect(calls).toEqual([
      { url: "https://i.redd.it/a.jpg", filename: "a.jpg" },
    ]);
  });

  it("blocks the author and skips to the next post with the I key", async () => {
    /** @type {string[]} */
    const blocked = [];
    const { session } = makeSession({
      block: async (name) => {
        blocked.push(name);
        return { ok: true };
      },
      pages: [
        {
          slides: [
            imageSlide("p1", { postId: "p1", author: "spez" }),
            imageSlide("p2", { postId: "p2", author: "other" }),
          ],
          after: null,
          exhausted: true,
          postsScanned: 2,
        },
      ],
    });
    await session.start();
    session.handleKeydown(key("i"));
    await flush();
    expect(blocked).toEqual(["spez"]);
    expect(mediaSrc()).toBe("https://i.redd.it/p2.jpg");
    expect(text(".rs-vote-flash")).toContain("spez");
  });

  it("does nothing for the I key when the author is unknown", async () => {
    /** @type {string[]} */
    const blocked = [];
    const { session } = makeSession({
      block: async (name) => {
        blocked.push(name);
        return { ok: true };
      },
      pages: [
        {
          slides: [imageSlide("a", { author: undefined })],
          after: null,
          exhausted: true,
          postsScanned: 1,
        },
      ],
    });
    await session.start();
    session.handleKeydown(key("i"));
    await flush();
    expect(blocked).toEqual([]);
  });

  it("follows the author with the A key and uses new-reddit wording", async () => {
    /** @type {string[]} */
    const friended = [];
    const { session } = makeSession({
      frontend: "new",
      friend: async (name) => {
        friended.push(name);
        return { ok: true };
      },
      pages: [
        {
          slides: [imageSlide("a", { author: "spez" })],
          after: null,
          exhausted: true,
          postsScanned: 1,
        },
      ],
    });
    await session.start();
    session.handleKeydown(key("a"));
    await flush();
    expect(friended).toEqual(["spez"]);
    // frontend "new" picks the "Following …" wording (vs "Friended …" on old).
    expect(text(".rs-vote-flash")).toContain("Following");
    expect(text(".rs-vote-flash")).toContain("spez");
  });

  it("flashes an error when the block write is rejected", async () => {
    const { session } = makeSession({
      block: async () => ({ ok: false }),
      pages: [
        {
          slides: [imageSlide("a", { author: "spez" })],
          after: null,
          exhausted: true,
          postsScanned: 1,
        },
      ],
    });
    await session.start();
    session.handleKeydown(key("i"));
    await flush();
    // The optimistic "Blocked u/spez" flash is replaced by the error flash.
    expect(text(".rs-vote-flash")).toContain("Couldn't");
    expect(text(".rs-vote-flash")).not.toContain("spez");
  });

  it("flashes an error when the friend write throws", async () => {
    const { session } = makeSession({
      frontend: "old",
      friend: async () => {
        throw new Error("network down");
      },
      pages: [
        {
          slides: [imageSlide("a", { author: "spez" })],
          after: null,
          exhausted: true,
          postsScanned: 1,
        },
      ],
    });
    await session.start();
    session.handleKeydown(key("a"));
    await flush();
    // The optimistic "Following u/spez" flash is replaced by the error flash.
    expect(text(".rs-vote-flash")).toContain("Couldn't");
    expect(text(".rs-vote-flash")).not.toContain("spez");
  });

  it("ignores a synthetic (non-trusted) keydown for a write action", async () => {
    // A compromised/XSS'd page script dispatching a fake "i" keydown must not
    // block a user as the logged-in account.
    /** @type {string[]} */
    const blocked = [];
    const { session } = makeSession({
      block: async (name) => {
        blocked.push(name);
        return { ok: true };
      },
      pages: [
        {
          slides: [imageSlide("a", { author: "spez" })],
          after: null,
          exhausted: true,
          postsScanned: 1,
        },
      ],
    });
    await session.start();
    session.handleKeydown({ ...key("i"), isTrusted: false });
    await flush();
    expect(blocked).toEqual([]);
  });

  it("ignores a keydown with isTrusted unset (fails closed)", async () => {
    /** @type {string[]} */
    const blocked = [];
    const { session } = makeSession({
      block: async (name) => {
        blocked.push(name);
        return { ok: true };
      },
      pages: [
        {
          slides: [imageSlide("a", { author: "spez" })],
          after: null,
          exhausted: true,
          postsScanned: 1,
        },
      ],
    });
    await session.start();
    session.handleKeydown(
      /** @type {any} */ ({
        key: "i",
        preventDefault() {},
        stopImmediatePropagation() {},
      }),
    );
    await flush();
    expect(blocked).toEqual([]);
  });

  it("ignores auto-repeat for the block and friend keys", async () => {
    /** @type {string[]} */
    const blocked = [];
    /** @type {string[]} */
    const friended = [];
    const { session } = makeSession({
      block: async (name) => {
        blocked.push(name);
        return { ok: true };
      },
      friend: async (name) => {
        friended.push(name);
        return { ok: true };
      },
      pages: [
        {
          slides: [imageSlide("a", { author: "spez" })],
          after: null,
          exhausted: true,
          postsScanned: 1,
        },
      ],
    });
    await session.start();
    // A held key auto-repeats; the write actions must not fire on the repeats.
    session.handleKeydown({ ...key("i"), repeat: true });
    session.handleKeydown({ ...key("a"), repeat: true });
    await flush();
    expect(blocked).toEqual([]);
    expect(friended).toEqual([]);
  });
});

describe("PageUp / PageDown ±10", () => {
  const slidesPage = (/** @type {number} */ n) => ({
    slides: Array.from({ length: n }, (_, i) => imageSlide(String(i))),
    after: null,
    exhausted: true,
    postsScanned: n,
  });

  it("skips ahead 10 on PageDown and back 10 on PageUp", async () => {
    const { session } = makeSession({ pages: [slidesPage(15)] });
    await session.start();
    await flush();
    expect(mediaSrc()).toContain("/0.jpg");
    session.handleKeydown(key("PageDown"));
    await flush();
    expect(mediaSrc()).toContain("/10.jpg");
    session.handleKeydown(key("PageUp"));
    await flush();
    expect(mediaSrc()).toContain("/0.jpg");
  });

  it("clamps PageDown at the last slide and PageUp at the first", async () => {
    const { session } = makeSession({ pages: [slidesPage(5)] });
    await session.start();
    await flush();
    session.handleKeydown(key("PageDown"));
    await flush();
    expect(mediaSrc()).toContain("/4.jpg");
    session.handleKeydown(key("PageUp"));
    await flush();
    expect(mediaSrc()).toContain("/0.jpg");
  });

  it("suppresses PageUp/PageDown so the page can't also scroll", async () => {
    let prevented = 0;
    let stopped = 0;
    const ev = {
      key: "PageDown",
      isTrusted: true,
      preventDefault: () => (prevented += 1),
      stopImmediatePropagation: () => (stopped += 1),
      target: document.body,
    };
    const { session } = makeSession({ pages: [slidesPage(15)] });
    await session.start();
    await flush();
    session.handleKeydown(/** @type {any} */ (ev));
    await flush();
    expect(prevented).toBe(1);
    expect(stopped).toBe(1);
  });

  it("ignores PageDown when the overlay is closed", async () => {
    const { session } = makeSession({ pages: [slidesPage(15)] });
    await session.start();
    await flush();
    session.close();
    expect(session.isOpen()).toBe(false);
    session.handleKeydown(key("PageDown")); // no throw, no effect
    expect(session.isOpen()).toBe(false);
  });

  it("does not restart from the end card on PageDown", async () => {
    // Same page twice: a restart re-fetches from the start cursor.
    const { session } = makeSession({ pages: [slidesPage(3), slidesPage(3)] });
    await session.start();
    await flush();
    session.handleKeydown(key("ArrowRight")); // s1
    session.handleKeydown(key("ArrowRight")); // s2
    session.handleKeydown(key("ArrowRight")); // end card
    await flush();
    expect(q(".rs-logo")).not.toBeNull();
    session.handleKeydown(key("PageDown"));
    await flush();
    expect(q(".rs-logo")).not.toBeNull(); // still the end card, not restarted
    // ArrowRight still restarts from the top, proving the queue is intact.
    session.handleKeydown(key("ArrowRight"));
    await flush();
    expect(mediaSrc()).toContain("/0.jpg");
  });
});

describe("Shift+ArrowRight skips the current gallery", () => {
  /** @param {string} id @param {Record<string, unknown>} [o] */
  const gallery = (id, o) => imageSlide(id, { postId: id.split(":")[0], ...o });
  const shiftRight = () =>
    /** @type {any} */ ({
      key: "ArrowRight",
      isTrusted: true,
      shiftKey: true,
      preventDefault() {},
      stopImmediatePropagation() {},
    });

  it("jumps out of a gallery to the next post", async () => {
    const { session } = makeSession({
      pages: [
        {
          slides: [
            gallery("p1:0"),
            gallery("p1:1"),
            gallery("p1:2"),
            gallery("p2:0"),
          ],
          after: null,
          exhausted: true,
          postsScanned: 4,
        },
      ],
    });
    await session.start();
    await flush();
    session.handleKeydown(key("ArrowRight")); // into the gallery (p1:1)
    await flush();
    expect(mediaSrc()).toContain("/p1:1.jpg");
    session.handleKeydown(shiftRight());
    await flush();
    expect(mediaSrc()).toContain("/p2:0.jpg");
  });

  it("a plain ArrowRight still advances one slide (no shift)", async () => {
    const { session } = makeSession({
      pages: [
        {
          slides: [gallery("p1:0"), gallery("p1:1"), gallery("p2:0")],
          after: null,
          exhausted: true,
          postsScanned: 3,
        },
      ],
    });
    await session.start();
    await flush();
    session.handleKeydown(key("ArrowRight"));
    await flush();
    expect(mediaSrc()).toContain("/p1:1.jpg"); // next gallery item, not next post
  });
});

describe("manual zoom keys (paused)", () => {
  it("zooms the paused slide with + and resets with Escape instead of closing", async () => {
    const { session } = makeSession({});
    await session.start();
    q("img")?.dispatchEvent(new Event("load"));
    await flush();
    session.handleKeydown(key("+"));
    const frame = /** @type {HTMLElement | null} */ (q(".rs-slide"));
    expect(frame?.style.transform).toMatch(/scale\(1\.3/);
    // Escape peels the zoom off first; the show stays open.
    session.handleKeydown(key("Escape"));
    expect(frame?.style.transform).toBe("");
    expect(q(".rs-slide")).toBeTruthy();
  });

  it("zooms out with - and never below 1", async () => {
    const { session } = makeSession({});
    await session.start();
    q("img")?.dispatchEvent(new Event("load"));
    await flush();
    session.handleKeydown(key("+"));
    session.handleKeydown(key("-"));
    const frame = /** @type {HTMLElement | null} */ (q(".rs-slide"));
    expect(frame?.style.transform).toBe("");
  });

  it("auto-pauses and zooms on a zoom key while playing", async () => {
    const { session } = makeSession({
      settingsOverrides: { autoplay: true },
    });
    await session.start();
    q("img")?.dispatchEvent(new Event("load"));
    await flush();
    session.handleKeydown(key("+"));
    const frame = /** @type {HTMLElement | null} */ (q(".rs-slide"));
    expect(frame?.style.transform).toMatch(/scale\(1\.3/);
    // The controller really paused: a second step needs no further toggling.
    session.handleKeydown(key("+"));
    expect(frame?.style.transform).toMatch(/scale\(1\.6/);
  });

  it("leaves browser shortcuts alone: a modified key is neither swallowed nor acted on", async () => {
    let downloads = 0;
    const { session } = makeSession({
      downloadMedia: async () => {
        downloads += 1;
        return { ok: true };
      },
    });
    await session.start();
    q("img")?.dispatchEvent(new Event("load"));
    await flush();
    let prevented = 0;
    // Ctrl/Cmd+"=" is the browser's page zoom; Cmd+D is its bookmark key.
    session.handleKeydown({
      ...key("="),
      ctrlKey: true,
      preventDefault: () => {
        prevented += 1;
      },
    });
    session.handleKeydown({
      ...key("d"),
      metaKey: true,
      preventDefault: () => {
        prevented += 1;
      },
    });
    await flush();
    expect(prevented).toBe(0);
    expect(downloads).toBe(0);
    const frame = /** @type {HTMLElement | null} */ (q(".rs-slide"));
    expect(frame?.style.transform ?? "").toBe("");
  });
});

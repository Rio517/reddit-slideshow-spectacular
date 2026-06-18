import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SlideshowController } from "../../lib/slideshow.js";

/**
 * @param {Partial<import("../../lib/slides.js").Slide>} [overrides]
 * @returns {import("../../lib/slides.js").Slide}
 */
function imageSlide(overrides) {
  return {
    id: "img:0",
    postId: "img",
    provider: "reddit-image",
    kind: "image",
    mediaUrl: "https://i.redd.it/x.jpg",
    sourceUrl: "https://i.redd.it/x.jpg",
    permalink: undefined,
    title: "",
    over18: false,
    durationMode: "timer",
    audioAvailable: false,
    sourceWidth: undefined,
    sourceHeight: undefined,
    quality: "original",
    mimeType: "image/jpeg",
    filenameHint: "x.jpg",
    ...overrides,
  };
}

/** @param {string} id @param {Partial<import("../../lib/slides.js").Slide>} [o] */
function slideWithId(id, o) {
  return imageSlide({ id, ...o });
}

function makeController(overrides = {}) {
  /** @type {string[]} */
  const rendered = [];
  /** @type {string[]} */
  const requested = [];
  let ended = 0;
  const controller = new SlideshowController({
    imageTimerSeconds: 5,
    onRender: (slide) => rendered.push(slide.id),
    onRequestNextPage: (after) => requested.push(after),
    onEnd: () => (ended += 1),
    ...overrides,
  });
  return { controller, rendered, requested, ended: () => ended };
}

describe("SlideshowController", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("renders the first slide when started", () => {
    const { controller, rendered } = makeController();
    controller.start({
      slides: [slideWithId("a"), slideWithId("b")],
      after: null,
      exhausted: true,
      postsScanned: 2,
    });
    expect(rendered).toEqual(["a"]);
    expect(controller.current?.id).toBe("a");
  });

  it("auto-advances image slides on the timer once ready", () => {
    const { controller, rendered } = makeController();
    controller.start({
      slides: [slideWithId("a"), slideWithId("b")],
      exhausted: true,
      postsScanned: 2,
    });
    // The dwell only starts once the media signals it is ready.
    vi.advanceTimersByTime(5000);
    expect(rendered).toEqual(["a"]);
    controller.markReady();
    vi.advanceTimersByTime(5000);
    expect(rendered).toEqual(["a", "b"]);
  });

  it("reschedules the current image slide when the dwell changes live", () => {
    const { controller, rendered } = makeController({ imageTimerSeconds: 10 });
    controller.start({
      slides: [slideWithId("a"), slideWithId("b")],
      exhausted: true,
      postsScanned: 2,
    });
    controller.markReady();
    vi.advanceTimersByTime(5000); // 10s dwell - not yet
    expect(rendered).toEqual(["a"]);
    controller.setImageTimerSeconds(2); // shorten live → restart from now
    vi.advanceTimersByTime(2000);
    expect(rendered).toEqual(["a", "b"]);
  });

  it("leaves a playing video undisturbed when the dwell changes live", () => {
    const { controller, rendered } = makeController();
    controller.start({
      slides: [
        slideWithId("v", {
          kind: "video",
          durationMode: "media",
          durationSeconds: 10,
        }),
        slideWithId("b"),
      ],
      exhausted: true,
      postsScanned: 2,
    });
    controller.markReady(); // 10s + 2s safety timer
    controller.setImageTimerSeconds(1); // must NOT shorten the video
    vi.advanceTimersByTime(2000);
    expect(rendered).toEqual(["v"]);
    vi.advanceTimersByTime(10000); // 12s total → safety fires
    expect(rendered).toEqual(["v", "b"]);
  });

  it("keeps the timer running after manual navigation", () => {
    const { controller, rendered } = makeController();
    controller.start({
      slides: [slideWithId("a"), slideWithId("b"), slideWithId("c")],
      exhausted: true,
      postsScanned: 3,
    });
    controller.markReady();
    controller.next(); // -> b
    controller.markReady();
    expect(rendered).toEqual(["a", "b"]);
    vi.advanceTimersByTime(5000);
    expect(rendered).toEqual(["a", "b", "c"]);
  });

  it("clamps prev at the first slide", () => {
    const { controller } = makeController();
    controller.start({
      slides: [slideWithId("a"), slideWithId("b")],
      exhausted: true,
      postsScanned: 2,
    });
    controller.prev();
    expect(controller.current?.id).toBe("a");
  });

  it("steps over auto-skipped slides when navigating both ways", () => {
    const { controller } = makeController();
    controller.start({
      slides: [
        slideWithId("a"),
        slideWithId("b", { skipReason: "Unavailable" }),
        slideWithId("c"),
      ],
      after: null,
      exhausted: true,
      postsScanned: 3,
    });
    controller.next(); // a -> skip b -> c
    expect(controller.current?.id).toBe("c");
    controller.prev(); // c -> skip b -> a
    expect(controller.current?.id).toBe("a");
  });

  it("ends when only skipped slides remain ahead in an exhausted queue", () => {
    const { controller, ended } = makeController();
    controller.start({
      slides: [
        slideWithId("a"),
        slideWithId("b", { skipReason: "Unavailable" }),
      ],
      after: null,
      exhausted: true,
      postsScanned: 2,
    });
    controller.next(); // nothing playable ahead -> end
    expect(ended()).toBe(1);
    expect(controller.current?.id).toBe("a");
  });

  it("advances video on mediaEnded, before the safety timer", () => {
    const { controller, rendered } = makeController();
    controller.start({
      slides: [
        slideWithId("v", {
          kind: "video",
          durationMode: "media",
          durationSeconds: 10,
        }),
        slideWithId("b"),
      ],
      exhausted: true,
      postsScanned: 2,
    });
    controller.markReady();
    vi.advanceTimersByTime(5000); // image timer would have fired here
    expect(rendered).toEqual(["v"]);
    controller.mediaEnded();
    expect(rendered).toEqual(["v", "b"]);
  });

  it("uses a safety timer when a video never ends", () => {
    const { controller, rendered } = makeController();
    controller.start({
      slides: [
        slideWithId("v", {
          kind: "video",
          durationMode: "media",
          durationSeconds: 10,
        }),
        slideWithId("b"),
      ],
      exhausted: true,
      postsScanned: 2,
    });
    controller.markReady();
    vi.advanceTimersByTime(12 * 1000); // durationSeconds + safety buffer
    expect(rendered).toEqual(["v", "b"]);
  });

  it("caps retained back-history while preserving absolute position", () => {
    const { controller } = makeController({ maxBackHistory: 5 });
    const slides = Array.from({ length: 20 }, (_, i) => slideWithId(`s${i}`));
    controller.start({
      slides,
      after: null,
      exhausted: true,
      postsScanned: 20,
    });
    for (let i = 0; i < 15; i += 1) controller.next();
    expect(controller.current?.id).toBe("s15");
    expect(controller.position.index).toBe(15);
    expect(controller.position.total).toBe(20);
    // Back-history is capped (local index), and the old slides were dropped.
    expect(controller.index).toBeLessThanOrEqual(5);
    expect(controller.evicted).toBe(10);
  });

  it("retains a deep back-history by default so long sessions can rewind far", () => {
    const { controller } = makeController(); // no maxBackHistory → default window
    const slides = Array.from({ length: 2002 }, (_, i) => slideWithId(`s${i}`));
    controller.start({
      slides,
      after: null,
      exhausted: true,
      postsScanned: 2002,
    });
    controller.goTo(2001); // jump to the last slide, which triggers a trim
    expect(controller.current?.id).toBe("s2001");
    // With the default ~2000-slide window only the very front falls off, so a
    // viewer at slide 2001 can still rewind nearly to the start.
    expect(controller.evicted).toBeLessThanOrEqual(2);
    expect(controller.slides[0].id).toBe("s1");
  });

  it("peeks upcoming slides for preloading", () => {
    const { controller } = makeController();
    controller.start({
      slides: [slideWithId("a"), slideWithId("b"), slideWithId("c")],
      exhausted: true,
      postsScanned: 3,
    });
    expect(controller.peekNext(2).map((s) => s.id)).toEqual(["b", "c"]);
  });

  it("pauses and resumes the timer", () => {
    const { controller, rendered } = makeController();
    controller.start({
      slides: [slideWithId("a"), slideWithId("b")],
      exhausted: true,
      postsScanned: 2,
    });
    controller.markReady();
    controller.pause();
    vi.advanceTimersByTime(10000);
    expect(rendered).toEqual(["a"]);
    controller.resume();
    vi.advanceTimersByTime(5000);
    expect(rendered).toEqual(["a", "b"]);
  });

  it("requests the next page when nearing the end, then appends it", () => {
    const { controller, requested } = makeController();
    controller.start({
      slides: [slideWithId("a")],
      after: "t3_next",
      exhausted: false,
      postsScanned: 50,
    });
    // One unread slide remaining (<= prefetch threshold) -> fetch requested.
    expect(requested).toEqual(["t3_next"]);
    controller.append({
      slides: [slideWithId("b"), slideWithId("c")],
      after: null,
      exhausted: true,
      postsScanned: 50,
    });
    expect(controller.position.total).toBe(3);
  });

  it("does not double-request while a fetch is in flight", () => {
    const { controller, requested } = makeController();
    controller.start({
      slides: [slideWithId("a")],
      after: "t3_next",
      exhausted: false,
      postsScanned: 50,
    });
    controller.next();
    controller.prev();
    expect(requested).toEqual(["t3_next"]);
  });

  it("resumes autoplay after the next page is appended", () => {
    const { controller, rendered } = makeController();
    controller.start({
      slides: [slideWithId("a")],
      after: "t3_next",
      exhausted: false,
      postsScanned: 50,
    });
    controller.markReady();
    vi.advanceTimersByTime(5000); // timer hits the end, waits for more
    expect(rendered).toEqual(["a"]);
    controller.append({
      slides: [slideWithId("b")],
      after: null,
      exhausted: true,
      postsScanned: 50,
    });
    expect(rendered).toEqual(["a", "b"]);
  });

  it("skips an empty page and fetches the next one", () => {
    const { controller, rendered, requested } = makeController();
    controller.start({
      slides: [],
      after: "t3_p2",
      exhausted: false,
      postsScanned: 50,
    });
    expect(rendered).toEqual([]);
    expect(requested).toEqual(["t3_p2"]);
    controller.append({
      slides: [slideWithId("a")],
      after: null,
      exhausted: true,
      postsScanned: 50,
    });
    expect(rendered).toEqual(["a"]);
  });

  it("keeps paging when an all-filtered page arrives while waiting", () => {
    const { controller, rendered, requested } = makeController();
    controller.start({
      slides: [slideWithId("a")],
      after: "t3_p2",
      exhausted: false,
      postsScanned: 50,
    });
    controller.markReady();
    vi.advanceTimersByTime(5000); // hits the end, waits for more
    expect(rendered).toEqual(["a"]);
    controller.append({
      slides: [], // entirely filtered out
      after: "t3_p3",
      exhausted: false,
      postsScanned: 50,
    });
    expect(requested).toEqual(["t3_p2", "t3_p3"]);
    controller.append({
      slides: [slideWithId("b")],
      after: null,
      exhausted: true,
      postsScanned: 50,
    });
    expect(rendered).toEqual(["a", "b"]);
  });

  it("ends gracefully when an exhausted empty page arrives while waiting", () => {
    const { controller, rendered, ended } = makeController();
    controller.start({
      slides: [slideWithId("a")],
      after: "t3_p2",
      exhausted: false,
      postsScanned: 50,
    });
    controller.markReady();
    vi.advanceTimersByTime(5000);
    controller.append({
      slides: [],
      after: null,
      exhausted: true,
      postsScanned: 50,
    });
    expect(ended()).toBe(1);
    expect(rendered).toEqual(["a"]);
  });

  it("calls onEnd when advancing past the last slide of an exhausted queue", () => {
    const { controller, ended } = makeController();
    controller.start({
      slides: [slideWithId("a")],
      exhausted: true,
      postsScanned: 1,
    });
    controller.next();
    expect(ended()).toBe(1);
  });
});

describe("skip(n)", () => {
  const makeSlides = (/** @type {number} */ n) =>
    Array.from({ length: n }, (_, i) => slideWithId(`s${i}`));
  const page = (
    /** @type {import("../../lib/slides.js").Slide[]} */ slides,
  ) => ({
    slides,
    after: null,
    exhausted: true,
    postsScanned: slides.length,
  });

  it("skips forward n raw indices", () => {
    const { controller } = makeController();
    controller.start(page(makeSlides(25)));
    controller.skip(10);
    expect(controller.current?.id).toBe("s10");
    expect(controller.position.index).toBe(10);
  });

  it("skips back n raw indices", () => {
    const { controller } = makeController();
    controller.start(page(makeSlides(25)));
    controller.skip(15);
    controller.skip(-10);
    expect(controller.current?.id).toBe("s5");
  });

  it("clamps a forward skip at the last loaded slide", () => {
    const { controller } = makeController();
    controller.start(page(makeSlides(5)));
    controller.skip(10);
    expect(controller.current?.id).toBe("s4");
  });

  it("clamps a back skip at the first slide", () => {
    const { controller } = makeController();
    controller.start(page(makeSlides(5)));
    controller.skip(-10);
    expect(controller.current?.id).toBe("s0");
  });

  it("skip(0) is a no-op (no re-render)", () => {
    const { controller, rendered } = makeController();
    controller.start(page(makeSlides(5)));
    controller.next(); // s1
    const before = rendered.length;
    controller.skip(0);
    expect(controller.current?.id).toBe("s1");
    expect(rendered.length).toBe(before);
  });

  it("a clamped skip that can't move doesn't re-render", () => {
    const { controller, rendered } = makeController();
    controller.start(page(makeSlides(5))); // at s0
    const before = rendered.length;
    controller.skip(-10);
    expect(controller.current?.id).toBe("s0");
    expect(rendered.length).toBe(before);
  });

  it("lands on a raw index even if it is a skipped slide (coarse seek)", () => {
    const { controller } = makeController();
    controller.start(page(makeSlides(12)));
    controller.slides[10].skipReason = "dupe";
    controller.skip(10);
    expect(controller.current?.id).toBe("s10");
    expect(controller.current?.skipReason).toBe("dupe");
  });

  it("keeps the absolute position correct across eviction", () => {
    const { controller } = makeController({ maxBackHistory: 5 });
    controller.start(page(makeSlides(25)));
    controller.skip(15); // trims the front; position stays absolute
    expect(controller.position.index).toBe(15);
    controller.skip(-3);
    expect(controller.position.index).toBe(12);
    expect(controller.current?.id).toBe("s12");
  });
});

describe("skipPostGroup()", () => {
  /** @param {string} id @param {string} postId */
  const s = (id, postId) => slideWithId(id, { postId });
  /** @param {import("../../lib/slides.js").Slide[]} slides */
  const grp = (slides) => ({
    slides,
    after: null,
    exhausted: true,
    postsScanned: slides.length,
  });

  it("jumps from a gallery to the next post", () => {
    const { controller } = makeController();
    controller.start(
      grp([s("p1:0", "p1"), s("p1:1", "p1"), s("p1:2", "p1"), s("p2:0", "p2")]),
    );
    controller.next(); // into the gallery (p1:1)
    controller.skipPostGroup();
    expect(controller.current?.id).toBe("p2:0");
  });

  it("from a standalone post advances to the next post", () => {
    const { controller } = makeController();
    controller.start(grp([s("a:0", "a"), s("b:0", "b")]));
    controller.skipPostGroup();
    expect(controller.current?.id).toBe("b:0");
  });

  it("skips over an already-skipped slide to the next real post", () => {
    const { controller } = makeController();
    controller.start(grp([s("p1:0", "p1"), s("p2:0", "p2"), s("p3:0", "p3")]));
    controller.slides[1].skipReason = "Unavailable";
    controller.skipPostGroup();
    expect(controller.current?.id).toBe("p3:0");
  });

  it("ends the show when the trailing gallery is the last content", () => {
    const { controller, ended } = makeController();
    controller.start(grp([s("a:0", "a"), s("g:0", "g"), s("g:1", "g")]));
    controller.next(); // g:0
    controller.skipPostGroup(); // nothing after this post -> end
    expect(ended()).toBe(1);
  });

  it("paginates when the trailing gallery is not yet exhausted", () => {
    const { controller, requested } = makeController();
    controller.start({
      slides: [s("a:0", "a"), s("g:0", "g"), s("g:1", "g")],
      after: "t3_next",
      exhausted: false,
      postsScanned: 50,
    });
    controller.next(); // g:0
    controller.skipPostGroup();
    expect(requested).toContain("t3_next");
  });
});

// Offline, deterministic driver for the slideshow screenshot. It mounts the
// REAL overlay + session over a handful of fixture image slides, with no
// extension, network, or live Reddit. The screenshot script (scripts/
// screenshots.mjs) bundles this with esbuild, serves it, and fulfils the
// i.redd.it media URLs with inline SVG so the slides render without a network.
//
// It drives createSlideshowSession at its injectable seam, so it stays decoupled
// from overlay internals (it keeps working across overlay refactors).
import { createOverlay } from "../../lib/overlay-ui.js";
import { createSlideshowSession } from "../../lib/session.js";
import { normalizeSettings } from "../../lib/settings.js";
// esbuild loads this as a string (loader { ".css": "text" }); it's injected into
// the overlay's shadow root, mirroring how the content script styles the overlay.
import overlayCss from "../../assets/overlay.css";

const ORIGIN = "https://old.reddit.com";

// Fictional authors so the byline (/u/author to /r/subreddit …) reads like a
// real feed in the demo shot.
const AUTHORS = [
  "highwayrescue",
  "naptime_nina",
  "snowpaws",
  "two_tabbies",
  "sunbeam_sam",
];
const SCORES = [12437, 8123, 3291, 5290, 847];

/**
 * @param {number} n
 * @param {string} title
 * @param {number} width
 * @param {number} height
 * @returns {import("../../lib/slides.js").Slide}
 */
function imageSlide(n, title, width, height) {
  const url = `https://i.redd.it/rs-fixture-${n}.jpg`;
  return {
    id: `t3_fix${n}:0`,
    postId: `t3_fix${n}`,
    provider: "reddit-image",
    kind: "image",
    mediaUrl: url,
    sourceUrl: url,
    permalink: `${ORIGIN}/r/aww/comments/fix${n}/`,
    title,
    author: AUTHORS[n - 1] ?? "redditor",
    subreddit: "aww",
    score: SCORES[n - 1],
    over18: false,
    durationMode: "timer",
    audioAvailable: false,
    sourceWidth: width,
    sourceHeight: height,
    quality: "original",
    mimeType: "image/jpeg",
    filenameHint: `t3_fix${n}.jpg`,
  };
}

const slides = [
  imageSlide(1, "Rescued this little one off the highway today", 1600, 1067),
  imageSlide(2, "She finally trusts me enough to nap on my lap", 1500, 1000),
  imageSlide(
    3,
    "First snow - he has absolutely no idea what to do",
    1600,
    1200,
  ),
  imageSlide(4, "Adopted brothers, inseparable since day one", 1440, 1080),
  imageSlide(5, "Sunbeam appreciation, hour three", 1600, 900),
];

const settings = normalizeSettings({
  autoplay: true,
  // Long dwell so the capture lands on the first slide regardless of timing.
  imageTimerSeconds: 30,
  transition: "fade",
  alwaysShowMeta: true,
  // Show the top countdown bar on every slide so it appears in the shot.
  timerBar: "all",
  panZoom: false,
});

const session = createSlideshowSession({
  doc: document,
  createOverlay: (handlers) => createOverlay(handlers, document, overlayCss),
  getSettings: async () => settings,
  saveSettings: async () => settings,
  // One page, fully exhausted: the controller never asks for more.
  requestPage: async (after) =>
    after
      ? {
          ok: true,
          page: { slides: [], after: null, exhausted: true, postsScanned: 0 },
        }
      : {
          ok: true,
          page: {
            slides,
            after: null,
            exhausted: true,
            postsScanned: slides.length,
          },
        },
  getStartCursor: () => undefined,
  openUrl: () => {},
  createImage: () => new Image(),
});

session.start();

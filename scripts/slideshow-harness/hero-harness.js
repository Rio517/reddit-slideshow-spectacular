// Hero-shot variant of harness.js: the REAL overlay + session over twelve demo
// slides that reuse the three demo media files, mounted on top of hero.html (a
// hand-made old-Reddit listing). scripts/ship-heroes.mjs bundles this, serves
// it, fulfils the i.redd.it media, steps to the hero slide (the puppy, 5 / 12)
// and screenshots it. A very long timer keeps the show from advancing.
import { createOverlay } from "../../lib/overlay-ui.js";
import { createSlideshowSession } from "../../lib/session.js";
import { normalizeSettings } from "../../lib/settings.js";
import overlayCss from "../../assets/overlay.css";

const ORIGIN = "https://old.reddit.com";

const PUPPY = ["https://i.redd.it/cpkr7nfk7j4h1.png", 1122, 1402, "image/png"];
const CAT = ["https://i.redd.it/6pazgvbx5j4h1.png", 1122, 1402, "image/png"];
const GIF = ["https://i.redd.it/rs-catgif.gif", 400, 225, "image/gif"];

// [id, title, author, score, media, likes]; the hero (index 4) is the puppy.
const ROWS = [
  ["a1b2c3", "Spectacular Cat", "marbled_fox", 8123, CAT],
  ["d4e5f6", "Antique map of the world", "quillandink", 5290, PUPPY],
  ["g7h8i9", "Streamable Content", "lumen_park", 3841, GIF],
  ["j1k2l3", "Imgur Album - 9 images", "tidepool_tom", 2716, CAT],
  ["puppy1", "Spectacular Puppy", "rio517", 12437, PUPPY, true],
  ["m4n5o6", "Cute Dog - Imgur, single image", "pixel_harbor", 9034, PUPPY],
  ["p7q8r9", "Amateur GIF by nightowl_gif", "nightowl_gif", 1985, GIF],
  ["s1t2u3", "Cross post - Kittens at golden hour", "velvetmoss", 6472, CAT],
  ["v4w5x6", "SWF post from Redgifs", "copper_kettle", 1207, GIF],
  ["y7z8a9", "Spectacular Cat from a rooftop", "saltandsage", 4358, CAT],
  ["b1c2d3", "Mountain sunrise, 4K", "driftwood_dan", 7629, PUPPY],
  ["e4f5g6", "Slideshow Spectacular demo reel", "rio517", 2503, GIF],
];

const slides = ROWS.map(([id, title, author, score, media, likes]) => {
  const [url, width, height, mimeType] = media;
  return /** @type {import("../../lib/slides.js").Slide} */ ({
    id: `t3_${id}:0`,
    postId: `t3_${id}`,
    provider: "reddit-image",
    kind: "image",
    mediaUrl: url,
    sourceUrl: url,
    permalink: `${ORIGIN}/r/SlideShowSpectacular/comments/${id}/`,
    title,
    author,
    subreddit: "SlideShowSpectacular",
    over18: false,
    durationMode: "timer",
    audioAvailable: false,
    sourceWidth: width,
    sourceHeight: height,
    quality: "original",
    mimeType,
    filenameHint: `${id}.jpg`,
    score,
    ...(likes ? { likes: true } : {}),
  });
});

const settings = normalizeSettings({
  autoplay: true,
  // Long dwell: nothing advances while the shot is staged.
  imageTimerSeconds: 3600,
  transition: "fade",
  alwaysShowMeta: true,
  alwaysShowCount: true,
  timerBar: "none",
  panZoom: false,
  dedupe: false,
  contentDedup: false,
});

const session = createSlideshowSession({
  doc: document,
  createOverlay: (handlers) => createOverlay(handlers, document, overlayCss),
  getSettings: async () => settings,
  saveSettings: async () => settings,
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

// Same keyboard wiring as the content script, so the shot script can step
// slides with ArrowRight.
document.addEventListener(
  "keydown",
  (event) => session.handleKeydown(event),
  true,
);

session.start();

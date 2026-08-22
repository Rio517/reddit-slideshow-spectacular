// Recording variant of harness.js: the REAL overlay + session over three demo
// slides (the puppy + two cats from r/SlideShowSpectacular). The recorder
// (scripts/record-slideshow.mjs) bundles this, serves it, fulfils the i.redd.it
// media URLs from local files, and screenshots each slide; ffmpeg then crossfades
// the shots into the looping docs/slideshow.webm. A long timer keeps it on the
// first slide so the recorder advances it manually (ArrowRight) at its own pace.
import { createOverlay } from "../../lib/overlay-ui.js";
import { createSlideshowSession } from "../../lib/session.js";
import { normalizeSettings } from "../../lib/settings.js";
import overlayCss from "../../assets/overlay.css";

const ORIGIN = "https://old.reddit.com";

/**
 * @param {string} id
 * @param {string} title
 * @param {string} url
 * @param {number} width
 * @param {number} height
 * @param {string} mimeType
 * @returns {import("../../lib/slides.js").Slide}
 */
function slide(id, title, url, width, height, mimeType) {
  return {
    id: `t3_${id}:0`,
    postId: `t3_${id}`,
    provider: "reddit-image",
    kind: "image",
    mediaUrl: url,
    sourceUrl: url,
    permalink: `${ORIGIN}/r/SlideShowSpectacular/comments/${id}/`,
    title,
    author: "rio517",
    subreddit: "SlideShowSpectacular",
    over18: false,
    durationMode: "timer",
    audioAvailable: false,
    sourceWidth: width,
    sourceHeight: height,
    quality: "original",
    mimeType,
    filenameHint: `${id}.jpg`,
  };
}

const slides = [
  slide(
    "puppy",
    "Spectacular Puppy",
    "https://i.redd.it/cpkr7nfk7j4h1.png",
    1122,
    1402,
    "image/png",
  ),
  slide(
    "cat1",
    "Spectacular Cat",
    "https://i.redd.it/6pazgvbx5j4h1.png",
    1122,
    1402,
    "image/png",
  ),
  // The Giphy cat is an animated GIF: image/gif gets the --fill treatment, so
  // the reel shows it viewport-fit like the real app instead of sitting tiny.
  slide(
    "cat2",
    "Spectacular Cat",
    "https://i.redd.it/rs-catgif.gif",
    400,
    225,
    "image/gif",
  ),
];

const settings = normalizeSettings({
  autoplay: true,
  // Long dwell: the recorder advances slides by hand, so they never auto-skip.
  imageTimerSeconds: 60,
  transition: "fade",
  alwaysShowMeta: true,
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

session.start();

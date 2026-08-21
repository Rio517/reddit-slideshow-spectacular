// Offline zoom-jank probe: ONE huge bitmap slide over the REAL overlay +
// session, keydown wired so Space pauses. Compositing-hint variants are
// selected via ?v= so the runner can A/B the same build.
/* global location */
import { createOverlay } from "../../lib/overlay-ui.js";
import { createSlideshowSession } from "../../lib/session.js";
import { normalizeSettings } from "../../lib/settings.js";
import overlayCss from "../../assets/overlay.css";

const url = "https://i.redd.it/rs-huge.jpg";
const slide = {
  id: "t3_huge:0",
  postId: "t3_huge",
  provider: "reddit-image",
  kind: "image",
  mediaUrl: url,
  sourceUrl: url,
  permalink: "https://old.reddit.com/r/aww/comments/huge/",
  title: "Huge image zoom jank probe",
  author: "probe",
  subreddit: "aww",
  over18: false,
  durationMode: "timer",
  audioAvailable: false,
  sourceWidth: 9000,
  sourceHeight: 12000,
  quality: "original",
  mimeType: "image/jpeg",
  filenameHint: "huge.jpg",
};

// ?v=<name> appends experiment CSS; the tried-and-rejected variants are
// recorded in docs/research/firefox-zoom-raster-jank.md.
/** @type {Record<string, string>} */
const VARIANTS = {};
const variant = new URLSearchParams(location.search).get("v") ?? "";
const css = overlayCss + (VARIANTS[variant] ?? "");

const settings = normalizeSettings({
  autoplay: true,
  imageTimerSeconds: 60,
  transition: "none",
  panZoom: false,
});

const session = createSlideshowSession({
  doc: document,
  createOverlay: (handlers) => createOverlay(handlers, document, css),
  getSettings: async () => settings,
  saveSettings: async () => settings,
  requestPage: async (after) => ({
    ok: true,
    page: after
      ? { slides: [], after: null, exhausted: true, postsScanned: 0 }
      : { slides: [slide], after: null, exhausted: true, postsScanned: 1 },
  }),
  getStartCursor: () => undefined,
  openUrl: () => {},
  createImage: () => new Image(),
});
document.addEventListener("keydown", (e) => session.handleKeydown(e), true);
session.start();

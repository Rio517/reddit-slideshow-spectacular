import { fetchQueuePage } from "@/lib/queue.js";
import {
  createMessageRouter,
  isAllowedFetchUrl,
  isHashableHost,
  isProxyMediaHost,
  isVredditHost,
} from "@/lib/background-router.js";
import { createRedgifsResolver } from "@/lib/redgifs.js";
import {
  createStreamableResolver,
  resolveStreamableSlides,
} from "@/lib/streamable.js";
import {
  createImgurAlbumResolver,
  resolveImgurAlbumSlides,
} from "@/lib/imgur.js";
import {
  fetchCappedBytes,
  MAX_IMAGE_BYTES,
  MAX_MEDIA_BYTES,
  MAX_MANIFEST_BYTES,
} from "@/lib/proxy-fetch.js";
import { audioUrlFromDash } from "@/lib/reddit-audio.js";
import { createRedditWriter } from "@/lib/reddit-write.js";
import { createImageHasher } from "@/lib/image-hash.js";
import { getSettings } from "@/lib/settings.js";
import { createLogger } from "@/lib/log.js";

const log = createLogger("background");

/**
 * Capped proxy fetch that re-checks the host after any redirect.
 * @param {number} maxBytes
 * @param {(host: string) => boolean} isAllowed
 * @param {string} label
 * @returns {(url: string) => Promise<ArrayBuffer>}
 */
function cappedFetch(maxBytes, isAllowed, label) {
  return (url) =>
    fetchCappedBytes(url, maxBytes, {
      validateFinalUrl: (finalUrl) =>
        isAllowedFetchUrl(finalUrl, isAllowed, `${label} redirect`),
    });
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    log.info("installed");
  });

  const redgifs = createRedgifsResolver();
  const streamable = createStreamableResolver();
  const imgur = createImgurAlbumResolver();
  // Account writes (vote / block / friend) through the logged-in session,
  // sharing one cached modhash.
  const writer = createRedditWriter();
  // Layer 2 dedup: fetch + decode + perceptual-hash entirely in the background,
  // returning only the hex so no image bytes cross the message boundary.
  const hashImage = createImageHasher({
    fetchBytes: cappedFetch(MAX_IMAGE_BYTES, isHashableHost, "hashImage"),
  });

  /**
   * Build a queue page, then upgrade Streamable iframe embeds to native video
   * and expand Imgur album placeholders 1→N into their member image slides.
   * Redgifs is resolved lazily instead (slideshow.resolveRedgifs, on approach),
   * so the page ships immediately with redgifs iframe embeds. Each resolver
   * leaves the iframe fallback in place when its lookup fails; a failed album
   * expansion drops to no slides.
   * @param {string} pageUrl
   * @param {{ after?: string }} options
   */
  const fetchQueuePageWithProviders = async (pageUrl, options) => {
    const page = await fetchQueuePage(pageUrl, options);
    page.slides = await resolveStreamableSlides(
      page.slides,
      streamable.resolve,
    );
    page.slides = await resolveImgurAlbumSlides(page.slides, imgur.resolve);
    return page;
  };

  const router = createMessageRouter({
    runtimeId: browser.runtime.id,
    fetchQueuePage: fetchQueuePageWithProviders,
    // Layer 2 dedup: returns the perceptual hash hex (computed background-side).
    hashImage,
    // Redgifs mp4 bytes played as a blob (CDN hotlink protection), plus
    // reddit image originals for the LOD zoom's off-main-thread decode.
    fetchMediaBytes: cappedFetch(
      MAX_MEDIA_BYTES,
      (host) => isProxyMediaHost(host) || isHashableHost(host),
      "fetchMedia",
    ),
    // Lazy redgifs: resolve one embed's native mp4 (+ duration/audio) on demand.
    resolveRedgifsId: (id) => redgifs.resolve(id),
    // v.redd.it audio: fetch the DASH manifest and read its separate audio
    // track URL (null for a silent clip), to play alongside the silent video.
    resolveRedditAudio: async (dashUrl) => {
      const bytes = await cappedFetch(
        MAX_MANIFEST_BYTES,
        isVredditHost,
        "resolveRedditAudio",
      )(dashUrl);
      return audioUrlFromDash(new TextDecoder().decode(bytes), dashUrl);
    },
    // Save the displayed media. The downloads API runs from the background and
    // fetches the file itself (no reddit Referer), so a hotlink-protected CDN
    // serves it; the suggested filename comes from the slide's hint.
    downloadMedia: ({ url, filename }) =>
      browser.downloads.download({ url, filename, saveAs: false }),
    // Optional per-user folder inside the browser's Downloads folder.
    getDownloadSubfolder: async () => (await getSettings()).downloadSubfolder,
    // Account writes through the session (cookie + modhash).
    vote: (id, dir) => writer.vote(id, dir),
    block: (name) => writer.blockUser(name),
    friend: (name) => writer.friendUser(name),
    openOptionsPage: () => browser.runtime.openOptionsPage(),
    // Minimal popup window (no tab strip / toolbar / URL bar) for AirPlay.
    openPopout: (url) =>
      browser.windows.create({ url, type: "popup", width: 1280, height: 800 }),
  });
  browser.runtime.onMessage.addListener(router);

  browser.action.onClicked.addListener(
    async (/** @type {Browser.tabs.Tab} */ tab) => {
      if (!tab.id) return;
      try {
        await browser.tabs.sendMessage(tab.id, {
          type: "slideshow.startRequested",
          payload: { source: "action" },
        });
      } catch (err) {
        log.info("toolbar clicked off a Reddit listing", err);
      }
    },
  );
});

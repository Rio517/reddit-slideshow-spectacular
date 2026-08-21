// Imported as a string (not injected globally) so it can be scoped inside the
// overlay's shadow root, isolating it from old.reddit / RES page styles.
import overlayCss from "@/assets/overlay.css?inline";
import { createOverlay } from "@/lib/overlay-ui.js";
import { getSettings, saveSettings } from "@/lib/settings.js";
import { createSlideshowSession } from "@/lib/session.js";
import { base64ToBlob } from "@/lib/bytes-base64.js";
import { redgifsVideoSlide } from "@/lib/redgifs.js";
import { redgifsId } from "@/lib/slides.js";
import { createLogger } from "@/lib/log.js";
import { setLocale, resolveLocale } from "@/lib/i18n.js";

const log = createLogger("content");

// URL fragment a popout window carries so its content script auto-starts.
const POPOUT_MARKER = "rs-slideshow";

export default defineContentScript({
  matches: ["https://old.reddit.com/*", "https://www.reddit.com/*"],
  cssInjectionMode: "manifest",
  main() {
    // UI language: an immediate best-guess from the browser, then the stored
    // override once settings load (and on change, applied to the next show start).
    const uiLang = browser.i18n.getUILanguage();
    setLocale(resolveLocale("auto", uiLang));
    const localeReady = getSettings()
      .then((s) => setLocale(resolveLocale(s.locale, uiLang)))
      .catch(() => {});

    const session = createSlideshowSession({
      doc: document,
      // Mount the overlay in a shadow root carrying its own stylesheet.
      createOverlay: (handlers) =>
        createOverlay(handlers, document, overlayCss),
      getSettings,
      saveSettings,
      requestPage: async (after) => {
        try {
          return await browser.runtime.sendMessage({
            type: "slideshow.requestPage",
            payload: { pageUrl: window.location.href, after },
          });
        } catch (err) {
          log.warn("requestPage message failed", err);
          return {
            ok: false,
            error: { message: "Could not reach the extension background." },
          };
        }
      },
      // No start cursor: begin from the top of the current listing so the newest
      // posts (above wherever the user has scrolled) are included.
      openUrl: (url) => window.open(url, "_blank", "noopener"),
      // The options page can only be opened from a privileged context, so ask
      // the background to open it.
      openPreferences: () => {
        browser.runtime
          .sendMessage({ type: "slideshow.openOptions" })
          .catch(() => {});
      },
      // Re-open the current feed in a minimal popup window (for AirPlay); the
      // marker tells that window's content script to auto-start.
      openPopout: () => {
        const url = new URL(window.location.href);
        url.hash = POPOUT_MARKER;
        browser.runtime
          .sendMessage({
            type: "slideshow.openPopout",
            payload: { url: url.toString() },
          })
          .catch(() => {});
      },
      // Proxied media (Redgifs): the background fetches the mp4 bytes (no reddit
      // Referer, so the CDN serves them) and returns them base64-encoded (raw
      // bytes don't survive the message boundary in Chrome); we decode and wrap
      // them in a blob: URL the page CSP allows. Null on any failure.
      resolveMedia: async (url) => {
        let res;
        try {
          res = await browser.runtime.sendMessage({
            type: "slideshow.fetchMedia",
            payload: { url },
          });
        } catch (err) {
          log.warn("fetchMedia message failed", url, err);
          return null;
        }
        if (!res?.ok || !res.b64) return null;
        return URL.createObjectURL(await base64ToBlob(res.b64, "video/mp4"));
      },
      // A very large image's bytes, for the LOD zoom: a blob-sourced
      // createImageBitmap decodes off Firefox's main thread, an
      // element-sourced one blocks it. Null falls back to the element.
      fetchImageBytes: async (url) => {
        let res;
        try {
          res = await browser.runtime.sendMessage({
            type: "slideshow.fetchMedia",
            payload: { url },
          });
        } catch {
          return null;
        }
        if (!res?.ok || !res.b64) return null;
        const type = /\.png(?:$|\?)/.test(url)
          ? "image/png"
          : /\.webp(?:$|\?)/.test(url)
            ? "image/webp"
            : "image/jpeg";
        return base64ToBlob(res.b64, type);
      },
      // Lazy redgifs: resolve one embed's native mp4 on approach and return the
      // upgraded video slide (proxied on Chrome, where referrerpolicy is a no-op
      // on <video>). Null keeps the iframe embed.
      resolveRedgifs: async (slide) => {
        const id = redgifsId(slide.sourceUrl ?? slide.embedUrl);
        if (!id) return null;
        let res;
        try {
          res = await browser.runtime.sendMessage({
            type: "slideshow.resolveRedgifs",
            payload: { id },
          });
        } catch (err) {
          log.warn("resolveRedgifs message failed", id, err);
          return null;
        }
        if (!res?.ok || !res.media) return null;
        return redgifsVideoSlide(slide, res.media, {
          proxied: import.meta.env.CHROME,
        });
      },
      // v.redd.it audio: ask the background to read the separate audio track
      // URL from the DASH manifest. Null keeps the clip silent (today's
      // behavior).
      resolveRedditAudio: async (slide) => {
        if (!slide.dashUrl) return null;
        try {
          const res = await browser.runtime.sendMessage({
            type: "slideshow.resolveRedditAudio",
            payload: { dashUrl: slide.dashUrl },
          });
          return res?.ok ? (res.audioUrl ?? null) : null;
        } catch (err) {
          log.warn("resolveRedditAudio message failed", err);
          return null;
        }
      },
      // Up/down-key voting on the current post through the session (the
      // background holds the modhash and POSTs with the session cookie).
      vote: async (id, dir) => {
        try {
          return await browser.runtime.sendMessage({
            type: "slideshow.vote",
            payload: { id, dir },
          });
        } catch (err) {
          log.warn("vote message failed", err);
          return { ok: false };
        }
      },
      // User-initiated save of the displayed media: the background drives the
      // downloads API (a content script can't), using the slide's filename hint.
      downloadMedia: (url, filename) => {
        browser.runtime
          .sendMessage({
            type: "slideshow.download",
            payload: { url, filename },
          })
          .catch((err) => log.warn("download message failed", url, err));
      },
      // Which Reddit frontend launched the show: picks the friend/follow
      // confirmation wording (the write itself is the same on both).
      frontend: window.location.hostname === "old.reddit.com" ? "old" : "new",
      // Block the current author through the session (the background holds the
      // modhash and POSTs with the session cookie).
      block: async (name) => {
        try {
          return await browser.runtime.sendMessage({
            type: "slideshow.block",
            payload: { name },
          });
        } catch (err) {
          log.warn("block message failed", err);
          return { ok: false };
        }
      },
      // Friend / follow the current author (same write on both frontends).
      friend: async (name) => {
        try {
          return await browser.runtime.sendMessage({
            type: "slideshow.friend",
            payload: { name },
          });
        } catch (err) {
          log.warn("friend message failed", err);
          return { ok: false };
        }
      },
      createImage: () => new Image(),
      // A detached <video> used only to warm the cache for the next direct clip.
      createVideo: () => document.createElement("video"),
      // Layer 2 dedup: the background fetches, decodes, and 9x8 difference-hashes
      // the image, returning only the hex (raw bytes don't survive the message
      // boundary in Chrome). Returns null on any failure.
      computeImageHash: async (url) => {
        try {
          const res = await browser.runtime.sendMessage({
            type: "slideshow.hashImage",
            payload: { url },
          });
          return res?.ok ? (res.hash ?? null) : null;
        } catch (err) {
          log.warn("hashImage message failed", url, err);
          return null;
        }
      },
    });

    document.addEventListener(
      "keydown",
      (event) => session.handleKeydown(event),
      true,
    );

    // Apply preference changes (e.g. the per-image timer) to a running
    // slideshow immediately, without requiring a page reload.
    browser.storage.onChanged.addListener((_changes, area) => {
      if (area !== "local") return;
      getSettings()
        .then((next) => {
          setLocale(resolveLocale(next.locale, uiLang));
          session.applyLiveSettings(next);
        })
        .catch((err) => log.warn("applyLiveSettings failed", err));
    });

    browser.runtime.onMessage.addListener((/** @type {any} */ message) => {
      if (message?.type !== "slideshow.startRequested") return undefined;
      session.start();
      return Promise.resolve({ ok: true });
    });

    // A popout window opens the feed with the marker fragment; auto-start once
    // the saved locale is applied so the overlay isn't built in the wrong language.
    if (window.location.hash === `#${POPOUT_MARKER}`) {
      localeReady.then(() => session.start());
    }
  },
});

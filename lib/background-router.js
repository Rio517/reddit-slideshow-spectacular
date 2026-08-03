import { createLogger } from "./log.js";
import { arrayBufferToBase64 } from "./bytes-base64.js";
import {
  HASHABLE_HOSTS,
  PROXY_MEDIA_HOSTS,
  PROXY_MEDIA_HOST_SUFFIXES,
  hostMatches,
} from "./provider-hosts.js";

const log = createLogger("background");

/**
 * Background message router. Pure/injectable so the trust boundary (sender
 * validation) and message handling can be unit-tested without the extension.
 *
 * @param {{
 *   runtimeId: string,
 *   fetchQueuePage: (pageUrl: string, options: { after?: string }) => Promise<any>,
 *   hashImage: (url: string) => Promise<string | null>,
 *   fetchMediaBytes?: (url: string) => Promise<ArrayBuffer>,
 *   resolveRedgifsId?: (id: string) => Promise<any>,
 *   resolveRedditAudio?: (dashUrl: string) => Promise<string | null>,
 *   downloadMedia?: (opts: { url: string, filename: string }) => Promise<unknown>,
 *   vote?: (id: string, dir: 1 | 0 | -1) => Promise<unknown>,
 *   block?: (name: string) => Promise<unknown>,
 *   friend?: (name: string) => Promise<unknown>,
 *   openOptionsPage?: () => void,
 *   openPopout?: (url: string) => void,
 * }} deps
 * @returns {(message: any, sender: any) => Promise<any> | undefined}
 */
export function createMessageRouter(deps) {
  return (message, sender) => {
    // Only handle messages from this extension's own content scripts.
    if (sender?.id !== deps.runtimeId) return undefined;
    // Privileged fetches must come from a content script (which has a `tab`),
    // not an extension page (options/popup) where `sender.tab` is undefined.
    const fromContentScript = sender?.tab != null;
    if (message?.type === "slideshow.requestPage") {
      // The session-authenticated listing fetch is privileged too.
      if (!fromContentScript) return Promise.resolve({ ok: false });
      return handleRequestPage(message, deps.fetchQueuePage);
    }
    if (message?.type === "slideshow.hashImage") {
      // The bytes are fetched, decoded, and hashed in the background; only the
      // hex hash crosses back (a raw ArrayBuffer is dropped by Chrome's JSON
      // message serialization).
      if (!fromContentScript) return Promise.resolve({ ok: false });
      return handleHashImage(message, deps.hashImage);
    }
    if (message?.type === "slideshow.fetchMedia") {
      if (!fromContentScript) return Promise.resolve({ ok: false });
      return proxyFetch(message, deps.fetchMediaBytes, isProxyMediaHost);
    }
    if (message?.type === "slideshow.resolveRedgifs") {
      // Lazy redgifs: resolve one embed's native mp4 on demand (the page is
      // delivered with iframe embeds and upgraded as the show approaches them).
      if (!fromContentScript) return Promise.resolve({ ok: false });
      return handleResolveRedgifs(message, deps.resolveRedgifsId);
    }
    if (message?.type === "slideshow.resolveRedditAudio") {
      // v.redd.it audio: resolve the separate audio track from the DASH manifest
      // so the silent fallback video can be played with a synced companion audio.
      if (!fromContentScript) return Promise.resolve({ ok: false });
      return handleResolveRedditAudio(message, deps.resolveRedditAudio);
    }
    if (message?.type === "slideshow.download") {
      // A user-initiated save of the displayed media; content-script-only so a
      // page script can't drive the downloads API.
      if (!fromContentScript) return Promise.resolve({ ok: false });
      return handleDownload(message, deps.downloadMedia);
    }
    if (message?.type === "slideshow.vote") {
      // A user-initiated post vote through the logged-in session;
      // content-script-only so a page script can't vote as the user.
      if (!fromContentScript) return Promise.resolve({ ok: false });
      return handleVote(message, deps.vote);
    }
    if (message?.type === "slideshow.block") {
      // A user-initiated account block through the logged-in session;
      // content-script-only so a page script can't block as the user.
      if (!fromContentScript) return Promise.resolve({ ok: false });
      return handleBlock(message, deps.block);
    }
    if (message?.type === "slideshow.friend") {
      // A user-initiated friend/follow through the logged-in session;
      // content-script-only so a page script can't friend as the user.
      if (!fromContentScript) return Promise.resolve({ ok: false });
      return handleFriend(message, deps.friend);
    }
    if (message?.type === "slideshow.openOptions") {
      deps.openOptionsPage?.();
      return Promise.resolve({ ok: true });
    }
    if (message?.type === "slideshow.openPopout") {
      // Opening a window is content-script-only and host-restricted, so a page
      // script can't use the extension to spawn arbitrary windows.
      if (!fromContentScript) return Promise.resolve({ ok: false });
      return handleOpenPopout(message, deps.openPopout);
    }
    return undefined;
  };
}

// A popout may only be opened on the listing frontends.
const POPOUT_HOSTS = new Set(["old.reddit.com", "www.reddit.com"]);

/**
 * @param {any} message
 * @param {((url: string) => void) | undefined} openPopout
 */
function handleOpenPopout(message, openPopout) {
  const url = message.payload?.url;
  if (typeof openPopout !== "function" || typeof url !== "string") {
    return Promise.resolve({ ok: false });
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return Promise.resolve({ ok: false });
  }
  if (parsed.protocol !== "https:" || !POPOUT_HOSTS.has(parsed.hostname)) {
    return Promise.resolve({ ok: false });
  }
  openPopout(url);
  return Promise.resolve({ ok: true });
}

/**
 * @param {any} message
 * @param {(pageUrl: string, options: { after?: string }) => Promise<any>} fetchQueuePage
 */
function handleRequestPage(message, fetchQueuePage) {
  const pageUrl = message.payload?.pageUrl;
  if (typeof pageUrl !== "string") {
    return Promise.resolve(missingPageUrl());
  }
  const after = message.payload?.after;
  const options = typeof after === "string" ? { after } : {};

  return fetchQueuePage(pageUrl, options)
    .then((page) => ({
      ok: true,
      page: {
        slides: page.slides,
        after: page.after,
        postsScanned: page.postsScanned,
        exhausted: page.exhausted,
      },
    }))
    .catch((error) => ({ ok: false, error: errorPayload(error) }));
}

// Layer-2 dedup image hosts. An explicit allowlist (lib/provider-hosts) so the
// privileged background fetch can't be pointed elsewhere, independent of which
// host permissions happen to be granted.
// Exported so background.js can re-check a redirect's final URL with the same
// predicate used here on the initial URL (lib/proxy-fetch.js's validateFinalUrl).
export const isHashableHost = (/** @type {string} */ host) =>
  hostMatches(host, { hosts: HASHABLE_HOSTS });

// Proxied-media hosts: CDNs that 403 a reddit Referer, plus providers on
// varying CDN subdomains (matched by suffix). Same independent-allowlist
// guarantee as above.
export const isProxyMediaHost = (/** @type {string} */ host) =>
  hostMatches(host, {
    hosts: PROXY_MEDIA_HOSTS,
    suffixes: PROXY_MEDIA_HOST_SUFFIXES,
  });

/**
 * Gate a privileged-fetch URL: HTTPS plus an allowlisted host (a cleartext
 * http://i.redd.it would otherwise pass the host check and trigger a cleartext
 * fetch). Logs and returns false on any failure so the caller fails closed.
 * Exported so background.js can reuse it to re-validate a redirect's final URL
 * instead of duplicating the allowlist check there.
 * @param {string} url
 * @param {(host: string) => boolean} isAllowed
 * @param {string} label
 * @returns {boolean}
 */
export function isAllowedFetchUrl(url, isAllowed, label) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    log.warn(`${label}: unparseable URL`, url);
    return false;
  }
  if (parsed.protocol !== "https:" || !isAllowed(parsed.hostname)) {
    log.warn(
      `${label}: host/protocol not allowed`,
      parsed.protocol,
      parsed.hostname,
    );
    return false;
  }
  return true;
}

/**
 * Validate a Layer-2 hash request (HTTPS + hashable host) and return the
 * perceptual hash computed in the background. Fails closed on any problem.
 *
 * @param {any} message
 * @param {((url: string) => Promise<string | null>) | undefined} hashImage
 */
function handleHashImage(message, hashImage) {
  const url = message.payload?.url;
  if (typeof hashImage !== "function" || typeof url !== "string") {
    return Promise.resolve({ ok: false });
  }
  if (!isAllowedFetchUrl(url, isHashableHost, "hashImage")) {
    return Promise.resolve({ ok: false });
  }
  return Promise.resolve(hashImage(url))
    .then((hash) => ({ ok: true, hash }))
    .catch((err) => {
      log.warn("hashImage failed", url, err);
      return { ok: false };
    });
}

/**
 * Validate a privileged background fetch (HTTPS + allowlisted host) and return
 * the bytes as base64 (raw binary doesn't survive the JSON-serialized message
 * boundary). Fails closed on any problem.
 *
 * @param {any} message
 * @param {((url: string) => Promise<ArrayBuffer>) | undefined} fetchBytes
 * @param {(host: string) => boolean} isAllowed
 */
function proxyFetch(message, fetchBytes, isAllowed) {
  const url = message.payload?.url;
  if (typeof fetchBytes !== "function" || typeof url !== "string") {
    return Promise.resolve({ ok: false });
  }
  if (!isAllowedFetchUrl(url, isAllowed, "proxyFetch")) {
    return Promise.resolve({ ok: false });
  }
  return fetchBytes(url)
    .then((bytes) => ({ ok: true, b64: arrayBufferToBase64(bytes) }))
    .catch((err) => {
      log.warn("proxyFetch failed", url, err);
      return { ok: false };
    });
}

/**
 * Resolve one redgifs id to its native mp4 media, for lazy (on-approach)
 * upgrading of iframe embeds. Fails closed on a missing id or a resolve error,
 * so the caller keeps the iframe embed.
 *
 * @param {any} message
 * @param {((id: string) => Promise<any>) | undefined} resolveRedgifsId
 */
function handleResolveRedgifs(message, resolveRedgifsId) {
  const id = message.payload?.id;
  if (typeof resolveRedgifsId !== "function" || typeof id !== "string" || !id) {
    return Promise.resolve({ ok: false });
  }
  return Promise.resolve(resolveRedgifsId(id))
    .then((media) => ({ ok: true, media }))
    .catch((err) => {
      log.warn("resolveRedgifs failed", id, err);
      return { ok: false };
    });
}

/**
 * Cast a post vote through the session. Validates the id is a post fullname
 * (`t3_…`) and the direction is up/clear/down before the privileged write.
 *
 * @param {any} message
 * @param {((id: string, dir: 1 | 0 | -1) => Promise<unknown>) | undefined} vote
 */
function handleVote(message, vote) {
  const id = message.payload?.id;
  const dir = message.payload?.dir;
  if (
    typeof vote !== "function" ||
    typeof id !== "string" ||
    !/^t3_[a-z0-9]+$/i.test(id) ||
    (dir !== 1 && dir !== 0 && dir !== -1)
  ) {
    return Promise.resolve({ ok: false });
  }
  return Promise.resolve(vote(id, dir))
    .then(() => ({ ok: true }))
    .catch((err) => {
      log.warn("vote failed", id, err);
      return { ok: false };
    });
}

// Reddit username charset: 3–20 of letters/digits/underscore/hyphen. We accept
// 1–20 to stay permissive; the write itself rejects a non-existent name.
const USERNAME_RE = /^[A-Za-z0-9_-]{1,20}$/;

/**
 * Block a user account through the session. Validates the username before the
 * privileged write.
 * @param {any} message
 * @param {((name: string) => Promise<unknown>) | undefined} block
 */
function handleBlock(message, block) {
  const name = message.payload?.name;
  if (
    typeof block !== "function" ||
    typeof name !== "string" ||
    !USERNAME_RE.test(name)
  ) {
    return Promise.resolve({ ok: false });
  }
  return Promise.resolve(block(name))
    .then(() => ({ ok: true }))
    .catch((err) => {
      log.warn("block failed", name, err);
      return { ok: false };
    });
}

/**
 * Friend/follow a user through the session. Validates the username before the
 * privileged write.
 * @param {any} message
 * @param {((name: string) => Promise<unknown>) | undefined} friend
 */
function handleFriend(message, friend) {
  const name = message.payload?.name;
  if (
    typeof friend !== "function" ||
    typeof name !== "string" ||
    !USERNAME_RE.test(name)
  ) {
    return Promise.resolve({ ok: false });
  }
  return Promise.resolve(friend(name))
    .then(() => ({ ok: true }))
    .catch((err) => {
      log.warn("friend failed", name, err);
      return { ok: false };
    });
}

// The only host whose DASH manifest we fetch for the separate audio track.
export const isVredditHost = (/** @type {string} */ host) =>
  host === "v.redd.it";

/**
 * Resolve the audio track URL from a v.redd.it DASH manifest. HTTPS + v.redd.it
 * gated (the manifest is background-fetched), then delegates the fetch+parse.
 * `audioUrl` is null for a silent clip; fails closed on a bad host or an error.
 *
 * @param {any} message
 * @param {((dashUrl: string) => Promise<string | null>) | undefined} resolveRedditAudio
 */
function handleResolveRedditAudio(message, resolveRedditAudio) {
  const dashUrl = message.payload?.dashUrl;
  if (typeof resolveRedditAudio !== "function" || typeof dashUrl !== "string") {
    return Promise.resolve({ ok: false });
  }
  if (!isAllowedFetchUrl(dashUrl, isVredditHost, "resolveRedditAudio")) {
    return Promise.resolve({ ok: false });
  }
  return Promise.resolve(resolveRedditAudio(dashUrl))
    .then((audioUrl) => ({ ok: true, audioUrl: audioUrl ?? null }))
    .catch((err) => {
      log.warn("resolveRedditAudio failed", dashUrl, err);
      return { ok: false };
    });
}

/**
 * Save the displayed media via the downloads API. HTTPS-only (any host - images
 * legitimately come from external CDNs); the suggested filename is reduced to a
 * basename so a crafted hint can't escape the download directory. Fails closed.
 *
 * @param {any} message
 * @param {((opts: { url: string, filename: string }) => Promise<unknown>) | undefined} downloadMedia
 */
function handleDownload(message, downloadMedia) {
  const url = message.payload?.url;
  const filename = message.payload?.filename;
  if (
    typeof downloadMedia !== "function" ||
    typeof url !== "string" ||
    typeof filename !== "string" ||
    !filename
  ) {
    return Promise.resolve({ ok: false });
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return Promise.resolve({ ok: false });
  }
  if (parsed.protocol !== "https:") return Promise.resolve({ ok: false });
  // Reduce to a basename across both separators (Chrome on Windows treats a
  // backslash as a path separator into the download dir).
  const safeName = filename.split(/[/\\]/).pop() || filename;
  return Promise.resolve(
    downloadMedia({ url: parsed.toString(), filename: safeName }),
  )
    .then(() => ({ ok: true }))
    .catch((err) => {
      log.warn("download failed", url, err);
      return { ok: false };
    });
}

function missingPageUrl() {
  return {
    ok: false,
    error: { code: "missing-page-url", message: "Missing Reddit page URL" },
  };
}

/**
 * @param {any} error
 */
function errorPayload(error) {
  return {
    code: error?.name ?? "listing-fetch-failed",
    message: error?.message,
    status: error?.status,
    jsonUrl: error?.jsonUrl,
  };
}

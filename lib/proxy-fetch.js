/**
 * Privileged background fetch for proxied bytes (Layer 2 hash images, Redgifs
 * mp4s). Cookies are omitted and the Referer suppressed (so the Redgifs CDN,
 * which 403s a reddit referer, serves the body). Adds a timeout and a hard byte
 * cap so a huge or hanging response from an allowlisted host can't buffer an
 * unbounded amount of memory or stall the slideshow - it fails closed instead.
 */

// 25 MB is plenty for a downscaled-to-9x8 perceptual hash input.
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
// HD Redgifs clips can be tens of MB; cap well above that but below pathological.
export const MAX_MEDIA_BYTES = 150 * 1024 * 1024;
// A DASH manifest (v.redd.it audio resolution) is a few KB of XML; cap small.
export const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
export const FETCH_TIMEOUT_MS = 20000;

/**
 * @param {string} url
 * @param {number} maxBytes
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number, validateFinalUrl?: (url: string) => boolean }} [deps]
 * @returns {Promise<ArrayBuffer>}
 */
export async function fetchCappedBytes(
  url,
  maxBytes,
  { fetchImpl = fetch, timeoutMs = FETCH_TIMEOUT_MS, validateFinalUrl } = {},
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // The initial-URL allowlist doesn't see a redirect target; re-check the
    // final URL so an allowlisted host can't redirect us off-allowlist.
    if (validateFinalUrl && !validateFinalUrl(res.url)) {
      throw new Error("final-url-not-allowed");
    }

    const declared = Number(res.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maxBytes) {
      throw new Error("too-large");
    }

    // Stream-read with a running cap when Content-Length is missing or untrusted.
    const reader = res.body?.getReader?.();
    if (!reader) {
      const buffer = await res.arrayBuffer();
      if (buffer.byteLength > maxBytes) throw new Error("too-large");
      return buffer;
    }

    /** @type {Uint8Array[]} */
    const chunks = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error("too-large");
      }
      chunks.push(value);
    }
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return out.buffer;
  } finally {
    clearTimeout(timer);
  }
}

import { toListingJsonUrl } from "./reddit-url.js";

/**
 * @typedef {object} ListingSummary
 * @property {string} jsonUrl
 * @property {number} childCount
 * @property {string | null | undefined} after
 * @property {number} [status]
 * @property {boolean} [ok]
 * @property {string | null} [rateLimitRemaining]
 * @property {string | null} [rateLimitReset]
 * @property {string | null} [rateLimitUsed]
 */

export class RedditListingFetchError extends Error {
  /**
   * @param {string} message
   * @param {{ jsonUrl: string, status?: number, statusText?: string }} options
   */
  constructor(message, options) {
    super(message);
    this.name = "RedditListingFetchError";
    this.jsonUrl = options.jsonUrl;
    this.status = options.status;
    this.statusText = options.statusText;
  }
}

/**
 * Fetch a Reddit listing JSON URL using the browser session cookies.
 *
 * @param {string} pageUrl
 * @param {{ after?: string }} [options]
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<{ listing: any, summary: ListingSummary }>}
 */
export async function fetchListingJson(
  pageUrl,
  options = {},
  fetchImpl = fetch,
) {
  const jsonUrl = toListingJsonUrl(pageUrl, options);
  // `credentials: "include"` sends the user's Reddit session cookies so private
  // / logged-in listings resolve. This runs in the background context: Firefox's
  // event page sends cookies for a host_permissions host, and Chrome MV3 service
  // workers do too - but verify in the real-Chrome smoke test (ADR 0009), since
  // a regression there would silently fall back to logged-out results.
  const response = await fetchImpl(jsonUrl, {
    credentials: "include",
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    throw new RedditListingFetchError(
      `Reddit listing fetch failed with HTTP ${response.status}`,
      {
        jsonUrl,
        status: response.status,
        statusText: response.statusText,
      },
    );
  }

  // Fail closed if the (cookie-bearing) response isn't JSON, rather than parsing
  // whatever came back into the slide pipeline.
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new RedditListingFetchError("Reddit listing response was not JSON", {
      jsonUrl,
      status: response.status,
      statusText: response.statusText,
    });
  }

  const listing = await response.json();
  return {
    listing,
    summary: {
      ...summarizeListing(listing, jsonUrl),
      status: response.status,
      ok: response.ok,
      rateLimitRemaining: response.headers.get("x-ratelimit-remaining"),
      rateLimitReset: response.headers.get("x-ratelimit-reset"),
      rateLimitUsed: response.headers.get("x-ratelimit-used"),
    },
  };
}

/**
 * @param {any} listing
 * @param {string} jsonUrl
 * @returns {ListingSummary}
 */
export function summarizeListing(listing, jsonUrl) {
  const children = listing?.data?.children;
  return {
    jsonUrl,
    childCount: Array.isArray(children) ? children.length : 0,
    after: listing?.data?.after,
  };
}

import { slidesFromListing } from "./slides.js";
import { fetchListingJson } from "./reddit-listing.js";

const DEFAULT_PREFETCH_REMAINING_SLIDES = 2;
const DEFAULT_MIN_SCANNED_POSTS = 1;

/**
 * @typedef {import("./slides.js").Slide} Slide
 */

/**
 * @typedef {object} QueuePage
 * @property {Slide[]} slides
 * @property {number} postsScanned
 * @property {string | null | undefined} after
 * @property {boolean} exhausted
 */

/**
 * Fetch one listing page and build its queue page in a single step. Used by the
 * background script so the content script receives ready-to-render slides.
 *
 * @param {string} pageUrl
 * @param {{ after?: string }} [options]
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<QueuePage>}
 */
export async function fetchQueuePage(pageUrl, options = {}, fetchImpl) {
  const { listing } = await fetchListingJson(pageUrl, options, fetchImpl);
  return buildQueuePage(listing, originOf(pageUrl));
}

/**
 * Build a queue page from an already-fetched listing.
 *
 * `origin` is the page origin used to resolve each post's permalink (so "open
 * original" links back to the host the user is on). Prefer `fetchQueuePage`,
 * which derives it from the page URL. Calling this directly without `origin`
 * resolves permalinks against the old-Reddit default (see `slidesFromListing`),
 * which is wrong for a www page - always pass the page's own origin.
 *
 * @param {any} listing
 * @param {string} [origin] Page origin for permalink resolution.
 * @returns {QueuePage}
 */
export function buildQueuePage(listing, origin) {
  const children = listing?.data?.children;
  const postsScanned = Array.isArray(children) ? children.length : 0;
  const after = listing?.data?.after;
  return {
    slides: slidesFromListing(listing, origin),
    postsScanned,
    after,
    exhausted: !after,
  };
}

/**
 * @param {string} url
 * @returns {string | undefined}
 */
function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

/**
 * @param {{ currentIndex: number, slideCount: number }} state
 */
export function unreadSlideCount({ currentIndex, slideCount }) {
  return Math.max(slideCount - currentIndex - 1, 0);
}

/**
 * Decide whether pagination should fetch another listing page.
 *
 * The posts-scanned guard lets sparse pages keep paginating even if they
 * produced few slides, while still avoiding a request loop before we have
 * consumed any listing data.
 *
 * @param {{
 *   after?: string | null,
 *   currentIndex: number,
 *   slideCount: number,
 *   postsScannedSinceFetch: number,
 *   prefetchRemainingSlides?: number,
 *   minScannedPosts?: number,
 * }} state
 */
export function shouldFetchNextPage(state) {
  if (!state.after) return false;
  const prefetchRemainingSlides =
    state.prefetchRemainingSlides ?? DEFAULT_PREFETCH_REMAINING_SLIDES;
  const minScannedPosts = state.minScannedPosts ?? DEFAULT_MIN_SCANNED_POSTS;
  return (
    state.postsScannedSinceFetch >= minScannedPosts &&
    unreadSlideCount(state) <= prefetchRemainingSlides
  );
}

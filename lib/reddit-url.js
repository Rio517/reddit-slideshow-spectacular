const SUPPORTED_HOSTS = new Set(["old.reddit.com", "www.reddit.com"]);

/**
 * The old Reddit HTML page for a listing, on either host. Reddit 403s listing
 * `.json`, so the listing comes from this page (lib/reddit-listing).
 *
 * @param {string} pageUrl
 * @param {{ after?: string }} [options]
 * @returns {string}
 */
export function toListingHtmlUrl(pageUrl, options = {}) {
  const url = new URL(pageUrl);
  if (!SUPPORTED_HOSTS.has(url.hostname)) {
    throw new Error("Unsupported Reddit listing URL");
  }
  if (/\/comments\//.test(url.pathname)) {
    throw new Error("Unsupported Reddit listing URL");
  }

  const output = new URL(url.href);
  output.hostname = "old.reddit.com";
  output.hash = "";
  output.pathname = output.pathname.replace(/\/?\.json$/, "/");
  if (options.after) {
    output.searchParams.set("after", options.after);
  }
  return output.toString();
}

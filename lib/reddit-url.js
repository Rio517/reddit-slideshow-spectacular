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

const WWW_SORTS = new Set(["hot", "new", "top", "rising", "controversial"]);
const WWW_TIMES = new Set(["hour", "day", "week", "month", "year", "all"]);

/**
 * New Reddit's own listing partial for a www subreddit feed (`/r/<name>/` or
 * `/r/<name>/<sort>/`), or null for any other page: r/all, r/popular,
 * multireddits, users, the home feed and search read old Reddit.
 *
 * @param {string} pageUrl
 * @param {{ after?: string }} [options] `after` is a t3 fullname.
 * @returns {string | null}
 */
export function toWwwListingUrl(pageUrl, options = {}) {
  const url = new URL(pageUrl);
  if (url.hostname !== "www.reddit.com") return null;
  const match = /^\/r\/([A-Za-z0-9_]+)(?:\/([a-z]+))?\/?(?:\.json)?$/.exec(
    url.pathname,
  );
  if (!match) return null;
  const [, name, sort = "hot"] = match;
  if (!WWW_SORTS.has(sort) || /^(all|popular)$/i.test(name)) return null;

  const out = new URL(
    `https://www.reddit.com/svc/shreddit/community-more-posts/${sort}/`,
  );
  out.searchParams.set("name", name);
  const time = url.searchParams.get("t") ?? "";
  if ((sort === "top" || sort === "controversial") && WWW_TIMES.has(time)) {
    out.searchParams.set("t", time);
  }
  if (options.after) out.searchParams.set("after", btoa(options.after));
  return out.toString();
}

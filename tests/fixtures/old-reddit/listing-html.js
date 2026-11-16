// Old Reddit listing-page markup for listing-JSON posts, in the shape
// lib/reddit-listing.js parses: a `.thing` per post whose expando
// (`data-cachedhtml`, entity-encoded) holds the post's image or gif transcode.

/** @param {unknown} value */
const esc = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

/** @param {any} post A listing child's `data`. */
export function thingHtml(post) {
  const url = post.url_overridden_by_dest ?? post.url;
  const image = post.preview?.images?.[0];
  const mp4 = image?.variants?.mp4?.source;
  const shown = image?.resolutions?.at(-1) ?? image?.source;
  const expando = mp4
    ? `<div class="media-preview"><video class="preview" style="width: ${mp4.width}px; height: ${mp4.height}px;"> <source src="${esc(mp4.url)}" type="video/mp4"> </video></div>`
    : shown
      ? `<div class="media-preview"><img class="preview" src="${esc(shown.url)}" width="${shown.width}" height="${shown.height}"></div>`
      : "";
  return (
    `<div class=" thing id-${post.name} link " id="thing_${post.name}" data-fullname="${post.name}" data-type="link" data-is-gallery="false" data-author="${esc(post.author)}" data-subreddit="${esc(post.subreddit)}" data-url="${esc(url)}" data-permalink="${esc(post.permalink)}" data-score="${post.score ?? 1}" data-promoted="false" data-nsfw="${Boolean(post.over_18)}" >` +
    `<div class="midcol unvoted" ><div class="score unvoted" title="${post.score ?? 1}">${post.score ?? 1}</div></div>` +
    `<a class="title may-blank " href="${esc(url)}" >${esc(post.title)}</a>` +
    `<div class="expando expando-uninitialized" style='display: none' data-cachedhtml="${esc(expando)}"></div></div>`
  );
}

/** @param {any} listing A listing JSON (`{ data: { children, after } }`). */
export function listingHtml(listing) {
  const things = listing.data.children.map((/** @type {any} */ c) =>
    thingHtml(c.data),
  );
  const after = listing.data.after;
  const next = after
    ? `<span class="next-button"><a href="https://old.reddit.com/r/example/?count=25&amp;after=${after}" rel="nofollow next" >next</a></span>`
    : "";
  return `<div id="siteTable">${things.join("")}</div>${next}`;
}

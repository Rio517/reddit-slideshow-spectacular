/**
 * Account writes through the user's logged-in Reddit session: voting (ADR 0019),
 * blocking an author, and friending/following an author.
 *
 * Each is a cookie-authenticated POST to `old.reddit.com`, which requires the
 * session's CSRF token (`modhash`). The modhash comes from `/api/me.json`; it's
 * cached and refreshed once on a 403 (expired token). All requests send the
 * session cookie (`credentials: "include"`) - the background's `old.reddit.com`
 * host permission lets that bypass CORS.
 */

const ORIGIN = "https://old.reddit.com";

/**
 * @param {{ fetchImpl?: typeof fetch, origin?: string }} [deps]
 */
export function createRedditWriter({
  fetchImpl = fetch,
  origin = ORIGIN,
} = {}) {
  /** @type {string | null} */
  let modhash = null;

  /**
   * @param {boolean} [force]
   * @returns {Promise<string>}
   */
  async function getModhash(force) {
    if (modhash && !force) return modhash;
    const res = await fetchImpl(`${origin}/api/me.json`, {
      credentials: "include",
    });
    if (!res.ok) throw new Error(`me.json HTTP ${res.status}`);
    const next = (await res.json())?.data?.modhash;
    if (!next) throw new Error("no modhash (not logged in?)");
    modhash = next;
    return next;
  }

  /**
   * POST a form to an `/api` endpoint with the session cookie + modhash,
   * refreshing the modhash once on a 403 and retrying. Throws on a non-OK
   * response.
   * @param {string} path e.g. `/api/vote`
   * @param {Record<string, string>} fields
   * @returns {Promise<boolean>}
   */
  async function postForm(path, fields) {
    /** @param {string} uh */
    const post = (uh) =>
      fetchImpl(`${origin}${path}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ ...fields, uh }).toString(),
      });

    let res = await post(await getModhash());
    // A stale modhash 403s; refresh it once and retry.
    if (res.status === 403) res = await post(await getModhash(true));
    if (!res.ok) throw new Error(`${path} HTTP ${res.status}`);
    return true;
  }

  /**
   * @param {string} fullname Post fullname, e.g. `t3_abc`.
   * @param {1 | 0 | -1} dir Up (1), clear (0), or down (-1).
   * @returns {Promise<boolean>}
   */
  async function vote(fullname, dir) {
    return postForm("/api/vote", { id: fullname, dir: String(dir) });
  }

  /**
   * Block a user account (hides all their content). Reversible in Reddit
   * settings.
   * @param {string} name Reddit username (no `u/` prefix).
   * @returns {Promise<boolean>}
   */
  async function blockUser(name) {
    return postForm("/api/block_user", { name });
  }

  /**
   * Add the author to your friends list. Reddit folded "follow" into the friends
   * relationship, so old.reddit ("add friend") and new reddit ("follow") are the
   * same write; the UI just labels it differently per frontend.
   * @param {string} name Reddit username (no `u/` prefix).
   * @returns {Promise<boolean>}
   */
  async function friendUser(name) {
    return postForm("/api/friend", { type: "friend", name });
  }

  return { vote, blockUser, friendUser };
}

/**
 * The toolbar button (and its keyboard command). On a Reddit feed it starts
 * the slideshow in the page. Anywhere else it opens a short notice under the
 * button that says where the slideshow plays, instead of doing nothing.
 */

const REDDIT_HOSTS = new Set(["old.reddit.com", "www.reddit.com"]);

/** The page the notice popup shows (entrypoints/notice). */
export const NOTICE_PAGE = "/notice.html";

/**
 * Why a click can't start here, from the tab's URL, or null when it can.
 * The URL is only visible on hosts the extension may read (Reddit), so a tab
 * with no URL is off Reddit.
 *
 * @param {string | undefined} url
 * @returns {"offReddit" | "post" | null}
 */
export function noticeReason(url) {
  let parsed;
  try {
    parsed = new URL(url ?? "");
  } catch {
    return "offReddit";
  }
  if (!REDDIT_HOSTS.has(parsed.hostname)) return "offReddit";
  if (/\/comments\//.test(parsed.pathname)) return "post";
  return null;
}

/**
 * The feed a post page belongs to: `/r/<name>/` (or a user's page) on the
 * same host, or null when the path names neither.
 *
 * @param {string} url
 * @returns {string | null}
 */
export function feedOfPost(url) {
  const parsed = new URL(url);
  const m = parsed.pathname.match(/^\/(r|u|user)\/([^/]+)\//);
  if (!m) return null;
  return `${parsed.origin}/${m[1]}/${m[2]}/`;
}

/**
 * @param {"offReddit" | "post" | "reload"} reason
 * @param {number} tabId
 * @param {string | null} [feed]
 * @returns {string}
 */
export function noticeUrl(reason, tabId, feed) {
  const params = new URLSearchParams({ reason, tab: String(tabId) });
  if (feed) params.set("feed", feed);
  return `${NOTICE_PAGE}?${params}`;
}

/**
 * @typedef {object} ActionClickDeps
 * @property {{
 *   setPopup(details: { tabId: number, popup: string }): Promise<void>,
 *   openPopup(): Promise<unknown>,
 * }} action
 * @property {{ create(props: { url: string }): Promise<unknown> }} tabs
 * @property {(tabId: number) => Promise<unknown>} sendStart Ask the tab's
 *   content script to start; rejects when no content script answers.
 * @property {(path: string) => string} pageUrl Full URL of an extension page.
 * @property {{ info(...args: unknown[]): void }} log
 */

/**
 * @param {ActionClickDeps} deps
 * @returns {(tab: { id?: number, url?: string }) => Promise<void>}
 */
export function createActionClickHandler(deps) {
  const { action, tabs, sendStart, pageUrl, log } = deps;

  /**
   * Show the notice as this tab's popup, then clear it so the next click
   * runs this handler again. setPopup and openPopup are called in the same
   * turn as the click: Firefox opens a popup only from a user action. Where
   * openPopup isn't available (older Chrome), the notice opens in a tab.
   *
   * @param {number} tabId
   * @param {string} page
   */
  function showNotice(tabId, page) {
    const set = action.setPopup({ tabId, popup: page });
    const open = action.openPopup();
    return Promise.all([set, open])
      .catch((err) => {
        log.info("notice popup unavailable, opening a tab", err);
        const url = new URL(pageUrl(page));
        url.searchParams.set("view", "tab");
        return tabs.create({ url: url.href });
      })
      .finally(() => action.setPopup({ tabId, popup: "" }).catch(() => {}))
      .then(() => undefined);
  }

  return async (tab) => {
    const tabId = tab.id;
    if (tabId == null) return;
    const reason = noticeReason(tab.url);
    if (reason === "offReddit") {
      return showNotice(tabId, noticeUrl(reason, tabId));
    }
    if (reason === "post") {
      return showNotice(
        tabId,
        noticeUrl(reason, tabId, feedOfPost(tab.url ?? "")),
      );
    }
    try {
      await sendStart(tabId);
    } catch (err) {
      // A Reddit tab with no content script: it was open before the
      // extension was installed, updated or re-enabled.
      log.info("no content script in this Reddit tab", err);
      return showNotice(tabId, noticeUrl("reload", tabId));
    }
  };
}

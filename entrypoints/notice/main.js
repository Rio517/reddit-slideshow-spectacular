import { requiredElement } from "@/lib/dom.js";
import { t, resolveLocale } from "@/lib/i18n.js";
import { localizeDocument, fillTemplate } from "@/lib/i18n-dom.js";
import { getSettings } from "@/lib/settings.js";
import { noticeReason } from "@/lib/action-click.js";
import { COMMAND_NAME } from "@/lib/shortcut.js";

const REDDIT_HOME = "https://www.reddit.com/";

const params = new URLSearchParams(window.location.search);
const reason = params.get("reason") ?? "offReddit";
const tabId = Number(params.get("tab"));
const inTab = params.get("view") === "tab";
// Only a Reddit feed page is opened from here.
const feedParam = params.get("feed");
const feed = feedParam && noticeReason(feedParam) === null ? feedParam : null;

if (inTab) document.documentElement.classList.add("view-tab");

/** "r/pics" from https://www.reddit.com/r/pics/ */
function feedName() {
  return feed ? new URL(feed).pathname.replace(/^\/|\/$/g, "") : "";
}

/** @param {string} key @param {Record<string, string>} [marks] */
function sentence(key, marks = {}) {
  /** @type {Record<string, Node>} */
  const nodes = {};
  for (const [name, text] of Object.entries(marks)) {
    const el = document.createElement(name === "shortcut" ? "kbd" : "span");
    if (name === "feed") el.className = "feed";
    // Keys and feed names read left to right inside Arabic text.
    el.dir = "ltr";
    el.textContent = text;
    nodes[name] = el;
  }
  return fillTemplate(document, t(key), nodes);
}

async function shortcut() {
  try {
    const all = await browser.commands.getAll();
    return all.find((c) => c.name === COMMAND_NAME)?.shortcut || "";
  } catch {
    return "";
  }
}

/** Leave the notice: close the popup, or this tab after showing the Reddit one. */
async function done() {
  if (!inTab) {
    window.close();
    return;
  }
  const self = await browser.tabs.getCurrent();
  if (Number.isFinite(tabId)) {
    await browser.tabs.update(tabId, { active: true }).catch(() => {});
  }
  if (self?.id != null) await browser.tabs.remove(self.id);
}

const copy = {
  offReddit: {
    title: "noticeTitle",
    what: () => sentence("noticeOffReddit"),
    next: () => sentence("noticeNextOpen"),
    button: () => t("noticeOpenReddit"),
    go: async () => {
      if (inTab) window.location.assign(REDDIT_HOME);
      else {
        await browser.tabs.create({ url: REDDIT_HOME });
        window.close();
      }
    },
  },
  post: {
    title: "noticeTitle",
    what: () =>
      feed
        ? sentence("noticePost", { feed: feedName() })
        : sentence("noticePostNoFeed"),
    next: () =>
      feed
        ? sentence("noticeNextFeed", { feed: feedName() })
        : sentence("noticeNextOpen"),
    button: () =>
      feed
        ? t("noticeOpenFeed").replace("{feed}", feedName())
        : t("noticeOpenReddit"),
    go: async () => {
      await browser.tabs.update(tabId, { url: feed ?? REDDIT_HOME });
      await done();
    },
  },
  reload: {
    title: "noticeReloadTitle",
    what: () => sentence("noticeReload"),
    next: () => sentence("noticeNextReload"),
    button: () => t("noticeReloadPage"),
    go: async () => {
      await browser.tabs.reload(tabId);
      await done();
    },
  },
};

const view = copy[/** @type {keyof typeof copy} */ (reason)] ?? copy.offReddit;
const title = requiredElement("#title", HTMLElement);
const what = requiredElement("#what", HTMLElement);
const next = requiredElement("#next", HTMLElement);
const go = requiredElement("#go", HTMLButtonElement);

async function render() {
  const uiLang = browser.i18n.getUILanguage();
  let locale = resolveLocale("auto", uiLang);
  try {
    locale = resolveLocale((await getSettings()).locale, uiLang);
  } catch {
    // Settings unreadable: the browser language stands.
  }
  localizeDocument(document, locale);
  title.setAttribute("data-i18n", view.title);
  title.textContent = t(view.title);
  what.replaceChildren(view.what());
  next.replaceChildren(view.next());
  const keys = await shortcut();
  if (keys) {
    next.append(" ", sentence("noticeShortcut", { shortcut: keys }));
  }
  go.textContent = view.button();
}

go.addEventListener("click", () => {
  go.disabled = true;
  view.go().catch(() => {
    go.disabled = false;
  });
});

render();

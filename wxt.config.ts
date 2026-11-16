import { defineConfig } from "wxt";
import {
  REFERER_RULES,
  REFERER_RULES_PATH,
  REFERER_RULESET_ID,
} from "./lib/referer-rules.js";

export default defineConfig({
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    name: "Reddit Slideshow Spectacular!",
    default_locale: "en",
    description: "__MSG_extDescription__",
    homepage_url: "https://rio517.github.io/reddit-slideshow-spectacular/",
    // "downloads": save the displayed media to the user's downloads on demand
    // (the in-overlay download control), driven from the background.
    permissions: [
      "storage",
      "downloads",
      // Firefox-only: drop the Referer on Redgifs video requests so the clip
      // streams directly (ADR 0023). It acts only on hosts already granted
      // below and adds no install prompt.
      ...(browser === "firefox" ? ["declarativeNetRequestWithHostAccess"] : []),
    ],
    host_permissions: [
      // Listing JSON is fetched (with the session cookie) from these two.
      "https://old.reddit.com/*",
      "https://www.reddit.com/*",
      // Reddit image bytes, background-fetched for the perceptual-hash dedup that
      // is on by default (ADR 0006 Layer 2): the on-screen image (i.redd.it) and
      // its smaller previews. Display images load directly without a permission;
      // this access is only for hashing them to catch re-uploads.
      "https://i.redd.it/*",
      "https://preview.redd.it/*",
      "https://external-preview.redd.it/*",
      // v.redd.it: background-fetch the DASH manifest to read a hosted video's
      // separate audio track URL (ADR 0018). The video itself loads as a page
      // subresource (no permission); this access is only for the manifest.
      "https://v.redd.it/*",
      // Redgifs: resolve the direct mp4 (api) and fetch its bytes (media) in the
      // background, so the clip plays as a native, correctly-timed video.
      "https://api.redgifs.com/*",
      "https://media.redgifs.com/*",
      // Imgur: album/gallery member lists come from the keyless
      // imgur.com/ajaxalbums endpoint (ADR 0015); the background fetch needs the
      // host-permission CORS bypass because imgur returns a restrictive ACAO.
      // Origin-scoped rather than path-scoped to /ajaxalbums/*: we only ever
      // fetch that one path, and origin scope is the conventional grant form.
      // Member files and .gifv → .mp4 clips hotlink directly from i.imgur.com
      // (the blob proxy is the CSP fallback, ADR 0011); i.imgur.com bytes are
      // also hashed for dedup.
      "https://imgur.com/*",
      "https://i.imgur.com/*",
      // Streamable: resolve the mp4 via the public API (api.) and fetch the bytes
      // from the per-video CDN subdomain (cdn-*.). One wildcard covers both,
      // scoped to the streamable.com domain (ADR 0013).
      "https://*.streamable.com/*",
      // Giphy: background-fetch the transformed .mp4 from the media CDN subdomain
      // (media./media2./…), played as a blob (ADR 0014).
      "https://*.giphy.com/*",
    ],
    // PNG (not SVG) so the same icons work on Chrome, which rejects SVG icons.
    // Regenerate from public/icon.svg with: npm run icons
    icons: {
      16: "icon/16.png",
      32: "icon/32.png",
      48: "icon/48.png",
      96: "icon/96.png",
      128: "icon/128.png",
    },
    action: {
      default_title: "__MSG_actionTitle__",
      default_icon: {
        16: "icon/16.png",
        32: "icon/32.png",
        48: "icon/48.png",
        128: "icon/128.png",
      },
    },
    commands: {
      _execute_action: {
        suggested_key: { default: "Alt+Shift+S" },
        description: "__MSG_actionTitle__",
      },
    },
    // Firefox-only: the Referer ruleset, plus the gecko id + data-collection
    // declaration (Chrome would warn on that unrecognized key).
    ...(browser === "firefox"
      ? {
          declarative_net_request: {
            rule_resources: [
              {
                id: REFERER_RULESET_ID,
                enabled: true,
                path: REFERER_RULES_PATH,
              },
            ],
          },
          browser_specific_settings: {
            gecko: {
              id: "reddit-slideshow@knyflores.com",
              data_collection_permissions: {
                required: ["none"],
              },
            },
          },
        }
      : {}),
  }),
  hooks: {
    // The ruleset file is generated from lib/referer-rules.js, so the rule and
    // the host allowlist cannot drift. Firefox-only, like the manifest key.
    "build:publicAssets": (wxt, files) => {
      if (wxt.config.browser !== "firefox") return;
      files.push({
        relativeDest: REFERER_RULES_PATH,
        contents: `${JSON.stringify(REFERER_RULES, null, 2)}\n`,
      });
    },
  },
});

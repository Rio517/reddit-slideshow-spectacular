import { REDGIFS_MEDIA_HOST } from "./provider-hosts.js";

/**
 * The declarativeNetRequest ruleset that lets a Redgifs clip play directly
 * (ADR 0023).
 *
 * The Redgifs CDN 403s a request that carries a reddit `Referer`, and a
 * `<video>` has no way to drop it: `referrerpolicy` is not a media-element
 * attribute, and neither Firefox nor Chrome reads it there. So the header is
 * removed at the network layer instead. The build writes these rules to
 * `REFERER_RULES_PATH` and the manifest registers them as a static ruleset.
 *
 * No `initiatorDomains` condition: Firefox does not attribute a content
 * script's `<video>` request to the reddit page, so that condition never
 * matches there. The `declarativeNetRequestWithHostAccess` permission already
 * limits the rule to requests whose host the extension holds a permission for.
 */

export const REFERER_RULESET_ID = "referer";
export const REFERER_RULES_PATH = "rules/referer.json";

export const REFERER_RULES = [
  {
    id: 1,
    priority: 1,
    action: {
      type: "modifyHeaders",
      requestHeaders: [{ header: "referer", operation: "remove" }],
    },
    condition: {
      requestDomains: [REDGIFS_MEDIA_HOST],
      resourceTypes: ["media"],
    },
  },
];

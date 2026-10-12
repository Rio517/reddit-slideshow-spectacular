import { describe, expect, it } from "vitest";
import { REDGIFS_MEDIA_HOST } from "../../lib/provider-hosts.js";
import {
  REFERER_RULES,
  REFERER_RULES_PATH,
  REFERER_RULESET_ID,
} from "../../lib/referer-rules.js";

describe("REFERER_RULES", () => {
  it("removes only the Referer request header", () => {
    expect(REFERER_RULES).toHaveLength(1);
    expect(REFERER_RULES[0].action).toEqual({
      type: "modifyHeaders",
      requestHeaders: [{ header: "referer", operation: "remove" }],
    });
  });

  it("is scoped to video requests for the Redgifs media host", () => {
    // Narrow on both axes: no other host loses its Referer, and Redgifs images
    // and API calls keep theirs.
    expect(REFERER_RULES[0].condition).toEqual({
      requestDomains: [REDGIFS_MEDIA_HOST],
      resourceTypes: ["media"],
    });
  });

  it("sets no initiator condition", () => {
    // Firefox does not attribute a content script's <video> request to the
    // reddit page, so an initiatorDomains condition never matches there.
    expect(REFERER_RULES[0].condition).not.toHaveProperty("initiatorDomains");
  });

  it("has a positive integer id and priority", () => {
    expect(REFERER_RULES[0].id).toBe(1);
    expect(REFERER_RULES[0].priority).toBe(1);
  });

  it("names the ruleset and its file for the manifest", () => {
    expect(REFERER_RULESET_ID).toBe("referer");
    expect(REFERER_RULES_PATH).toBe("rules/referer.json");
  });
});

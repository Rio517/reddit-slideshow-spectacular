# ADR 0004: Minimize And Stage Host Permissions

Date: 2026-05-29
Status: Accepted

## Context

The extension needs access to old Reddit pages, Reddit listing pages, Reddit-hosted media, and selected external media providers such as Redgifs. Browser extension permissions are visible to users and directly affect trust. Firefox also supports runtime permission requests for optional permissions, which can let an extension ask for external-provider access only when a user needs it.

The tempting shortcut is to request broad host access, such as all websites, so any external media host can be resolved. That would make development easier but would be disproportionate to the product.

## Decision

Use the narrowest practical install-time host permissions and stage the rest.

**Install-time `host_permissions`** are the hosts the extension must fetch from
to function:

- `old.reddit.com`, `www.reddit.com` - the listing page for both frontends (ADR 0008).
- `i.redd.it`, `preview.redd.it`, `external-preview.redd.it` - background-fetch
  Reddit images and previews to compute the perceptual hash for re-upload
  detection, which is on by default (ADR 0006 Layer 2). Display of these images
  needs no permission; this access is only for hashing.
- `api.redgifs.com`, `media.redgifs.com` - Redgifs is played as native video
  (ADR 0016): the background resolves the clip's direct mp4 from the API, and
  fetches the bytes for the `www.reddit` CSP fallback **and** for all Redgifs
  playback on Chrome (the CDN hotlink-protects against a reddit `Referer`; Firefox
  plays direct via `referrerpolicy="no-referrer"` and needs no permission, but
  Chrome ignores that attribute on media elements, so it proxies). Both are
  extension-initiated fetches, so they need the host permission. (The iframe
  fallback, used only when resolution fails, is a page element and needs no host
  permission - just the page's `frame-src`.)
- `i.imgur.com`, `*.streamable.com`, `*.giphy.com` - provider clips played as
  native video; the host permission covers the CSP-fallback byte fetch (ADRs
  0011, 0013, 0014).
- `imgur.com` - the keyless `imgur.com/ajaxalbums` album-member-list endpoint,
  fetched without cookies to expand an Imgur album into one slide per member
  (ADR 0015). Origin-scoped: MV3 host grants are origin-level.

Reddit video (`v.redd.it`) and external image hosts load directly in the page as
`<img>`/`<video>` and need no host permission. No optional host permissions are
used, and no all-URLs or broad host access is requested.

## Consequences

Benefits:

- Higher user trust.
- Cleaner Firefox add-on review story.
- Less privacy risk if the extension has a bug.
- Better alignment with the product's local-first design.

Costs:

- Provider support requires more explicit permission handling.
- Some media may fall back until the user grants a provider permission.
- Testing must cover granted, denied, and revoked permission states.

## Implementation Guidance

- Do not request all-URL host access for v1.
- Keep Reddit host permissions separate from provider host permissions.
- Show a short in-product explanation before requesting optional provider permissions.
- Gracefully handle permission denial by showing an open-original fallback slide.
- Listen for permission removal if optional permissions are used.

## Follow-Up

When submitting to the stores, justify each install-time host in the listing's
permission rationale (see the privacy policy for the same list).

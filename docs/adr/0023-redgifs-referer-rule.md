# ADR 0023: Drop the Redgifs Referer With a Network Rule

Date: 2026-10-12
Status: Accepted (Firefox). Supersedes the "Play (per-browser)" mechanism in
ADR 0016.

## Context

The Redgifs CDN (`media.redgifs.com`) answers 403 to a request that carries a
reddit `Referer`. ADR 0016 dodged that on Firefox by putting
`referrerpolicy="no-referrer"` on the `<video>`, on the understanding that
Firefox reads the attribute there. It does not. `referrerpolicy` is not a
media-element attribute, and measurements on 2026-10-12 show both browsers
ignore it:

| Browser                      | `<video>` with the attribute | `fetch` / `<img>` with the policy |
| ---------------------------- | ---------------------------- | --------------------------------- |
| Firefox 157.0.1 (stock)      | Referer sent                 | no Referer                        |
| Firefox 150.0.2 (Playwright) | Referer sent                 | no Referer                        |

The same result holds for an element a content script creates, attached,
detached, or inside a shadow root.

So on Firefox every Redgifs clip took the long way round: the preloader's
request got 403, the visible player's request got 403, and the slide fell back
to the blob proxy (ADR 0016), which downloads the whole file in the background
and hands it over as base64 before the first frame. A network capture from a
real session on old.reddit.com shows it: `media.redgifs.com/….mp4` → 403 with
`Referer: https://old.reddit.com/`, then a 53 MB `data:` hand-off two seconds
later. Proxied clips are also never preloaded, so every Next waited on a full
download of a 13 to 45 MB file.

## Decision

Remove the header at the network layer. The Firefox build ships one static
declarativeNetRequest rule (`lib/referer-rules.js`, written to
`rules/referer.json` by the `build:publicAssets` hook in `wxt.config.ts`):

- action: `modifyHeaders`, remove the `referer` request header;
- condition: `requestDomains: ["media.redgifs.com"]`, `resourceTypes: ["media"]`.

It needs the `declarativeNetRequestWithHostAccess` permission, which acts only
on hosts the extension already holds (`media.redgifs.com` is one) and adds no
install or update prompt.

The `referrerpolicy` attribute and the code that set it are removed.

No `initiatorDomains` condition. Firefox does not attribute a content script's
`<video>` request to the reddit page, so `initiatorDomains: ["reddit.com"]`
never matched in testing and the request still got 403.

## Evidence

Stock Firefox 157.0.1, throwaway profile, a content script on a reddit.com
page creating a detached `<video preload="auto">` for a real Redgifs clip and
attaching it 2.5 s later (the extension's preload and hand-off):

| Rule                                | 13 MB clip         | 43 MB clip         |
| ----------------------------------- | ------------------ | ------------------ |
| none                                | error (403)        | error (403)        |
| with `initiatorDomains`             | error (403)        | error (403)        |
| shipped rule (`rules/referer.json`) | first frame 0.14 s | first frame 0.10 s |

With the shipped rule the detached element reached `readyState` 4 and buffered
13 to 14 s of video before the hand-off.

## Consequences

- Redgifs clips stream and preload on Firefox on old.reddit.com, like
  v.redd.it video already did.
- www.reddit.com is unchanged: its CSP (`media-src 'self' blob: data:
*.redd.it …`) blocks the direct load before any header matters, so Redgifs,
  Imgur, Streamable, Giphy and Catbox clips still take the blob proxy there.
- Chrome is unchanged: the Chrome build ships neither the permission nor the
  rule, and keeps marking Redgifs slides `proxied`. The same rule removes the
  Referer in Chromium 148 (verified on a local test page), so Chrome can move
  to direct play later by adding the permission and dropping the `proxied`
  flag in `entrypoints/content.js`. Held back so the Chrome listing review
  sees no permission change.
- If the user revokes the `media.redgifs.com` host permission the rule stops
  applying and the slide falls back to the blob proxy, as before.
- Redgifs no longer learns that a clip was opened from Reddit.

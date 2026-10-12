# ADR 0016: Redgifs As Native Video

Date: 2026-06-02
Status: Accepted

## Context

Redgifs is the single most common media domain on real NSFW feeds, so it is a
first-class provider. Reddit surfaces a Redgifs post as a watch/iframe link
(`redgifs.com/watch/<id>`, `redgifs.com/ifr/<id>`) with no directly-playable
media URL. An iframe embed plays, but it can't be timed (no `duration`, no
`ended` event) or unmuted (cross-origin), so it doesn't integrate with the
slideshow's dwell, mute, or dedup.

Redgifs publishes the direct mp4 (plus `duration` and `hasAudio`) from a keyless
public API (`api.redgifs.com`, anonymous temporary token). The mp4 is served from
`media.redgifs.com`, whose CDN **403s a request carrying a reddit `Referer`**
(hotlink protection).

This is the first native-video provider; Imgur `.gifv` (ADR 0011), Catbox
(ADR 0012), Streamable (ADR 0013), and Giphy (ADR 0014) follow the pattern
established here.

## Decision

Resolve each Redgifs embed to a native `<video>` slide **lazily**, as the
slideshow approaches it - the queue page is delivered with iframe embeds and each
is upgraded on demand. This keeps the first page from blocking on Redgifs API
calls; a clip not yet resolved when reached simply shows as its iframe embed
until (or unless) its resolve lands.

- **Resolve (`lib/redgifs.js`).** A background resolver parses the id, fetches an
  anonymous token from `api.redgifs.com` (cached, refreshed once on a 401), and
  reads the direct mp4 URL + `duration` + `hasAudio`. The returned host is
  re-validated to be exactly `media.redgifs.com` before it is trusted.
- **Lazy upgrade (`lib/session.js`).** The session resolves the embeds in its
  preload window (`slideshow.resolveRedgifs { id }` to the background) and
  upgrades each slide in place to native video before it is shown; the on-screen
  slide is re-rendered if it upgrades while current. Each embed is resolved at
  most once per run. (Streamable and Imgur albums still resolve eagerly in the
  page build - their `resolveNativeSlides` batch is concurrency-limited and timed
  out via `lib/async-pool.js`.)
- **Play (per-browser).** Firefox plays the clip directly as a native `<video>`
  whose `src` is the `media.redgifs.com` mp4. The CDN 403s a reddit `Referer`,
  and a `<video>` cannot drop it (`referrerpolicy` is a no-op on media elements
  in both browsers), so the Firefox build removes the header with a
  declarativeNetRequest rule - see **ADR 0023**, which replaces the attribute
  this ADR first relied on. The Chrome build ships no such rule, so it marks
  every Redgifs slide `proxied` and plays it through the blob proxy below. This
  is the **only** host that needs the no-referrer treatment.
- **Blob proxy.** A `proxied` slide is fetched by the background (no `Referer`,
  no cookies, byte-capped) and the content script plays the bytes as a `blob:`
  URL. This serves the entire Chrome path **and** the `www.reddit` CSP fallback:
  on a page whose CSP blocks cross-origin media (`media-src 'self' blob:
*.redd.it`) the Firefox direct load fails and the slide falls back to the same
  blob proxy the CSP allows. `media.redgifs.com` is on `PROXY_MEDIA_HOSTS` for
  that host-gated fetch.
- **Iframe embed as the resolution-failure fallback.** If the API resolve fails
  entirely (down, timeout, malformed), the slide keeps the original Redgifs
  `/ifr/<id>` iframe embed, sandboxed (`allow-scripts allow-presentation`, no
  `allow-same-origin`).

Host permissions (ADR 0004): `api.redgifs.com` for the resolve and
`media.redgifs.com` for the proxy byte fetch (all Chrome playback plus the
`www.reddit` CSP fallback). Direct `<video>` playback on Firefox is a page
subresource and needs no permission.

## Consequences

Benefits:

- Redgifs clips play as correctly-timed, native video that participates in dwell,
  mute, and the dedup pipeline - not an opaque iframe.
- On Firefox, direct playback streams the mp4 (no whole-file blob) outside the
  `www.reddit` CSP case; Chrome and the CSP fallback play a fully-buffered blob.

Costs / limits:

- Two Redgifs host permissions (`api.` + `media.`). Justified in the store
  listing's permission rationale.
- The Firefox direct path depends on the Referer rule (ADR 0023). The rule is
  scoped to video requests for the Redgifs media host so it can't silently
  change other providers' behavior. Chrome has no rule, which is why Chrome
  proxies instead.
- True audio is deferred: v1 plays the clip muted like all video.

## Implementation Guidance

- Re-validate the API-returned mp4 host (`media.redgifs.com`) before trusting it;
  fall back to the iframe embed on any resolve failure rather than a broken slide.
- Keep the Referer rule scoped to the Redgifs media host; only the Firefox
  build needs it (Chrome proxies instead).
- Cache the anonymous token and refresh it once on a 401; the background holds no
  other Redgifs state (so a suspended Chrome service worker just re-fetches it).

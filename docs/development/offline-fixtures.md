# Offline Fixtures

Offline fixtures let us test Reddit parsing without depending on live Reddit
pages, network availability, account state, or rate limits.

## Fixture Rules

- Commit only sanitized fixtures.
- Remove usernames, account-specific data, cookies, tokens, and tracking parameters.
- Keep fixtures small enough to understand in review.
- Prefer one focused fixture per behavior.
- Keep post IDs fake unless an exact ID is needed to reproduce a bug.
- Capture from real responses when shape fidelity matters: galleries,
  `media_metadata`, crossposts, videos, and Redgifs links.
- Hand-authored fixtures are fine for simple cases.

## Fixture Types

- `tests/fixtures/old-reddit/*.html`: old Reddit-like page structure for content
  and context tests.
- `tests/fixtures/reddit-json/*.json`: Reddit listing JSON shapes for queue and
  resolver tests.

JSON fixtures should model the `raw_json=1` form, where URLs are not
HTML-entity-encoded.

## Refresh Workflow

1. Save the smallest useful HTML or JSON sample.
2. Remove personal/account-specific data.
3. Replace real titles with harmless representative titles unless title text
   matters.
4. Keep media URL shapes realistic.
5. Add or update a focused test that explains why the fixture exists.

Do not use live Reddit as the normal unit-test path.

## Current Fixture Coverage

- `subreddit-page.html`: minimal old Reddit listing HTML with direct image and
  gallery-shaped posts.
- `subreddit-direct-images.json`: Reddit listing JSON with one original
  `i.redd.it` image and one preview-only image fallback.
- `gallery.json`: gallery post with `gallery_data` ordering, `media_metadata`
  sources, and a deleted item to exercise skip-without-gap.
- `reddit-video.json`: two `v.redd.it` posts - one with audio, one `is_gif`
  silent loop - covering `fallback_url`/`dash_url`/`hls_url`/`has_audio`.
- `redgifs.json`: Redgifs post with `secure_media.oembed` aspect ratio.
- `crosspost.json`: outer post whose media lives in `crosspost_parent_list[0]`.
- `imgur-gifv.json`: Imgur `.gifv` post played as a looping native video.
- `imgur-album.json`: Imgur album post expanded via the keyless `ajaxalbums`
  endpoint.
- `streamable.json`: Streamable post resolved to its mp4 via the public API.
- `giphy.json`: Giphy watch-page post played as a looping native video.
- `catbox-video.json`: Catbox direct video file played in the page.

These JSON fixtures are sanitized and hand-authored from shapes captured from a
logged-in session; the resolver is also exercised against unsanitized real
captures during development, but those are never committed.

## Spike Findings

- WXT/Vitest fixtures should be loaded with Vite-native imports in unit tests.
  Under the WXT test plugin, `import.meta.url` is browser-shaped, so
  Node-style `fileURLToPath(import.meta.url)` fixture loading is a poor fit.
- Direct `i.redd.it` image URLs are treated as original-quality candidates.
- Direct-image posts can use either `url_overridden_by_dest` or `url`; resolver
  tests cover both fields.
- `preview.redd.it` image URLs are retained as explicit preview-quality
  fallbacks so the slideshow can still show something when no original URL is
  present.
- Queue tests count posts scanned separately from slides produced, so sparse
  pages can still drive pagination.

## Commands

Run build before `webext:lint`; do not parallelize those two commands because
WXT rebuilds `.output/firefox-mv3/` and `web-ext` can race the output directory.

```sh
npm run typecheck
npm run lint
npm run format
npm test
npm run build
npm run webext:lint
```

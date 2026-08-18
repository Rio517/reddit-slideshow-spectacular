# Reddit Slideshow Spectacular! - Documentation

This directory holds planning material for a Firefox-first browser extension that turns the current old Reddit feed into a keyboard-driven media slideshow.

## Documents

- [Product spec draft](product/reddit-slideshow-product-spec.md): product goals, scope, user experience, open questions, and acceptance criteria.
- [Store listings](store-listing/en.md): the store copy in all six locales (`store-listing/<lang>.md`) - the marketing text and each version's what's-new / release notes, pasted into the Chrome Web Store and Firefox Add-ons at submission.
- [Research notes](research/initial-research.md): source-backed notes on Firefox extensions, old Reddit behavior, Reddit listing pagination, RES, and external media providers.
- [Extension development best practices](research/extension-development-best-practices.md): architecture, security, permissions, testing, Reddit access, and release guidance.
- [Prior art and tool options](research/prior-art-and-tool-options.md): existing slideshow/gallery tools, reuse candidates, and gaps.
- [New Reddit support](research/new-reddit-support.md): supporting `www.reddit.com` (shreddit) - data, CSP, and the start cursor.
- [Chrome support](research/chrome-support.md): building a Chrome MV3 target from the same source.
- [JavaScript type management](research/javascript-type-management.md): how we type this plain-JS/JSDoc codebase - Reddit listing typedefs, `tsconfig` strictness progression, the `requiredElement` helper, and conventions for keeping `any` out.
- [Proxy streaming (MediaSource)](research/proxy-streaming-mediasource.md): why streaming the blob-proxy path is parked - MediaSource needs fragmented mp4 (the clips are progressive), so it would need an in-browser remuxer for a narrow Chrome-only win.
- [ADR 0001](adr/0001-standalone-firefox-webextension.md): build as a standalone Firefox WebExtension first.
- [ADR 0002](adr/0002-provider-based-media-resolution.md): resolve media through provider adapters.
- [ADR 0003](adr/0003-paginate-current-reddit-listing.md): keep the slideshow queue going through Reddit listing pagination.
- [ADR 0004](adr/0004-minimize-and-stage-host-permissions.md): minimize install-time permissions and stage external-provider permissions.
- [ADR 0005](adr/0005-manifest-v3-event-page-and-wxt-build.md): adopt Manifest V3 (event page) and a WXT-based build.
- [ADR 0006](adr/0006-duplicate-detection.md): detect and skip duplicate media in the slideshow queue.
- [ADR 0007](adr/0007-bound-the-in-memory-slide-queue.md): bound the in-memory slide queue with back-history eviction.
- [ADR 0008](adr/0008-support-new-reddit.md): support new Reddit (www.reddit.com) with a self-contained data path.
- [ADR 0009](adr/0009-build-for-chrome.md): build a Chrome MV3 target from the same source.
- [ADR 0010](adr/0010-pan-and-zoom-images.md): Ken Burns pan & zoom for image slides (resolution-aware zoom; dwell = sum of phases).
- [ADR 0011](adr/0011-imgur-gifv-native-video.md): play Imgur `.gifv` as a looping native video (direct, blob proxy as the CSP fallback).
- [ADR 0012](adr/0012-catbox-direct-video.md): play Catbox direct files as native video.
- [ADR 0013](adr/0013-streamable-native-video.md): resolve Streamable to native video via its API, with an iframe fallback.
- [ADR 0014](adr/0014-giphy-native-video.md): play Giphy watch pages as a looping native video (direct, blob proxy as the CSP fallback).
- [ADR 0015](adr/0015-imgur-albums.md): expand Imgur albums 1→N via the keyless `ajaxalbums` endpoint (`.mp4` members play as direct video).
- [ADR 0016](adr/0016-redgifs-native-video.md): play Redgifs as native video — API resolve, lazy on-approach upgrade, direct on Firefox (`referrerpolicy=no-referrer`); proxied on Chrome; iframe fallback on resolve failure.
- [ADR 0017](adr/0017-download-current-media.md): download the current media via the background `downloads` API.
- [ADR 0018](adr/0018-reddit-video-audio.md): play v.redd.it audio from a companion `<audio>` synced to the silent fallback video.
- [ADR 0019](adr/0019-post-voting.md): upvote/downvote the current post with the ↑/↓ keys through the logged-in session.
- [Foundation plan](superpowers/plans/2026-05-29-foundation-wxt-mv3.md): task-by-task plan for the WXT/MV3 scaffold, shared core, and offline fixtures.

## Status

These are living planning docs capturing current research and decisions. v1 of the extension is built and feature-complete.

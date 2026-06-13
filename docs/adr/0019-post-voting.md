# ADR 0019: Up/down-key post voting

Date: 2026-06-02
Status: Accepted (resolution + wiring implemented; live vote needs a real-session check)

## Context

A lean-back slideshow viewer wants to react to a post without leaving the show.
Reddit voting is a cookie-authenticated write to `/api/vote` that also requires
the session's CSRF token (`modhash`). The extension already reuses the user's
logged-in session for listing fetches, so it can vote as the user too. The slide
already carries the post fullname (`postId`, e.g. `t3_abc`) and, from the
listing, the current vote (`likes`: true/false/null).

## Decision

Bind the **↑/↓ keys** to upvote/downvote the current post (keys only - no
persistent buttons), with a brief on-screen flash for feedback.

- **Vote (`lib/reddit-write.js`).** `createRedditWriter` POSTs `id`/`dir`/`uh` to
  `old.reddit.com/api/vote` with `credentials: "include"`. The `modhash` comes
  from `/api/me.json`, cached and refreshed once on a 403. `old.reddit.com` is
  used for both regardless of the user's frontend, since the session cookie is
  shared across reddit subdomains and the background has its host permission.
- **Route (`lib/background-router.js`).** `slideshow.vote { id, dir }` is
  content-script-only and validates the id is a post fullname (`t3_…`) and the
  direction is up/clear/down before the privileged write.
- **Toggle (`lib/session.js`).** ↑/↓ vote the current post, seeding from the
  post's `likes` and toggling like Reddit (the same direction again clears the
  vote). The UI is optimistic: it flashes the new state immediately and reverts
  only if the write fails (e.g. not logged in), flashing an error then.

No new permission: the existing `old.reddit.com`/`www.reddit.com` host
permissions already cover the authenticated `me.json`/`vote` requests.

## Consequences

Benefits:

- Vote without leaving the slideshow, reusing the session - no API keys, no
  OAuth, no new permission.
- The privileged write stays content-script-only, validates the fullname +
  direction, and fails closed.

Costs / risks:

- It writes to the user's Reddit account; it's only ever triggered by their key
  press, toggles, and reverts on failure.
- The `modhash` + `/api/vote` flow only works against **live, logged-in Reddit**,
  so the actual vote, the 403-refresh, and the not-logged-in path **need a real
  logged-in browser to verify** - the offline gate covers the voter logic, the
  router validation, and the session toggle, but not a real cast vote.

## Implementation Guidance

- Keep voting content-script-only and fullname/direction-validated at the router.
- Cache the modhash and refresh once on a 403; hold no other Reddit state.
- Keep the UI optimistic-with-revert so a failed write doesn't leave a wrong
  local vote state.

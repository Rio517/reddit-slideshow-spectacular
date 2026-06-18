# ADR 0007: Bound the in-memory slide queue

Date: 2026-05-30
Status: Accepted

## Context

The slideshow keeps every slide it has built in `SlideshowController.slides` so
the user can navigate backward. Pagination appends a new page each time the
queue nears its end, so over a long session this array grows without bound -
hundreds of `Slide` objects, each holding several URL strings, a title, and
dimensions, retained for the lifetime of the tab. A self-audit flagged this as
the main source of session-long memory growth.

Back-navigation is a real feature (left arrow), and viewers do rewind deep into
a long session, so the history cannot be kept tight. Each `Slide` is light
metadata (~1-2 KB), so a generous window costs only a few MB - the bound exists
to stop _unbounded_ growth over a marathon session, not to keep the window
small.

## Decision

Cap the retained **already-shown** history at `maxBackHistory` slides (default
**2000**) behind the current slide. On each render, evict the excess from the
front of `slides` and advance an `evicted` counter by the same amount.

- `index` and `evicted` move together, so **absolute position is unchanged** -
  the position counter still reads the true `N / total`.
- Pagination (`shouldFetchNextPage`, `peekNext`) operates on the retained window
  using the local `index`/`length`, which are consistent after eviction, so the
  fetch-ahead logic is unaffected.
- Look-ahead slides are never evicted; their count is naturally bounded by the
  prefetch trigger (a page is only fetched when within ~2 unread slides of the
  end), so total retention is roughly `maxBackHistory + one page`.

The duplicate-detection state (ADR 0006) is bounded separately. Its `keys` and
`hashes` are capped to the most recent **50,000** media (FIFO), independent of
the much smaller back-history window - dedup must span the whole session, not
just what is navigable. Beyond the cap the oldest entries are dropped, so a
repost seen tens of thousands of slides ago may re-appear; that is acceptable
for a lean-back tool, and it keeps memory (~5 MB worst case) and the Layer-2
Hamming scan bounded.

## Consequences

- Memory is bounded regardless of session length.
- Back-navigation reaches ~2000 slides back; only past that, in a marathon
  session, does the very start become unreachable. Going back to an evicted
  slide would require re-fetching and re-deriving it anyway, so this is an
  acceptable trade-off for a lean-back tool.
- `position` reports absolute index/total via the `evicted` offset, so eviction
  is invisible in the UI.

## Alternatives Considered

- **Unbounded retention (status quo):** simplest, but leaks memory on long
  sessions. Rejected.
- **Tombstones (replace evicted slides with light placeholders):** keeps the
  array length stable for absolute indexing without an `evicted` counter, but is
  more complex and the counter approach is simpler. Deferred.
- **Persist the queue to storage:** unnecessary for a session-scoped tool and
  adds storage/privacy surface. Rejected.

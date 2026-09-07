# Catalogue scale, performance and design

## Scope for this iteration

1. Add 20 insert-only fictional listings with stable IDs, varied prices, bedrooms and locations. Reuse the existing six concept photographs and three still-image videos, explicitly labelled shared illustration assets; do not imply twenty new photographed homes. Preserve all current listings.
2. Implement public catalogue HTTP validators. Revalidate against the database on each request so unpublishing is visible immediately; return a bodyless 304 when unchanged. Do not cache authenticated endpoints or errors.
3. Cache decoded geography per county, precompute bounding boxes, and group properties in one pass. Preserve polygon-hole semantics and source geometry. Measure baseline and post-change behaviour, without claiming reduced bundle transfer where none occurred.
4. Add shared architectural-line backgrounds and restrained hover/entry treatments. Avoid blocking videos, global blur, scroll handlers and continuous animation. Preserve light/dark contrast and reduced-motion behaviour.

## Cache decision

Recommended now: HTTP ETag revalidation plus bounded, static geography memoization. No new production dependency. Public responses remain private/no-cache (browser may store but must validate), with errors no-store. This saves repeat response transfer, not database queries.

Alternative later: Redis cache-aside for expensive, shared computation across API instances. Before adoption, measure database latency and repeated-query load; specify key versioning, bounded TTL, invalidation on every write path, outage fallback, stampede suppression and cache hit metrics. Never use stale catalogue data to authorize publication or access to draft media. Redis is not installed in this iteration.

## Follow-up delivery order

- Split national geometry into on-demand county assets to reduce the large map downloads. Requires an asynchronous geography contract across the map, location filter and discovery pages; current synchronous consumers must migrate together.
- Add thumbnail derivatives and responsive image selection before expanding image resolutions.
- Add lease ownership and crash recovery to video processing, then progress events and poster/contact-sheet extraction.
- Add saved-search sorting and reusable client filters backed by existing account APIs.

## Validation

Compare production-build browser navigation metrics and resource sizes, not development-server timings. Record actual numbers and limitations. Validate ETag matching, changed payloads, errors, conditional HEAD behaviour and bounding-box filtering with tests. Confirm an import replay inserts zero records, public API count increases by exactly twenty, and mobile layouts do not overflow.

## Delivered and measured — 7 September 2026

- Local API now returns 49 listings, including exactly 20 new `d5000000` demo entries. Expansion import created 20 listings and 60 media associations; replay dry-run created zero. These reuse existing concept assets, not 60 new media files.
- Live conditional GET returned 304 and downloaded zero bytes versus a 38,840-byte catalogue body. The database still runs on every request; this is bandwidth revalidation, not a query cache.
- Geography tests prove zero polygon decoding at module import, per-county decoding on demand and reuse for subsequent calls. Map grouping classifies each property once rather than once per administrative area.
- Full frontend suite: 236 tests passed. `npm run lint` passed with three existing Fast Refresh export warnings in GooglePropertyMap. Typecheck/production build passed, with large geography chunk warnings. `go test ./...`, `go vet ./...`, and `git diff --check` passed.
- Production browser smoke check: catalogue count 49; inspected hero at 1440×900 and 390×844, mobile document width 390. Added a static, low-contrast architectural grid to the owning hero surface; retained existing reduced-motion-aware entry effects. This is a focused hero pass, not a site-wide redesign.
- Local navigation samples showed baseline load 132 ms / FCP 480 ms and post-change load 29 ms / FCP 352 ms. These are single unthrottled runs with different catalogue size and responsive resource loading, **not comparable evidence of a speedup**. Repeat controlled cold-cache desktop/mobile measurements before claiming a percentage improvement.
- The national map bundles remain roughly 798 KB and 957 KB compressed. Lazy decoding reduces work, not their transfer size. County asset splitting and responsive thumbnails remain the next loading priorities.

Preview for this iteration: `http://127.0.0.1:5193/`, isolated API port 8088. Existing development processes were left running unchanged.

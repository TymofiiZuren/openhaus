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

## County-detail delivery follow-up

The administrative geometry now ships as 26 independent, lossless county chunks. The All Ireland map does not request any of them. Selecting Dublin requests Dublin only. The separate national **county outlines** remain in the map bundle and are not optimized by this change.

Regenerate locally with `cd apps/web && node scripts/split-administrative-areas.mjs`. The existing upstream boundary-download script also invokes this step. Edit the generator/source dataset, never the derived files in `src/data/areas/`. A test compares the complete derived set with all 166 original areas, including every encoded ring.

Contract: await `loadAreasForCounty(county)` before synchronous `areasForCounty` or `areaForCoordinate` calls for that county. The catalogue owns loading/retry state, ignores late responses after selection changes, and retains deep-link area parameters until validation can complete. The map remains mounted while hidden during a switch to preserve selected-home state. Concurrent requests share one promise; failed requests are removed from the in-flight cache. Only known county filenames can load. No persistent cache or Redis dependency was added.

Measured production output: administrative module 956.60 KB → 1.57 KB gzip; Dublin chunk 28.29 KB gzip. Browser resource entries on the new preview showed 1,867 bytes for the module (including HTTP overhead), zero county-detail requests in All Ireland, then 28,588 bytes for Dublin after selection. This removes roughly 955 KB from the initial map-detail transfer, not 955 KB from every page load. No timing percentage is claimed.

Browser checks: actual All Ireland → Dublin selection; Pembroke deep link at 390×844 with document width 390. Retry, stale completion, import coalescing, failed-promise eviction, coordinate classification and geometry equality are covered by tests. Earlier selected-home regression was caught and corrected before completion. A first browser probe used an incorrect accessible-label selector and timed out; the subsequent observed text selector completed the interaction.

Updated preview: `http://127.0.0.1:5194/`, using the existing isolated API on 8088. Prior previews and development processes were not stopped.

Final checks: `npm test` passed 240 tests; `npm run lint` passed with the three existing Fast Refresh warnings; `npm run build` passed with the remaining national-outline chunk warning; `git diff --check` passed. Primary download-reduction and county navigation signals are met. Whole-site latency and every device/theme combination were not benchmarked. Checkpoint `a18f254` contains the preceding accumulated work; this follow-up is left uncommitted for review.

The county-detail follow-up was subsequently committed as `a9369a4`. The next iteration implements exact shared-arc county geometry: see [boundary topology](BOUNDARY_TOPOLOGY.md) for the algorithm, regeneration, measured bandwidth saving and decoding tradeoff. Its preview is on port 5195.

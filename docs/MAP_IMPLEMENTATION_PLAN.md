# OpenHaus map implementation plan

## Outcome

Build one continuous property-search map with this navigation model:

```text
Ireland
  → county
    → local electoral area or urban area
      → street-level viewport
        → property preview
```

The map is not a decorative visualization. It is a search surface whose URL,
API query, visible markers, results list, and browser history always describe
the same geographic selection.

## Product behaviour

### Ireland view

- Show a real basemap with an authoritative county boundary layer.
- Show aggregate property counts on counties, not individual homes.
- Hover or keyboard focus identifies a county and its count.
- Selecting a county updates the URL, for example `/map/cork`, and smoothly
  fits the same map to the authoritative county geometry.

### County view

- Keep only the selected county boundary active; visually mask neighbouring
  counties without hiding roads and labels inside the selected county.
- Constrain panning to a padded county bounding box.
- Show named Local Electoral Areas (LEAs) at the first subdivision level.
- At a closer zoom, replace LEAs with Electoral Divisions (EDs) or official
  urban areas. Do not invent neighbourhood polygons from labels.
- Selecting an area updates the URL, for example `/map/dublin/pembroke`, and
  filters both markers and the results list.

### Street view

- Show price markers or clusters depending on zoom and density.
- Clicking a marker opens a property preview without navigating away.
- `View property` navigates to the canonical listing URL.
- Moving or zooming debounces a new viewport request, cancels the obsolete
  request, and preserves the last good results during loading.
- Back and forward restore county, area, viewport, filters, and selection.

## Geographic data

The production target is versioned source data ingested into PostGIS and served
at zoom-appropriate detail. The current buyer-facing slice uses generated,
attributed browser assets for all 26 counties and the 2019 LEAs; those snapshots
are display-only and are not authoritative property assignments.

Recommended hierarchy:

1. County boundaries for the national selection layer.
2. Local Electoral Areas for understandable county subdivisions.
3. Electoral Divisions for detailed filtering.
4. CSO Urban Areas for city and settlement-oriented labels where they are more
   useful to buyers than administrative names.

Tailte Éireann publishes official boundary datasets through Ireland's open-data
catalogue. The 2026 Electoral Division dataset contains 3,455 divisions and is
available as GeoJSON, but its catalogue entry currently says that no licence is
specified. Licensing must therefore be confirmed before importing it. Start
with a generalized dataset, not the ungeneralized national geometry, to keep
payloads and rendering costs controlled.

Sources to evaluate and record in `docs/data-sources.md` before ingestion:

- [Tailte Éireann Electoral Divisions 2026](https://data.gov.ie/dataset/electoral-divisions-national-statutory-boundaries-ungeneralised-20261/resource/b5aed9ab-6646-41b8-a1f0-63db903f6d6c)
- [Irish GeoJSON boundary catalogue](https://data.gov.ie/dataset?q=cso&res_format=GEOJSON)
- [Google Maps JavaScript API documentation](https://developers.google.com/maps/documentation/javascript)

Each imported source needs: source URL, publisher, licence, source version,
download checksum, import date, coordinate reference system, and simplification
tolerance.

## Storage model

Add a migration only after the dataset and licence gate is complete:

```sql
geographic_areas
  id uuid primary key
  parent_id uuid null references geographic_areas(id)
  level text check (level in ('country', 'county', 'lea', 'ed', 'urban_area'))
  name text
  slug text
  source_id text
  source_version text
  boundary geometry(MultiPolygon, 4326)
  label_point geometry(Point, 4326)
  bounds geometry(Polygon, 4326)
```

Required indexes:

- unique `(parent_id, level, slug)`;
- GiST on `boundary`;
- GiST on the existing property location;
- ordinary index on `(level, parent_id)`.

Assign a property's county and detailed area using `ST_Covers` when it is
published. Keep the original point as the source of truth so assignments can be
recomputed when boundary versions change.

## Backend contracts

Keep geographic concerns in the API rather than duplicating them in React.

```text
GET /api/v1/geographic-areas?level=county
GET /api/v1/geographic-areas?parent=cork&level=lea
GET /api/v1/geographic-areas/{slug}
GET /api/v1/properties?area={slug}&bbox={w,s,e,n}
GET /api/v1/property-clusters?area={slug}&bbox={w,s,e,n}&zoom={z}
```

Boundary responses should be GeoJSON with simplified geometry appropriate to
the requested zoom. Return `ETag` and cache headers because boundaries change
rarely. Property and cluster responses must contain stable IDs and counts.

For the proof of concept, cluster in PostGIS using a zoom-dependent grid. Do
not send every property to the browser and cluster the complete catalogue in
JavaScript.

## Basemap decision

Keep the provider behind `GooglePropertyMap`; geographic selection, URL state,
search, and the results list belong to React and must not depend on provider
objects. The renderer uses the Google Maps JavaScript API with the standard
road data, constrained Irish bounds, custom OpenHaus cartography, custom price
markers, map/satellite switching, and custom pan/zoom/reframe controls. Google
default controls and points-of-interest are suppressed so the interaction
hierarchy belongs to the product rather than the provider.

The browser key is supplied through `VITE_GOOGLE_MAPS_API_KEY`. It must be
restricted to the Maps JavaScript API and approved HTTP referrers. Google Maps
requires a billing-enabled project, so production needs budget alerts and a
documented usage ceiling. A missing or failed provider must leave county/town
search and every listing usable; the application must never replace the map
with invented streets or boundaries.

## Frontend architecture

Use one `PropertyMap` owner with small closed responsibilities:

```text
PropertyMap
├── MapViewport          owns map lifecycle and viewport events
├── BoundaryLayer       renders API-provided GeoJSON
├── PropertyLayer       renders clusters and price markers
├── AreaNavigator       county/area breadcrumb and counts
├── ResultsPanel        mirrors the current geographic query
└── PropertyPreview     selected marker summary
```

`PropertyMap` owns the state machine:

```text
country → county → area
              ↘ viewport changed
any state → loading → success | empty | recoverable error
```

The URL is the durable state. React state may mirror it but must not become a
second source of truth. Map movement changes only viewport parameters; county
or area changes happen only through an explicit selection.

## Delivery sequence

### Phase 0 — data spike

- Confirm licences and choose county, LEA, ED, and urban-area datasets.
- Import Cork and Dublin only into a disposable PostGIS database.
- Measure geometry size and query time at two simplification levels.
- Exit criterion: documented source provenance and a spatial query under
  100 ms locally for the sample data.

Status: **in progress**. The first licensed administrative-area candidate was
measured and rejected because Cork contains invalid geometry and the seeded
Cork property resolves to overlapping city/county features. Results and source
provenance are recorded in [`data-sources.md`](data-sources.md). The performance
criterion passed; the topology and hierarchy criteria did not.

### Phase 1 — geographic API

- Add the area schema and repeatable Go import command.
- Add county and child-area endpoints with contract tests.
- Add area and bbox filtering to the property query.
- Exit criterion: API tests prove Cork cannot return a Dublin property and
  invalid parent/child combinations return `400`.

### Phase 2 — one county vertical slice

- Add the renderer and provider adapter.
- Implement Ireland → Cork → Cork LEA navigation on one continuous map.
- Synchronize URL, map, markers, and result list.
- Exit criterion: reload and browser back/forward reproduce the same view.

Status: **buyer-facing MVP slice implemented, authoritative persistence
hierarchy pending**. The national view renders all 26 county boundaries but
deliberately hides property markers. Selecting a published county fits its
rendered geometry, replaces the national layer with that county's LEAs, and
reveals only its homes. Search remains independent of the map, county and area
query parameters are synchronized with browser history, and list items and
markers open the same persistent property preview. County and LEA geometries are
attributed, losslessly encoded client-side visual snapshots generated from
Tailte Éireann's 2019 services. They are not written to PostGIS or treated as
the authoritative assignment model.

### Phase 3 — national coverage

- Import all licensed areas.
- Add server-side clusters, empty areas, and generalized geometries.
- Validate every county has a boundary, parent relationship, label point, and
  stable slug.
- Exit criterion: an automated data-integrity test passes for every county.

### Phase 4 — production hardening

- Loading, empty, offline, tile-failure, and partial-API-error states.
- Keyboard access for area selection and property previews.
- Mobile drawer instead of permanent desktop results panel.
- Performance budgets for initial JavaScript, boundary payload, marker count,
  and viewport query latency.
- Replace the development tile service if real usage exceeds its policy or
  reliability limits.

## Verification

Highest-value automated tests:

- selecting a county changes URL and requests only its child areas;
- selecting an area filters the list and markers with the same query;
- a stale viewport request is aborted and cannot overwrite newer results;
- back/forward restores the prior geographic state;
- exact-boundary properties are assigned consistently with `ST_Covers`;
- geometry responses contain valid WGS84 MultiPolygons;
- clusters split as zoom increases without losing property counts;
- keyboard users can select every visible geographic level;
- tile or boundary failure leaves the property list usable.

Manual acceptance must cover Cork and Dublin on desktop and mobile, including
pan, wheel/pinch zoom, county selection, detailed-area selection, marker
preview, reload, back/forward, slow network, and unavailable tiles.

## Explicit non-goals for the first release

- Traffic, routing, or travel-time polygons. A map/satellite display switch is
  already available through the configured Google Maps renderer.
- Address geocoding through a paid or rate-limited third-party API.
- Downloading maps for offline use.
- AI-generated neighbourhood boundaries or property recommendations.
- A manager boundary editor.

# Geographic data sources

This register is the provenance and acceptance gate for every geographic file
that may be imported into OpenHaus. A catalogue listing is not sufficient by
itself: its licence, coordinate reference system, topology, nesting, and update
policy must all be verified.

## Spike: Administrative Areas 2015

| Field | Value |
| --- | --- |
| Publisher | Tailte Éireann |
| Dataset | Administrative Areas Generalised 100m — National Statutory Boundaries — 2015 |
| Catalogue | https://data.gov.ie/en_GB/dataset/administrative-areas-generalised-100m-national-statutory-boundaries-20151 |
| Licence | Creative Commons Attribution 4.0 |
| Source format | GeoJSON |
| Source CRS | Irish Transverse Mercator, EPSG:2157 |
| Generalisation | 100 metres |
| Downloaded for spike | 2026-08-25 |
| SHA-256 | `068df77b0676f654fcf2843a05ca17bf79b06a542d787ee3ff398c1b0ff3d6ad` |
| Compressed/persisted in repository | Visual MVP subset only: Dublin and Cork council geometries |
| Decision | Rejected as the production hierarchy; accepted only for attributed client-side orientation |

### Measured results

- Download size: 1,112,567 bytes.
- Feature count: 31 administrative council areas.
- Cork is represented by two features: Cork City Council and Cork County
  Council. Dublin is represented by four council areas.
- All tested Dublin geometries were valid after transformation to WGS84.
- At least one Cork geometry was invalid because of a ring self-intersection.
- The seeded Cork property matched both Cork City Council and Cork County
  Council. The dataset therefore cannot be treated as a non-overlapping
  parent hierarchy without explicit normalization and precedence rules.
- A GiST-indexed viewport intersection over the 31 transformed features took
  approximately 1.3 ms locally. This confirms PostGIS query cost is not the
  limiting concern at this scale; topology and semantics are.
- The spike ran in temporary tables inside a transaction and ended with
  `ROLLBACK`; no geographic tables or source data were added to the database.

### Consequence

Do not create the permanent `geographic_areas` migration from this source.
First choose a licensed county dataset whose areas have the intended nesting
semantics, then independently choose LEA/ED datasets. The importer must reject
invalid geometry by default; `ST_MakeValid` may be an explicit normalization
step only when the resulting geometry type, area change, and source record are
audited.

The web MVP may draw the transformed Dublin and Cork council geometries for
orientation. That visual layer is deliberately limited to counties with current
demo listings, is not persisted, and must not be used as an authoritative
property-to-area assignment. Where the historical Cork council polygons overlap,
the UI's display-only lookup prefers Cork City before Cork County.

## Candidate: CSO Local Electoral Areas 2022, generalized 100m

| Field | Value |
| --- | --- |
| Publisher | Tailte Éireann |
| Dataset | CSO Local Electoral Areas — National Statistical Boundaries — 2022 — Generalised 100m |
| Catalogue | https://data.gov.ie/dataset/cso-local-electoral-areas-national-statistical-boundaries-2022-generalised-100m |
| Geometry role | County subdivision |
| Status | Licence metadata is inconsistent across catalogue resources; blocked pending confirmation |

Some catalogue records describe this dataset as CC BY 4.0 while the current
GeoJSON resource says no licence is provided. OpenHaus must not infer that a
licence on one resource automatically applies to another resource. Confirm the
licence with the publisher or use a resource whose licence is explicit.

## Candidate: Local Electoral Areas 2015, generalized 100m

| Field | Value |
| --- | --- |
| Publisher | Tailte Éireann |
| Catalogue | https://data.gov.ie/dataset/local-electoral-areas-boundaries-generalised-100m-national-administrative-boundaries-20151 |
| Licence | Creative Commons Attribution 4.0 |
| Geometry role | Disposable LEA hierarchy spike only; boundaries are outdated |
| Status | Catalogue accepted; automated GeoJSON download currently unavailable |

The catalogue and historical CKAN record identify the dataset as CC BY 4.0 and
the ArcGIS item as `f4d99d2df9b74b739b0168616c7e0bc2_0`. Two focused download
attempts returned HTTP 403 and HTTP 500. Do not add retry loops or a brittle
scraper. Re-evaluate through the publisher's current download link or choose a
newer explicitly licensed resource.

## Acceptance checklist for the next candidate

- Licence permits redistribution and transformed derivatives.
- Source version and stable feature identifier are present.
- CRS is declared and transforms to EPSG:4326 without coordinate loss.
- Every geometry is valid or has a documented normalization result.
- Areas intended as siblings do not overlap beyond a defined tolerance.
- Every child has exactly one intended parent.
- Cork and Dublin seeded properties each resolve to exactly one area per level.
- Generalized geometry is small enough for the intended zoom-level response.
- A checksum and import report are generated reproducibly.

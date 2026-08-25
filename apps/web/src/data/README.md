# Ireland county boundaries

`irelandCounties.json` contains simplified SVG paths generated from Tailte
Éireann's **Administrative Areas - National Statutory Boundaries - 2019**
dataset. The source geometry was requested in WGS84 and projected into the
local SVG coordinate system used by `PropertyMap`.

- Source: https://data.gov.ie/dataset/administrative-areas-national-statutory-boundaries-20191
- Licence: Creative Commons Attribution 4.0
- Attribution: Tailte Éireann

The JSON is a generated data asset. Regenerate it from the source dataset
rather than editing individual paths by hand.

Each county also contains a WGS84 bounding box generated from the source
geometry. OpenHaus uses it to fit the street map when a buyer enters a county.

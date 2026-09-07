import { writeFile } from 'node:fs/promises'
import { encodeBoundary, decodeBoundary } from '../src/boundaryCodec.ts'

const endpoint = 'https://services-eu1.arcgis.com/FH5XCsx8rYXqnjF5/arcgis/rest/services/Counties___OSi_National_Statutory_Boundaries/FeatureServer/0/query'
const parameters = new URLSearchParams({
  where: '1=1', outFields: 'ENGLISH', returnGeometry: 'true', outSR: '4326',
  geometryPrecision: '6', maxAllowableOffset: '0.0001', f: 'geojson',
})
const response = await fetch(`${endpoint}?${parameters}`)
if (!response.ok) throw new Error(`County download failed: HTTP ${response.status}`)
const data = await response.json()
const countResponse = await fetch(`${endpoint}?where=1%3D1&returnCountOnly=true&f=json`)
if (!countResponse.ok) throw new Error('County count could not be verified')
const { count } = await countResponse.json()
if (count !== 26 || data.features?.length !== count || data.exceededTransferLimit || data.properties?.exceededTransferLimit) throw new Error('Incomplete county download; existing data unchanged')

const counties = data.features.map(feature => {
  const geometry = feature.geometry
  if (!['Polygon', 'MultiPolygon'].includes(geometry.type)) throw new Error('Unexpected county geometry')
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  const paths = polygons.flatMap(polygon => polygon.map(ring => {
    const points = ring.map(([lng, lat]) => [lat, lng])
    if (points.length < 4 || JSON.stringify(points[0]) !== JSON.stringify(points.at(-1))) throw new Error('Unclosed county boundary')
    const encoded = encodeBoundary(points)
    if (JSON.stringify(decodeBoundary(encoded)) !== JSON.stringify(points)) throw new Error('County encoding changed source coordinates')
    return encoded
  }))
  if (paths.length === 0) throw new Error('Empty county boundary')
  const name = feature.properties.ENGLISH.toLocaleLowerCase('en-IE').replace(/(^|[\s-])\p{L}/gu, match => match.toLocaleUpperCase('en-IE'))
  return { name, paths }
}).sort((a, b) => a.name.localeCompare(b.name))
if (new Set(counties.map(county => county.name)).size !== 26) throw new Error('Duplicate county names')

await writeFile(new URL('../src/data/irelandCounties.json', import.meta.url), `${JSON.stringify({
  source: 'https://data.gov.ie/en_GB/dataset/counties-national-statutory-boundaries-2019',
  attribution: 'Tailte Éireann · CC BY 4.0',
  encoding: 'polyline6', geometryPrecision: 6, maxAllowableOffset: 0.0001, counties,
})}\n`)
await import('./pack-county-boundaries.mjs')

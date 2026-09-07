import { writeFile } from 'node:fs/promises'
import { encodeBoundary, decodeBoundary } from '../src/boundaryCodec.ts'

const endpoint = 'https://services-eu1.arcgis.com/FH5XCsx8rYXqnjF5/arcgis/rest/services/Local_Electoral_Areas___OSi_National_Statutory_Boundaries/FeatureServer/0/query'
const source = 'https://data.gov.ie/dataset/local-electoral-areas-national-statutory-boundaries-2019'
const countyNames = new Map([
  ['CARLOW', 'Carlow'], ['CAVAN', 'Cavan'], ['CLARE', 'Clare'], ['CORK', 'Cork'],
  ['DONEGAL', 'Donegal'], ['DUBLIN', 'Dublin'], ['GALWAY', 'Galway'], ['KERRY', 'Kerry'],
  ['KILDARE', 'Kildare'], ['KILKENNY', 'Kilkenny'], ['LAOIS', 'Laois'], ['LEITRIM', 'Leitrim'],
  ['LIMERICK', 'Limerick'], ['LONGFORD', 'Longford'], ['LOUTH', 'Louth'], ['MAYO', 'Mayo'],
  ['MEATH', 'Meath'], ['MONAGHAN', 'Monaghan'], ['OFFALY', 'Offaly'], ['ROSCOMMON', 'Roscommon'],
  ['SLIGO', 'Sligo'], ['TIPPERARY', 'Tipperary'], ['WATERFORD', 'Waterford'], ['WESTMEATH', 'Westmeath'],
  ['WEXFORD', 'Wexford'], ['WICKLOW', 'Wicklow'],
])

const parameters = new URLSearchParams({
  where: '1=1', outFields: 'ENGLISH,COUNTY', returnGeometry: 'true', outSR: '4326',
  geometryPrecision: '6', maxAllowableOffset: '0.0001', f: 'geojson',
})
const response = await fetch(`${endpoint}?${parameters}`)
if (!response.ok) throw new Error(`Boundary download failed with HTTP ${response.status}`)
const geojson = await response.json()
const countResponse = await fetch(`${endpoint}?where=1%3D1&returnCountOnly=true&f=json`)
if (!countResponse.ok) throw new Error('Boundary count could not be verified')
const { count } = await countResponse.json()
if (!Array.isArray(geojson.features) || !Number.isInteger(count) || count < 1 || geojson.features.length !== count || geojson.exceededTransferLimit || geojson.properties?.exceededTransferLimit) {
  throw new Error('Incomplete boundary download; existing data was not replaced')
}

const areas = geojson.features.map((feature) => ({
  name: titleCase(feature.properties.ENGLISH.replace(/\s+LEA-\d+$/i, '')),
  county: countyNames.get(feature.properties.COUNTY) ?? titleCase(feature.properties.COUNTY),
  paths: polygonPaths(feature.geometry).map((path) => {
    const encoded = encodeBoundary(path)
    if (JSON.stringify(decodeBoundary(encoded)) !== JSON.stringify(path)) throw new Error('Boundary encoding changed source coordinates')
    return encoded
  }),
})).sort((left, right) => left.county.localeCompare(right.county) || left.name.localeCompare(right.name))

await writeFile(new URL('../src/data/irelandSubregions.json', import.meta.url), `${JSON.stringify({
  source,
  attribution: 'Tailte Éireann · CC BY 4.0',
  geometryPrecision: Number(parameters.get('geometryPrecision')),
  maxAllowableOffset: Number(parameters.get('maxAllowableOffset')),
  encoding: 'polyline6',
  areas,
})}\n`)
await import('./split-administrative-areas.mjs')

function polygonPaths(geometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  return polygons.flatMap((polygon) => polygon.map((ring) => ring.map(([lng, lat]) => [lat, lng])))
}

function titleCase(value) {
  return value.toLocaleLowerCase('en-IE').replace(/(^|[\s–-])\p{L}/gu, (match) => match.toLocaleUpperCase('en-IE'))
}

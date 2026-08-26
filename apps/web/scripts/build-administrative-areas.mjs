import { writeFile } from 'node:fs/promises'

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
  geometryPrecision: '4', maxAllowableOffset: '0.005', f: 'geojson',
})
const response = await fetch(`${endpoint}?${parameters}`)
if (!response.ok) throw new Error(`Boundary download failed with HTTP ${response.status}`)
const geojson = await response.json()

const areas = geojson.features.map((feature) => ({
  name: titleCase(feature.properties.ENGLISH.replace(/\s+LEA-\d+$/i, '')),
  county: countyNames.get(feature.properties.COUNTY) ?? titleCase(feature.properties.COUNTY),
  paths: polygonPaths(feature.geometry),
})).sort((left, right) => left.county.localeCompare(right.county) || left.name.localeCompare(right.name))

await writeFile(new URL('../src/data/irelandSubregions.json', import.meta.url), `${JSON.stringify({
  source,
  attribution: 'Tailte Éireann · CC BY 4.0',
  areas,
})}\n`)

function polygonPaths(geometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  return polygons.flatMap((polygon) => polygon.map((ring) => ring.map(([lng, lat]) => [lat, lng])))
}

function titleCase(value) {
  return value.toLocaleLowerCase('en-IE').replace(/(^|[\s–-])\p{L}/gu, (match) => match.toLocaleUpperCase('en-IE'))
}

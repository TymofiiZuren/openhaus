import type { Coordinate } from './googleMapsLoader'
import { decodeBoundary } from './boundaryCodec'

export type AdministrativeArea = {
  name: string
  county: string
  paths: Coordinate[][]
}

type EncodedArea = { name: string; county: string; paths: string[] }
const countyAssets = import.meta.glob<string>('./data/areas/*.json', { query: '?raw', import: 'default' })
const pendingByCounty = new Map<string, Promise<void>>()
const encodedByCounty = new Map<string, EncodedArea[]>()
const decodedByCounty = new Map<string, AdministrativeArea[]>()
type Bounds = { north: number; south: number; east: number; west: number }
const pathBounds = new WeakMap<Coordinate[], Bounds>()

export const administrativeAreaAttribution = {
  label: 'Tailte Éireann · CC BY 4.0',
  url: 'https://data.gov.ie/dataset/local-electoral-areas-national-statutory-boundaries-2019',
}

// The page owns loading/error state. Concurrent requests share one import;
// failures are evicted so an explicit retry can try the asset again.
export function loadAreasForCounty(county: string | null | undefined): Promise<void> {
  const key = county?.toLocaleLowerCase() ?? ''
  const loader = countyAssets[`./data/areas/${key}.json`]
  if (!loader || encodedByCounty.has(key)) return Promise.resolve()
  const pending = pendingByCounty.get(key)
  if (pending) return pending
  const request = loader().then(raw => {
    encodedByCounty.set(key, JSON.parse(raw) as EncodedArea[])
  }).finally(() => pendingByCounty.delete(key))
  pendingByCounty.set(key, request)
  return request
}

export function areasForCounty(county: string | null | undefined): AdministrativeArea[] {
  if (!county) return []
  const key = county.toLocaleLowerCase()
  const existing = decodedByCounty.get(key)
  if (existing) return existing
  const encoded = encodedByCounty.get(key)
  if (!encoded) {
    if (countyAssets[`./data/areas/${key}.json`]) throw new Error(`County geometry not loaded: ${county}`)
    return [] // Do not grow the cache with arbitrary search strings.
  }
  const decoded = encoded.map(area => ({name: area.name, county: area.county, paths: area.paths.map(path => {
    const points = decodeBoundary(path).map(([lat,lng])=>({lat,lng}))
    const bounds = {north:-Infinity,south:Infinity,east:-Infinity,west:Infinity}
    for (const point of points) {
      bounds.north=Math.max(bounds.north,point.lat); bounds.south=Math.min(bounds.south,point.lat)
      bounds.east=Math.max(bounds.east,point.lng); bounds.west=Math.min(bounds.west,point.lng)
    }
    pathBounds.set(points,bounds)
    return points
  })})).sort((left,right)=>left.name.localeCompare(right.name))
  decodedByCounty.set(key,decoded)
  return decoded
}

export function areaForCoordinate(county: string, coordinate: Coordinate): AdministrativeArea | undefined {
  return areasForCounty(county).find((area) => area.paths.filter((path) => pointInPolygon(coordinate, path)).length % 2 === 1)
}

function pointInPolygon(point: Coordinate, path: Coordinate[]) {
  const bounds=pathBounds.get(path)
  if (bounds && (point.lat<bounds.south||point.lat>bounds.north||point.lng<bounds.west||point.lng>bounds.east)) return false
  let inside = false
  for (let current = 0, previous = path.length - 1; current < path.length; previous = current++) {
    const a = path[current]
    const b = path[previous]
    const intersects = (a.lat > point.lat) !== (b.lat > point.lat)
      && point.lng < (b.lng - a.lng) * (point.lat - a.lat) / (b.lat - a.lat) + a.lng
    if (intersects) inside = !inside
  }
  return inside
}

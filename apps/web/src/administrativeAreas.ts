import areaJSON from './data/irelandSubregions.json?raw'
import type { Coordinate } from './googleMapsLoader'
import { decodeBoundary } from './boundaryCodec'

export type AdministrativeArea = {
  name: string
  county: string
  paths: Coordinate[][]
}

type EncodedArea = { name: string; county: string; paths: string[] }
// Parse data as JSON rather than compiling thousands of coordinates as JavaScript.
const areaData = JSON.parse(areaJSON) as { areas: EncodedArea[]; attribution: string; source: string }
const encodedByCounty = new Map<string, EncodedArea[]>()
for (const area of areaData.areas) {
  const key = area.county.toLocaleLowerCase()
  const group = encodedByCounty.get(key) ?? []
  group.push(area)
  encodedByCounty.set(key, group)
}
const decodedByCounty = new Map<string, AdministrativeArea[]>()
type Bounds = { north: number; south: number; east: number; west: number }
const pathBounds = new WeakMap<Coordinate[], Bounds>()

export const administrativeAreaAttribution = {
  label: areaData.attribution,
  url: areaData.source,
}

export function areasForCounty(county: string | null | undefined): AdministrativeArea[] {
  if (!county) return []
  const key = county.toLocaleLowerCase()
  const existing = decodedByCounty.get(key)
  if (existing) return existing
  const encoded = encodedByCounty.get(key)
  if (!encoded) return [] // Do not grow the cache with arbitrary search strings.
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

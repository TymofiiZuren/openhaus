import areaData from './data/irelandSubregions.json'
import type { Coordinate } from './googleMapsLoader'

export type AdministrativeArea = {
  name: string
  county: string
  paths: Coordinate[][]
}

type EncodedArea = { name: string; county: string; paths: [number, number][][] }
const areas = (areaData.areas as EncodedArea[]).map((area) => ({
  name: area.name,
  county: area.county,
  paths: area.paths.map((path) => path.map(([lat, lng]) => ({ lat, lng }))),
}))

export const administrativeAreaAttribution = {
  label: areaData.attribution,
  url: areaData.source,
}

export function areasForCounty(county: string | null | undefined): AdministrativeArea[] {
  if (!county) return []
  return areas
    .filter((area) => sameLocation(area.county, county))
    .sort((left, right) => left.name.localeCompare(right.name))
}

export function areaForCoordinate(county: string, coordinate: Coordinate): AdministrativeArea | undefined {
  return areasForCounty(county).find((area) => area.paths.filter((path) => pointInPolygon(coordinate, path)).length % 2 === 1)
}

function pointInPolygon(point: Coordinate, path: Coordinate[]) {
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

function sameLocation(left: string, right: string) {
  return left.localeCompare(right, undefined, { sensitivity: 'base' }) === 0
}

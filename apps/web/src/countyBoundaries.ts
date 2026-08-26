import countyData from './data/irelandCounties.json'
import type { Coordinate } from './googleMapsLoader'

export type CountyBoundary = {
  name: string
  paths: Coordinate[][]
  bounds: { west: number; south: number; east: number; north: number }
}

export const countyBoundaries: CountyBoundary[] = countyData.counties.map((county) => ({
  name: county.name,
  paths: parseProjectedPath(county.d),
  bounds: {
    west: county.bounds[0],
    south: county.bounds[1],
    east: county.bounds[2],
    north: county.bounds[3],
  },
}))

export const countyBoundaryAttribution = {
  label: 'Tailte Éireann · CC BY 4.0',
  url: countyData.source,
}

export function boundariesForSelection(selectedCounty: string | null | undefined) {
  if (!selectedCounty) return countyBoundaries
  return countyBoundaries.filter((county) => sameLocation(county.name, selectedCounty))
}

export function boundaryBounds(county: CountyBoundary) {
  const coordinates = county.paths.flat()
  return coordinates.reduce((bounds, coordinate) => ({
    west: Math.min(bounds.west, coordinate.lng),
    south: Math.min(bounds.south, coordinate.lat),
    east: Math.max(bounds.east, coordinate.lng),
    north: Math.max(bounds.north, coordinate.lat),
  }), { west: Infinity, south: Infinity, east: -Infinity, north: -Infinity })
}

export function mapViewport(selectedCounty: string | null | undefined) {
  const selected = boundariesForSelection(selectedCounty)
  const counties = selected.length > 0 ? selected : countyBoundaries
  const bounds = mergeBounds(counties.map(boundaryBounds))
  return {
    mode: selectedCounty && selected.length > 0 ? 'county' as const : 'ireland' as const,
    bounds,
    restriction: expandBounds(bounds, selectedCounty ? .18 : .06),
    padding: selectedCounty ? 96 : 12,
  }
}

function mergeBounds(bounds: CountyBoundary['bounds'][]) {
  return bounds.reduce((result, item) => ({
    west: Math.min(result.west, item.west),
    south: Math.min(result.south, item.south),
    east: Math.max(result.east, item.east),
    north: Math.max(result.north, item.north),
  }), { west: Infinity, south: Infinity, east: -Infinity, north: -Infinity })
}

function expandBounds(bounds: CountyBoundary['bounds'], ratio: number) {
  const longitudePadding = (bounds.east - bounds.west) * ratio
  const latitudePadding = (bounds.north - bounds.south) * ratio
  return {
    west: bounds.west - longitudePadding,
    south: bounds.south - latitudePadding,
    east: bounds.east + longitudePadding,
    north: bounds.north + latitudePadding,
  }
}

function parseProjectedPath(path: string): Coordinate[][] {
  const paths: Coordinate[][] = []
  let current: Coordinate[] = []
  const commands = path.matchAll(/([ML])(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)|Z/g)

  for (const command of commands) {
    if (command[0] === 'Z') {
      if (current.length > 2) paths.push(current)
      current = []
      continue
    }
    if (command[1] === 'M' && current.length > 2) paths.push(current)
    current.push(unproject(Number(command[2]), Number(command[3])))
  }
  if (current.length > 2) paths.push(current)
  return paths
}

function unproject(x: number, y: number): Coordinate {
  const { offsetX, offsetY, scale, cosineLatitude } = countyData.projection
  return {
    lng: countyData.bounds.minLongitude + (x - offsetX) / (cosineLatitude * scale),
    lat: countyData.bounds.maxLatitude - (y - offsetY) / scale,
  }
}

function sameLocation(left: string, right: string) {
  return left.localeCompare(right, undefined, { sensitivity: 'base' }) === 0
}

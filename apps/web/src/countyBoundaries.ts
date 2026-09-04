import countyJSON from './data/irelandCounties.json?raw'
import type { Coordinate } from './googleMapsLoader'
import { decodeBoundary } from './boundaryCodec'

export type CountyBoundary = {
  name: string
  paths: Coordinate[][]
  bounds: { west: number; south: number; east: number; north: number }
}

const countyData = JSON.parse(countyJSON) as { source: string; attribution: string; counties: { name: string; paths: string[] }[] }
export const countyBoundaries: CountyBoundary[] = countyData.counties.map((county) => {
  const paths = county.paths.map(path => decodeBoundary(path).map(([lat, lng]) => ({ lat, lng })))
  return { name: county.name, paths, bounds: boundaryBounds({ paths }) }
})

export const countyBoundaryAttribution = {
  label: countyData.attribution,
  url: countyData.source,
}

export function boundariesForSelection(selectedCounty: string | null | undefined) {
  if (!selectedCounty) return countyBoundaries
  return countyBoundaries.filter((county) => sameLocation(county.name, selectedCounty))
}

export function boundaryBounds(county: Pick<CountyBoundary, 'paths'>) {
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
  const bounds = mergeBounds(counties.map(county => county.bounds))
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

function sameLocation(left: string, right: string) {
  return left.localeCompare(right, undefined, { sensitivity: 'base' }) === 0
}

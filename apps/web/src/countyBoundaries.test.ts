import { describe, expect, it } from 'vitest'
import { boundariesForSelection, boundaryBounds, countyBoundaries, mapViewport } from './countyBoundaries'
import countyJSON from './data/irelandCounties.json?raw'
import topologyJSON from './data/irelandCountyTopology.json?raw'
import { decodeBoundary } from './boundaryCodec'
import { unpackBoundaries } from './boundaryTopology'

describe('county boundaries', () => {
  it('reconstructs every original coordinate, ring order and viewport losslessly', () => {
    const source = JSON.parse(countyJSON)
    const restored = unpackBoundaries(JSON.parse(topologyJSON))
    expect(restored.length).toBe(source.counties.length)
    for (let i = 0; i < restored.length; i++) {
      expect(restored[i].name).toBe(source.counties[i].name)
      expect(restored[i].paths).toEqual(source.counties[i].paths.map(decodeBoundary))
      expect(countyBoundaries[i].paths).toEqual(restored[i].paths.map(path => path.map(([lat, lng]) => ({ lat, lng }))))
    }
  })
  it('uses geographic county data with six-decimal precision and preserved rings', () => {
    const data = JSON.parse(countyJSON)
    expect(data.encoding).toBe('polyline6')
    expect(data.geometryPrecision).toBe(6)
    expect(data.maxAllowableOffset).toBe(0.0001)
    expect(new Set(countyBoundaries.map(county => county.name)).size).toBe(26)
    for (const county of countyBoundaries) {
      for (const ring of county.paths) {
        expect(ring.length).toBeGreaterThanOrEqual(4)
        expect(ring[0]).toEqual(ring.at(-1))
      }
      expect(county.bounds).toEqual(boundaryBounds(county))
    }
  })
  it('provides all Irish counties as Google Maps latitude and longitude paths', () => {
    expect(countyBoundaries).toHaveLength(26)

    const cork = countyBoundaries.find((county) => county.name === 'Cork')
    expect(cork?.paths.length).toBeGreaterThan(0)
    expect(cork?.paths.flat().every(({ lat, lng }) => lat >= 51 && lat <= 56 && lng >= -11 && lng <= -5)).toBe(true)
  })

  it('keeps Dublin mainland and islands in one selectable county', () => {
    const dublin = countyBoundaries.find((county) => county.name === 'Dublin')

    expect(dublin?.paths.length).toBeGreaterThan(1)
    expect(dublin?.paths.some(path => path.length > 100)).toBe(true)
    expect(dublin?.paths.some(path => pointInPath({ lat: 53.255, lng: -6.113 }, path))).toBe(true)
  })

  it('presents Cork city and county as one county boundary before drill-down', () => {
    const cork = countyBoundaries.find((county) => county.name === 'Cork')

    expect(cork?.paths.length).toBeGreaterThan(25)
    expect(cork?.paths.some((path) => pointInPath({ lat: 51.8985, lng: -8.4756 }, path))).toBe(true)
  })

  it('isolates the chosen county and derives its viewport from the rendered geometry', () => {
    expect(boundariesForSelection(null)).toHaveLength(26)
    expect(boundariesForSelection('Cork').map((county) => county.name)).toEqual(['Cork'])

    const cork = boundariesForSelection('Cork')[0]
    expect(boundaryBounds(cork)).toEqual(expect.objectContaining({
      west: expect.closeTo(-10.248416, 6),
      south: expect.closeTo(51.42, 2),
      east: expect.closeTo(-7.843, 2),
      north: expect.closeTo(52.388, 2),
    }))
  })

  it('uses a stable Ireland overview before narrowing to a selected county', () => {
    const ireland = mapViewport(null)
    const dublin = mapViewport('Dublin')

    expect(ireland.mode).toBe('ireland')
    expect(ireland.bounds.north).toBeGreaterThan(55)
    expect(ireland.bounds.south).toBeLessThan(52)
    expect(dublin.mode).toBe('county')
    expect(dublin.bounds.west).toBeGreaterThan(ireland.bounds.west)
    expect(dublin.bounds.east - dublin.bounds.west).toBeLessThan(ireland.bounds.east - ireland.bounds.west)
  })
})

function pointInPath(point: { lat: number; lng: number }, path: { lat: number; lng: number }[]) {
  let inside = false
  for (let index = 0, previous = path.length - 1; index < path.length; previous = index, index += 1) {
    const currentPoint = path[index]
    const previousPoint = path[previous]
    if ((currentPoint.lat > point.lat) !== (previousPoint.lat > point.lat)
      && point.lng < (previousPoint.lng - currentPoint.lng) * (point.lat - currentPoint.lat) / (previousPoint.lat - currentPoint.lat) + currentPoint.lng) inside = !inside
  }
  return inside
}

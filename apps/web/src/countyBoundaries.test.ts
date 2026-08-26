import { describe, expect, it } from 'vitest'
import { boundariesForSelection, boundaryBounds, countyBoundaries, mapViewport } from './countyBoundaries'

describe('county boundaries', () => {
  it('provides all Irish counties as Google Maps latitude and longitude paths', () => {
    expect(countyBoundaries).toHaveLength(26)

    const cork = countyBoundaries.find((county) => county.name === 'Cork')
    expect(cork?.paths.length).toBeGreaterThan(0)
    expect(cork?.paths.flat().every(({ lat, lng }) => lat >= 51 && lat <= 56 && lng >= -11 && lng <= -5)).toBe(true)
  })

  it('isolates the chosen county and derives its viewport from the rendered geometry', () => {
    expect(boundariesForSelection(null)).toHaveLength(26)
    expect(boundariesForSelection('Cork').map((county) => county.name)).toEqual(['Cork'])

    const cork = boundariesForSelection('Cork')[0]
    expect(boundaryBounds(cork)).toEqual(expect.objectContaining({
      west: expect.closeTo(-10.235, 2),
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

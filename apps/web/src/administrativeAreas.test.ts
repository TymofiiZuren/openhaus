import { describe, expect, it } from 'vitest'
import { areasForCounty, areaForCoordinate } from './administrativeAreas'
import boundaryJSON from './data/irelandSubregions.json?raw'
const boundaries = JSON.parse(boundaryJSON)

describe('county subregions', () => {
  it('ships the complete source with fine-grained geometry metadata', () => {
    expect(boundaries.areas).toHaveLength(166)
    expect(boundaries.geometryPrecision).toBe(6)
    expect(boundaries.maxAllowableOffset).toBe(0.0001)
    expect(boundaries.encoding).toBe('polyline6')
    expect(new TextEncoder().encode(boundaryJSON).length).toBeLessThan(2_000_000)
  })
  it('exposes national local electoral areas only after a county is selected', () => {
    expect(areasForCounty(null)).toEqual([])
    const dublinAreas = areasForCounty('Dublin').map((area) => area.name)
    expect(dublinAreas).toHaveLength(31)
    expect(dublinAreas).toContain('Dún Laoghaire')
    expect(dublinAreas).toContain('Pembroke')
    expect(areasForCounty('Mayo').length).toBeGreaterThan(0)
  })

  it('assigns a property coordinate to its containing subregion', () => {
    expect(areaForCoordinate('Dublin', { lat: 53.332, lng: -6.2527 })?.name).toBe('Pembroke')
    expect(areaForCoordinate('Cork', { lat: 51.9045, lng: -8.4932 })?.name).toBe('Cork City North West')
  })
})

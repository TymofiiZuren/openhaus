import { describe, expect, it } from 'vitest'
import { areasForCounty, areaForCoordinate } from './administrativeAreas'

describe('county subregions', () => {
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

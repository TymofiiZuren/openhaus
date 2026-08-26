import { describe, expect, it } from 'vitest'
import { areasForCounty, areaForCoordinate } from './administrativeAreas'

describe('county subregions', () => {
  it('exposes Dublin council areas only after Dublin is selected', () => {
    expect(areasForCounty(null)).toEqual([])
    expect(areasForCounty('Dublin').map((area) => area.name)).toEqual([
      'Dublin City',
      'Dún Laoghaire–Rathdown',
      'Fingal',
      'South Dublin',
    ])
  })

  it('assigns a property coordinate to its containing subregion', () => {
    expect(areaForCoordinate('Dublin', { lat: 53.332, lng: -6.2527 })?.name).toBe('Dublin City')
    expect(areaForCoordinate('Cork', { lat: 51.9045, lng: -8.4932 })?.name).toBe('Cork City')
  })
})

import { beforeAll, describe, expect, it } from 'vitest'
import { areasForCounty, areaForCoordinate, loadAreasForCounty } from './administrativeAreas'
import boundaryJSON from './data/irelandSubregions.json?raw'
const boundaries = JSON.parse(boundaryJSON)
beforeAll(() => Promise.all(['Dublin', 'Mayo', 'Cork'].map(loadAreasForCounty)))

describe('county subregions', () => {
  it('derives all county chunks losslessly from the national source', async () => {
    const chunks = import.meta.glob<string>('./data/areas/*.json', { query: '?raw', import: 'default' })
    expect(Object.keys(chunks)).toHaveLength(26)
    const areas = (await Promise.all(Object.values(chunks).map(async load => JSON.parse(await load())))).flat()
    expect(areas).toHaveLength(boundaries.areas.length)
    const sort = (items: { county: string; name: string }[]) => [...items].sort((a, b) => `${a.county}/${a.name}`.localeCompare(`${b.county}/${b.name}`))
    expect(sort(areas)).toEqual(sort(boundaries.areas))
  })
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

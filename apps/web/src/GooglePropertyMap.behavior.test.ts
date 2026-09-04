import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyCamera, areaStyle, countyStyle } from './GooglePropertyMap'
import { mapViewport } from './countyBoundaries'
import type { MapInstance } from './googleMapsLoader'
import type { Property } from './api/properties'
import { groupPropertiesForMap } from './mapListingGroups'

const baseProperty: Property = {
  id: 'one', title: 'First home', addressLine1: 'Main Street', city: 'Cork', county: 'Cork',
  priceCents: 50000000, bedrooms: 3, propertyType: 'detached', longitude: -8.47, latitude: 51.9, media: [],
}

afterEach(() => { delete window.google })

describe('regional map presentation', () => {
  it.each([['Galway', 1200, 64], ['Cork', 390, 48], ['Dublin', 900, 64]])('fits %s to its full boundary', (county, width, padding) => {
    const extend = vi.fn()
    window.google = { maps: { LatLngBounds: class { extend = extend } } } as unknown as NonNullable<typeof window.google>
    const map = { setOptions: vi.fn(), fitBounds: vi.fn(), moveCamera: vi.fn() } as unknown as MapInstance
    applyCamera(map, county, width)
    const { bounds } = mapViewport(county)
    expect(extend).not.toHaveBeenCalled()
    expect(map.fitBounds).not.toHaveBeenCalled()
    expect(map.moveCamera).toHaveBeenCalledTimes(1)
    expect(map.moveCamera).toHaveBeenCalledWith({ center: { lat: expect.any(Number), lng: expect.closeTo((bounds.west + bounds.east) / 2, 8) }, zoom: expect.any(Number) })
    expect(padding).toBeGreaterThan(0)
  })

  it('keeps a quiet fill and a stronger selected boundary', () => {
    const selected = countyStyle('Galway', 'Galway', true)
    const neighbour = countyStyle('Mayo', 'Galway', true)
    expect(selected.strokeWeight).toBeGreaterThan(neighbour.strokeWeight)
    expect(selected.fillOpacity).toBeLessThan(.05)
    expect(areaStyle('Tuam', 'Tuam').strokeWeight).toBeGreaterThan(areaStyle('Tuam', undefined).strokeWeight)
    expect(areaStyle('Tuam', 'Tuam').fillOpacity).toBeLessThan(.15)
  })
})

describe('map listing count groups', () => {
  it('groups the Ireland overview by county', () => {
    const groups = groupPropertiesForMap([
      baseProperty,
      { ...baseProperty, id: 'two', city: 'Kinsale', longitude: -8.53 },
      { ...baseProperty, id: 'three', city: 'Dublin', county: 'Dublin', longitude: -6.26, latitude: 53.35 },
    ], null)

    expect(groups.map((group) => [group.label, group.properties.length])).toEqual([['Cork', 2], ['Dublin', 1]])
  })

  it('keeps homes grouped by local area after a county is selected', () => {
    const groups = groupPropertiesForMap([
      baseProperty,
      { ...baseProperty, id: 'two' },
      { ...baseProperty, id: 'three', city: 'Kinsale', latitude: 51.705, longitude: -8.523 },
    ], 'Cork')

    expect(groups).toHaveLength(2)
    expect(groups.map((group) => group.markerLabel)).toEqual(expect.arrayContaining(['2', '1']))
  })

  it('reveals individual price markers only after a local area is selected', () => {
    const groups = groupPropertiesForMap([
      baseProperty,
      { ...baseProperty, id: 'two', priceCents: 62500000 },
    ], 'Cork', 'Cork City North West')

    expect(groups.map((group) => [group.markerLabel, group.properties.map((property) => property.id)])).toEqual([
      ['€500k', ['one']],
      ['€625k', ['two']],
    ])
  })
})

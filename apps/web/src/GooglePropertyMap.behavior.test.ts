import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { areaForProperty, loadAreasForCounty } from './administrativeAreas'
beforeAll(() => Promise.all(['Dublin', 'Cork', 'Wexford'].map(loadAreasForCounty)))
import { applyCamera, areaStyle, countyStyle } from './GooglePropertyMap'
import { mapStyleForTheme } from './mapStyles'
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
    expect(selected.fillColor).toBe('#8e887f')
    expect(areaStyle('Tuam', 'Tuam').strokeWeight).toBeGreaterThan(areaStyle('Tuam', undefined).strokeWeight)
    expect(areaStyle('Tuam', 'Tuam').fillOpacity).toBeLessThan(.15)
    expect(areaStyle('Tuam', 'Tuam').fillColor).toBe('#8e887f')
  })

  it('uses a dark basemap with the dark site theme', () => {
    expect(mapStyleForTheme('light')[0]).toEqual({ elementType: 'geometry', stylers: [{ color: '#f0f0ed' }] })
    expect(mapStyleForTheme('dark')[0]).toEqual({ elementType: 'geometry', stylers: [{ color: '#10100f' }] })
  })
})

describe('map listing count groups', () => {
  it('uses boundary membership first and never guesses an unmatched town', () => {
    expect(areaForProperty({ ...baseProperty, city: 'Wrong town' })).toBeDefined()
    const unmatched = { ...baseProperty, county: 'Wexford', city: 'Unknown', latitude: 52.34, longitude: -6.46 }
    expect(areaForProperty(unmatched)).toBeUndefined()
    expect(groupPropertiesForMap([unmatched], 'Wexford')).toEqual([])
    expect(areaForProperty({ ...unmatched, city: ' wExFoRd ' })?.name).toBe('Wexford')
  })
  it('keeps numbered area pins when zoomed into town without selecting an area', () => {
    const homes = [
      { ...baseProperty, id: 'demo', county: 'Wexford', city: 'Wexford', priceCents: 49500000, latitude: 52.34, longitude: -6.46 },
      { ...baseProperty, id: 'coastal', county: 'Wexford', city: 'Wexford', priceCents: 52500000, latitude: 52.3369, longitude: -6.4633 },
    ]
    const closeUp = groupPropertiesForMap(homes, 'Wexford')
    expect(closeUp.map(group => group.markerLabel)).toEqual(['2'])
    expect(closeUp.every(group => !group.isProperty)).toBe(true)
    expect(groupPropertiesForMap(homes, 'Wexford', 'Wexford').map(group => group.markerLabel)).toEqual(['€495k', '€525k'])
    expect(groupPropertiesForMap(homes, null).map(group => group.markerLabel)).toEqual(['2'])
  })
  it('preserves counts and listing order for a large county catalogue', () => {
    const properties = Array.from({ length: 10000 }, (_, index) => ({ ...baseProperty, id: String(index) }))
    const groups = groupPropertiesForMap(properties, null)
    expect(groups).toHaveLength(1)
    expect(groups[0].markerLabel).toBe('10000')
    expect(groups[0].properties).toEqual(properties)
    expect(properties).toHaveLength(10000)
  })
  it('keeps Wexford pin counts consistent with the homes inside each area', () => {
    const properties = [
      { ...baseProperty, id: 'wexford-demo', county: 'Wexford', city: 'Wexford', priceCents: 49500000, latitude: 52.34, longitude: -6.46 },
      { ...baseProperty, id: 'wexford-coastal', county: 'Wexford', city: 'Wexford', priceCents: 52500000, latitude: 52.3369, longitude: -6.4633 },
    ]
    const groups = groupPropertiesForMap(properties, 'Wexford')
    expect(groups.every(group => group.properties.length > 0)).toBe(true)
    expect(groups.flatMap(group => group.properties.map(home => home.id)).sort()).toEqual(properties.map(home => home.id).sort())
    expect(groups.some(group => group.isProperty)).toBe(false)
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ label: 'Wexford', markerLabel: '2' })
    for (const group of groups.filter(group => !group.isProperty)) {
      const visible = properties.filter(home => areaForProperty(home)?.name === group.label)
      expect(visible.map(home => home.id)).toEqual(group.properties.map(home => home.id))
      const detail = groupPropertiesForMap(group.properties, 'Wexford', group.label)
      expect(detail).toHaveLength(group.properties.length)
      expect(detail.every(marker => marker.markerLabel.startsWith('€'))).toBe(true)
    }
  })
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

    expect(groups.filter(group => group.properties.length > 0)).toHaveLength(2)
    expect(groups.map((group) => group.markerLabel)).toEqual(expect.arrayContaining(['2', '1']))
    expect(groups.some(group => group.markerLabel === '0')).toBe(false)
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

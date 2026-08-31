import { describe, expect, it } from 'vitest'
import type { Property } from './api/properties'
import { groupPropertiesForMap } from './mapListingGroups'

const baseProperty: Property = {
  id: 'one', title: 'First home', addressLine1: 'Main Street', city: 'Cork', county: 'Cork',
  priceCents: 50000000, bedrooms: 3, propertyType: 'detached', longitude: -8.47, latitude: 51.9, media: [],
}

describe('map listing count groups', () => {
  it('groups the Ireland overview by county', () => {
    const groups = groupPropertiesForMap([
      baseProperty,
      { ...baseProperty, id: 'two', city: 'Kinsale', longitude: -8.53 },
      { ...baseProperty, id: 'three', city: 'Dublin', county: 'Dublin', longitude: -6.26, latitude: 53.35 },
    ], null)

    expect(groups.map((group) => [group.label, group.properties.length])).toEqual([['Cork', 2], ['Dublin', 1]])
  })

  it('reveals individual homes after a county is selected', () => {
    const groups = groupPropertiesForMap([
      baseProperty,
      { ...baseProperty, id: 'two' },
      { ...baseProperty, id: 'three', city: 'Kinsale' },
    ], 'Cork')

    expect(groups.map((group) => [group.label, group.properties.map((property) => property.id)])).toEqual([
      ['First home', ['one']],
      ['First home', ['two']],
      ['First home', ['three']],
    ])
  })
})

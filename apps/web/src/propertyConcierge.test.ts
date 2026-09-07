import { describe, expect, it } from 'vitest'
import { createConciergeReply } from './propertyConcierge'
import type { Property } from './api/properties'

const properties: Property[] = [
  {
    id: 'cork-home',
    title: 'Garden-view contemporary residence',
    addressLine1: 'Douglas',
    city: 'Cork',
    county: 'Cork',
    priceCents: 72500000,
    bedrooms: 3,
    propertyType: 'detached',
    latitude: 51.9,
    longitude: -8.47,
    media: [{ kind: 'panorama', url: 'https://kuula.co/share/example', altText: 'Tour', position: 0 }],
  },
  {
    id: 'dublin-home',
    title: 'Red-brick city home',
    addressLine1: 'Leeson Park',
    city: 'Dublin',
    county: 'Dublin',
    priceCents: 89500000,
    bedrooms: 4,
    propertyType: 'terraced',
    latitude: 53.33,
    longitude: -6.25,
    media: [],
  },
]

describe('property concierge', () => {
  it('turns a natural-language brief into catalogue filters and grounded matches', () => {
    const reply = createConciergeReply('Show me 3 bedroom homes under €800k in Cork with a 360 tour', properties)

    expect(reply.criteria).toEqual({
      location: 'Cork',
      minimumBedrooms: 3,
      maximumPrice: 800000,
      propertyType: 'all',
      spatialToursOnly: true,
    })
    expect(reply.matches.map((property) => property.id)).toEqual(['cork-home'])
    expect(reply.summary).toContain('1 home')
  })

  it('recognises a property type and reports an honest empty result', () => {
    const reply = createConciergeReply('Detached homes in Dublin below 500k', properties)

    expect(reply.criteria.propertyType).toBe('detached')
    expect(reply.matches).toEqual([])
    expect(reply.summary).toContain('couldn’t find')
  })

  it('asks for useful criteria when a message has no property-search intent', () => {
    const reply = createConciergeReply('Hello there', properties)

    expect(reply.matches).toEqual([])
    expect(reply.canApply).toBe(false)
    expect(reply.summary).toContain('location')
  })
})

import { describe, expect, it } from 'vitest'
import type { Property } from './api/properties'
import { aggregateAreas, rankProperties, type MatchPreferences } from './propertyMatching'

const home = (overrides: Partial<Property>): Property => ({
  id: 'home',
  title: 'Sample home',
  addressLine1: '1 Main Street',
  city: 'Dublin',
  county: 'Dublin',
  priceCents: 55000000,
  bedrooms: 3,
  propertyType: 'detached',
  longitude: -6.26,
  latitude: 53.35,
  media: [{ url: '/home.webp', kind: 'image', altText: 'Home', position: 0 }],
  ...overrides,
})

const preferences: MatchPreferences = {
  maxPriceCents: 60000000,
  minimumBedrooms: 3,
  county: 'Dublin',
  budgetWeight: 4,
  spaceWeight: 3,
  mediaWeight: 2,
}

describe('property matching', () => {
  it('ranks a relevant affordable home ahead of a mismatched expensive home', () => {
    const relevant = home({ id: 'relevant', media: [
      { url: '/home.webp', kind: 'image', altText: 'Home', position: 0 },
      { url: '/plan.webp', kind: 'floor_plan', altText: 'Plan', position: 1 },
    ] })
    const mismatch = home({ id: 'mismatch', county: 'Cork', city: 'Cork', priceCents: 95000000, bedrooms: 2 })

    const ranked = rankProperties([mismatch, relevant], preferences)

    expect(ranked.map(result => result.property.id)).toEqual(['relevant', 'mismatch'])
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score)
    expect(ranked[0].signals.location).toBe(100)
    expect(ranked[0].reasons).toContain('Within your working budget')
  })

  it('uses a deterministic title order when homes have the same score and price', () => {
    const ranked = rankProperties([
      home({ id: 'b', title: 'Willow House' }),
      home({ id: 'a', title: 'Alder House' }),
    ], { ...preferences, county: 'Any' })

    expect(ranked.map(result => result.property.title)).toEqual(['Alder House', 'Willow House'])
  })

  it('aggregates a transparent county index from catalogue facts', () => {
    const areas = aggregateAreas([
      home({ id: 'one', priceCents: 50000000, media: [{ url: '/one.webp', kind: 'image', altText: 'One', position: 0 }] }),
      home({ id: 'two', priceCents: 70000000, media: [
        { url: '/two.webp', kind: 'image', altText: 'Two', position: 0 },
        { url: '/two-plan.webp', kind: 'floor_plan', altText: 'Plan', position: 1 },
        { url: '/two-tour', kind: 'panorama', altText: 'Tour', position: 2 },
      ] }),
      home({ id: 'three', county: 'Cork', city: 'Cork', priceCents: 40000000 }),
    ])

    expect(areas[0]).toMatchObject({ county: 'Dublin', inventory: 2, medianPriceCents: 60000000 })
    expect(areas[0].mediaReadiness).toBe(50)
    expect(areas[1].county).toBe('Cork')
  })
})

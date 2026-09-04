import { describe, expect, it } from 'vitest'
import { createPropertySearchIndex } from './propertySearch'

const homes = [
  { id: 'wicklow', title: 'Hillside Residence', addressLine1: 'Rocky Road', city: 'Wicklow', county: 'Wicklow' },
  { id: 'cork', title: 'Garden-view home', addressLine1: 'Douglas Road', city: 'Cork', county: 'Cork' },
  { id: 'dublin', title: 'Contemporary family home', addressLine1: 'Pembroke Road', city: 'Dublin 4', county: 'Dublin' },
]

describe('property search index', () => {
  it('matches words across the searchable property fields', () => {
    const index = createPropertySearchIndex(homes)

    expect(index.search('rocky')).toEqual(new Set(['wicklow']))
    expect(index.search('family dublin')).toEqual(new Set(['dublin']))
  })

  it('normalizes case, punctuation and accents', () => {
    const index = createPropertySearchIndex([
      ...homes,
      { id: 'accented', title: 'Dún Laoghaire home', addressLine1: 'Seafront', city: 'Dún Laoghaire', county: 'Dublin' },
    ])

    expect(index.search('DUN-LAOGHAIRE')).toEqual(new Set(['accented']))
  })

  it('returns every property for a blank query and supports short queries', () => {
    const index = createPropertySearchIndex(homes)

    expect(index.search('')).toEqual(new Set(['wicklow', 'cork', 'dublin']))
    expect(index.search('rk')).toEqual(new Set(['cork']))
  })
})

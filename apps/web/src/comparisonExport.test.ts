import { describe, expect, it } from 'vitest'
import type { Property } from './api/properties'
import { comparisonCSV } from './comparisonExport'

const home: Property = {
  id: 'home/1', title: 'Áras, "Garden"\nHouse', addressLine1: '1 Main Street',
  city: 'Wexford', county: 'Wexford', priceCents: 49500000, bedrooms: 4,
  propertyType: 'semi_detached', latitude: 52.3, longitude: -6.5, media: [],
}

describe('comparison CSV', () => {
  it('exports public facts with exact euro units, escaped copy and encoded links', () => {
    const csv = comparisonCSV([home], 'https://openhaus.example')
    expect(csv).toContain('"Asking price (EUR)"')
    expect(csv).toContain('"Áras, ""Garden""\nHouse"')
    expect(csv).toContain('"495000.00","4","Semi detached","0"')
    expect(csv).toContain('"https://openhaus.example/properties/home%2F1"')
    expect(csv.split('\r\n')).toHaveLength(3)
    expect(csv).not.toContain('latitude')
  })

  it.each(['=HYPERLINK("bad")', ' +SUM(1,2)', '\t@SUM(1)', '\r-1+1'])('neutralizes spreadsheet formulas: %s', (title) => {
    expect(comparisonCSV([{ ...home, title }], 'https://openhaus.example')).toContain(`"'${title.replaceAll('"', '""')}"`)
  })

  it('keeps selected order and exports only a header for an empty selection', () => {
    const csv = comparisonCSV([home, { ...home, title: 'Second home' }], 'https://openhaus.example')
    expect(csv.indexOf('Garden')).toBeLessThan(csv.indexOf('Second home'))
    expect(comparisonCSV([], 'https://openhaus.example').split('\r\n')).toHaveLength(2)
  })
})

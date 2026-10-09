import type { Property } from './api/properties'

function csvCell(value: string | number): string {
  const text = String(value)
  // Quoting alone does not stop spreadsheets interpreting a cell as a formula.
  let start = 0
  while (start < text.length && (text.charCodeAt(start) <= 32 || text[start].trim() === '')) start++
  const safe = start < text.length && '=+@-'.includes(text[start]) ? `'${text}` : text
  return `"${safe.replaceAll('"', '""')}"`
}

export function comparisonCSV(properties: Property[], origin: string): string {
  const rows: (string | number)[][] = [
    ['Property', 'Address', 'Area', 'County', 'Asking price (EUR)', 'Bedrooms', 'Home type', 'Media items', 'Property link'],
    ...properties.map((property) => [
      property.title, property.addressLine1, property.city, property.county,
      (property.priceCents / 100).toFixed(2), property.bedrooms,
      property.propertyType.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase()),
      property.media.length, `${origin}/properties/${encodeURIComponent(property.id)}`,
    ]),
  ]
  return '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

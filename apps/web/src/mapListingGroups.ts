import type { Property } from './api/properties'

export function groupPropertiesForMap(properties: Property[], selectedCounty?: string | null) {
  if (selectedCounty) {
    return properties.map((property) => ({
      label: property.title,
      markerLabel: compactPrice(property.priceCents),
      properties: [property],
      position: { lat: property.latitude, lng: property.longitude },
    }))
  }

  const groups = new Map<string, Property[]>()
  for (const property of properties) {
    groups.set(property.county, [...(groups.get(property.county) ?? []), property])
  }
  return [...groups.entries()].map(([label, groupedProperties]) => ({
    label,
    markerLabel: String(groupedProperties.length),
    properties: groupedProperties,
    position: {
      lat: groupedProperties.reduce((total, property) => total + property.latitude, 0) / groupedProperties.length,
      lng: groupedProperties.reduce((total, property) => total + property.longitude, 0) / groupedProperties.length,
    },
  }))
}

function compactPrice(priceCents: number) {
  const euros = priceCents / 100
  if (euros >= 1_000_000) return `€${(euros / 1_000_000).toFixed(euros % 1_000_000 ? 1 : 0)}m`
  return `€${Math.round(euros / 1_000)}k`
}

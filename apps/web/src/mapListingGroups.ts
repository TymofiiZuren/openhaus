import type { Property } from './api/properties'
import { areaForProperty } from './administrativeAreas'

export function groupPropertiesForMap(properties: Property[], selectedCounty?: string | null, selectedArea?: string) {
  if (selectedCounty && selectedArea) {
    return properties.map((property) => ({
      label: property.title,
      isProperty: true,
      markerLabel: compactPrice(property.priceCents),
      properties: [property],
      position: { lat: property.latitude, lng: property.longitude },
    }))
  }

  const groups = new Map<string, Property[]>()
  for (const property of properties) {
    const area = selectedCounty
      ? areaForProperty(property)?.name
      : property.county
    // Unresolved locations remain in the county results, but do not leak a
    // house pin into the area-selection step.
    if (!area) continue
    const group = groups.get(area)
    if (group) group.push(property)
    else groups.set(area, [property])
  }
  const markers = [...groups.entries()].map(([label, groupedProperties]) => ({
    label,
    isProperty: false,
    markerLabel: String(groupedProperties.length),
    properties: groupedProperties,
    position: {
      lat: groupedProperties.reduce((total, property) => total + property.latitude, 0) / groupedProperties.length,
      lng: groupedProperties.reduce((total, property) => total + property.longitude, 0) / groupedProperties.length,
    },
  }))
  return markers
}

function compactPrice(priceCents: number) {
  const euros = priceCents / 100
  if (euros >= 1_000_000) return `€${(euros / 1_000_000).toFixed(euros % 1_000_000 ? 1 : 0)}m`
  return `€${Math.round(euros / 1_000)}k`
}

export type PropertyMedia = {
  url: string
  kind: 'image' | 'floor_plan' | 'panorama' | 'video'
  altText: string
  position: number
}

export type Property = {
  id: string
  title: string
  addressLine1: string
  city: string
  county: string
  priceCents: number
  bedrooms: number
  propertyType: string
  longitude: number
  latitude: number
  media: PropertyMedia[]
}

type PropertiesResponse = { properties: Property[] }

export async function fetchProperties(signal?: AbortSignal): Promise<Property[]> {
  // Let the browser retain a representation, but revalidate on every request.
  // It combines a 304 with the stored body; publication changes remain immediate.
  const response = await fetch('/api/v1/properties', { cache: 'no-cache', headers: { Accept: 'application/json' }, signal })
  if (!response.ok) throw new Error(`Property request failed with status ${response.status}`)
  const body = (await response.json()) as PropertiesResponse
  if (!Array.isArray(body.properties)) throw new Error('Property response is invalid')
  return body.properties
}

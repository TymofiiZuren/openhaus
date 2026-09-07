import type { Property } from './properties'

type SavedPropertiesResponse = { properties: Property[] }

export async function fetchClientSavedProperties(signal?: AbortSignal): Promise<Property[]> {
  const response = await fetch('/api/v1/client/saved-properties', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' }, signal })
  if (response.status === 401) throw new Error('authentication_required')
  if (!response.ok) throw new Error('saved_properties_unavailable')
  const body = (await response.json()) as SavedPropertiesResponse
  if (!Array.isArray(body.properties)) throw new Error('invalid_saved_properties')
  return body.properties
}

export async function saveClientProperty(propertyID: string): Promise<void> {
  const response = await fetch(`/api/v1/client/saved-properties/${encodeURIComponent(propertyID)}`, { method: 'PUT', credentials: 'same-origin' })
  if (!response.ok) throw new Error('save_property_failed')
}

export async function removeClientSavedProperty(propertyID: string): Promise<void> {
  const response = await fetch(`/api/v1/client/saved-properties/${encodeURIComponent(propertyID)}`, { method: 'DELETE', credentials: 'same-origin' })
  if (!response.ok) throw new Error('remove_property_failed')
}

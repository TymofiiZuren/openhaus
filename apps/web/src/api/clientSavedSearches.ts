export type ClientSavedSearch = {
  id: string
  location: string
  county?: string
  area?: string
  query?: string
  minimumBedrooms: number
  propertyType: string
  maximumPrice: number
  spatialOnly: boolean
  frequency: 'instant' | 'daily' | 'weekly'
  createdAt: string
}

export type ClientSavedSearchInput = Omit<ClientSavedSearch, 'id' | 'createdAt'>

function parseSearch(value: unknown): ClientSavedSearch {
  const item = value as Partial<ClientSavedSearch> | null
  if (!item || typeof item.id !== 'string' || typeof item.location !== 'string' || typeof item.minimumBedrooms !== 'number' ||
    typeof item.propertyType !== 'string' || typeof item.maximumPrice !== 'number' || typeof item.spatialOnly !== 'boolean' ||
    !['instant', 'daily', 'weekly'].includes(item.frequency ?? '') || typeof item.createdAt !== 'string') throw new Error('invalid_saved_search')
  return item as ClientSavedSearch
}

export async function createClientSavedSearch(input: ClientSavedSearchInput): Promise<ClientSavedSearch> {
  const response = await fetch('/api/v1/client/saved-searches', {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(input),
  })
  if (response.status === 401) throw new Error('authentication_required')
  if (!response.ok) throw new Error('save_search_failed')
  return parseSearch((await response.json() as { search?: unknown }).search)
}

export async function fetchClientSavedSearches(signal?: AbortSignal): Promise<ClientSavedSearch[]> {
  const response = await fetch('/api/v1/client/saved-searches', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' }, signal })
  if (response.status === 401) throw new Error('authentication_required')
  if (!response.ok) throw new Error('saved_searches_unavailable')
  const searches = (await response.json() as { searches?: unknown }).searches
  if (!Array.isArray(searches)) throw new Error('invalid_saved_searches')
  return searches.map(parseSearch)
}

export async function removeClientSavedSearch(searchID: string): Promise<void> {
  const response = await fetch(`/api/v1/client/saved-searches/${encodeURIComponent(searchID)}`, { method: 'DELETE', credentials: 'same-origin' })
  if (!response.ok) throw new Error('remove_saved_search_failed')
}

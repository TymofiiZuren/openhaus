import type { Property } from './properties'

export type ManagedProperty = Property & {
  status: 'draft' | 'published' | 'archived'
}

export type ManagedPropertyInput = Omit<ManagedProperty, 'id' | 'media'>

type ManagedPropertiesResponse = { properties: ManagedProperty[] }

export class ManagerAuthenticationError extends Error {}

export async function fetchManagedProperties(signal?: AbortSignal): Promise<ManagedProperty[]> {
  const response = await fetch('/api/v1/manager/properties', signal ? { signal } : undefined)
  if (response.status === 401) throw new ManagerAuthenticationError('Manager authentication is required')
  if (!response.ok) throw new Error(`Manager property request failed with status ${response.status}`)
  const body = (await response.json()) as ManagedPropertiesResponse
  if (!Array.isArray(body.properties)) throw new Error('Manager property response is invalid')
  return body.properties
}

export async function loginManager(email: string, password: string): Promise<void> {
  const response = await fetch('/api/v1/manager/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (response.status === 401) throw new ManagerAuthenticationError('Email or password is incorrect')
  if (!response.ok) throw new Error(`Manager login failed with status ${response.status}`)
}

export async function logoutManager(): Promise<void> {
  const response = await fetch('/api/v1/manager/session', { method: 'DELETE' })
  if (!response.ok) throw new Error(`Manager logout failed with status ${response.status}`)
}

export async function createManagedProperty(input: ManagedPropertyInput): Promise<ManagedProperty> {
  return mutateManagedProperty('/api/v1/manager/properties', 'POST', input)
}

export async function updateManagedProperty(id: string, input: ManagedPropertyInput): Promise<ManagedProperty> {
  return mutateManagedProperty(`/api/v1/manager/properties/${id}`, 'PUT', input)
}

async function mutateManagedProperty(url: string, method: 'POST' | 'PUT', input: ManagedPropertyInput) {
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(input),
  })
  if (response.status === 401) throw new ManagerAuthenticationError('Manager authentication is required')
  if (!response.ok) throw new Error(`Manager property mutation failed with status ${response.status}`)
  return (await response.json()) as ManagedProperty
}

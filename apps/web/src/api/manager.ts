import type { Property } from './properties'

export type ManagedProperty = Property & {
  status: 'draft' | 'published' | 'archived'
}

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

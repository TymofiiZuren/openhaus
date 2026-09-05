import type { Property } from './properties'

export type ManagedProperty = Property & {
  status: 'draft' | 'published' | 'archived'
}

export type ManagedPropertyInput = Omit<ManagedProperty, 'id' | 'media'>
export type ManagerIdentity = { id: string; email: string }

type ManagedPropertiesResponse = { properties: ManagedProperty[] }

export class ManagerAuthenticationError extends Error {}
export class ManagerPasswordError extends Error {}

export async function fetchManagedProperties(signal?: AbortSignal): Promise<ManagedProperty[]> {
  const response = await fetch('/api/v1/manager/properties', signal ? { signal } : undefined)
  if (response.status === 401) throw new ManagerAuthenticationError('Manager authentication is required')
  if (!response.ok) throw new Error(`Manager property request failed with status ${response.status}`)
  const body = (await response.json()) as ManagedPropertiesResponse
  if (!Array.isArray(body.properties)) throw new Error('Manager property response is invalid')
  return body.properties
}

export async function loginManager(email: string, password: string): Promise<ManagerIdentity> {
  const response = await fetch('/api/v1/manager/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (response.status === 401) throw new ManagerAuthenticationError('Email or password is incorrect')
  if (!response.ok) throw new Error(`Manager login failed with status ${response.status}`)
  const body = await response.json() as { manager?: ManagerIdentity }
  if (typeof body.manager?.id !== 'string' || typeof body.manager.email !== 'string') throw new Error('Manager session response is invalid')
  return body.manager
}

export async function fetchManagerSession(signal?: AbortSignal): Promise<ManagerIdentity> {
  const response = await fetch('/api/v1/manager/session', { credentials: 'same-origin', cache: 'no-store', signal })
  if (response.status === 401) throw new ManagerAuthenticationError('Manager authentication is required')
  if (!response.ok) throw new Error(`Manager session request failed with status ${response.status}`)
  const body = await response.json() as { manager?: ManagerIdentity }
  if (typeof body.manager?.id !== 'string' || typeof body.manager.email !== 'string') throw new Error('Manager session response is invalid')
  return body.manager
}

export async function logoutManager(): Promise<void> {
  const response = await fetch('/api/v1/manager/session', { method: 'DELETE' })
  if (!response.ok) throw new Error(`Manager logout failed with status ${response.status}`)
}

export async function changeManagerPassword(currentPassword: string, newPassword: string): Promise<void> {
  const response = await fetch('/api/v1/manager/password', {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ currentPassword, newPassword }),
  })
  if (response.status === 401) throw new ManagerPasswordError('The current password is incorrect.')
  if (response.status === 400) throw new ManagerPasswordError('Use a password between 12 and 72 characters.')
  if (!response.ok) throw new Error(`Manager password update failed with status ${response.status}`)
}

export async function logoutAllManagerSessions(): Promise<void> {
  const response = await fetch('/api/v1/manager/sessions', {
    method: 'DELETE',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  })
  if (response.status === 401) throw new ManagerAuthenticationError('Manager authentication is required')
  if (!response.ok) throw new Error(`Manager session revocation failed with status ${response.status}`)
}

export async function createManagedProperty(input: ManagedPropertyInput): Promise<ManagedProperty> {
  return mutateManagedProperty('/api/v1/manager/properties', 'POST', input)
}

export async function updateManagedProperty(id: string, input: ManagedPropertyInput): Promise<ManagedProperty> {
  return mutateManagedProperty(`/api/v1/manager/properties/${id}`, 'PUT', input)
}

export async function attachPropertyPanorama(id: string, shareUrl: string, altText: string): Promise<Property['media'][number]> {
  const response = await fetch(`/api/v1/manager/properties/${id}/panorama`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ shareUrl, altText }),
  })
  if (response.status === 401) throw new ManagerAuthenticationError('Manager authentication is required')
  if (!response.ok) throw new Error(`Panorama update failed with status ${response.status}`)
  return (await response.json()) as Property['media'][number]
}

export async function removePropertyPanorama(id: string): Promise<void> {
  const response = await fetch(`/api/v1/manager/properties/${id}/panorama`, {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  })
  if (response.status === 401) throw new ManagerAuthenticationError('Manager authentication is required')
  if (!response.ok) throw new Error(`Panorama removal failed with status ${response.status}`)
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

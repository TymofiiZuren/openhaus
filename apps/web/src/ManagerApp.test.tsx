import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ManagerApp } from './ManagerApp'

const managedProperty = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Red-brick home near St Stephen\'s Green',
  addressLine1: '14 Leeson Park',
  city: 'Dublin',
  county: 'Dublin',
  priceCents: 89500000,
  bedrooms: 4,
  propertyType: 'terraced',
  longitude: -6.2527,
  latitude: 53.332,
  media: [],
  status: 'draft',
}

afterEach(() => vi.restoreAllMocks())

describe('manager application', () => {
  it('signs in and opens the protected listing dashboard', async () => {
    let signedIn = false
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (String(input) === '/api/v1/manager/properties' && !signedIn) {
        return new Response(null, { status: 401 })
      }
      if (String(input) === '/api/v1/manager/session' && init?.method === 'POST') {
        signedIn = true
        return Response.json({ manager: { id: 'manager-1', email: 'manager@openhaus.ie' } })
      }
      return Response.json({ properties: [managedProperty] })
    })
    const user = userEvent.setup()

    render(<ManagerApp />)

    await user.type(await screen.findByLabelText('Email address'), 'manager@openhaus.ie')
    await user.type(screen.getByLabelText('Password'), 'correct horse battery staple')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('heading', { name: 'Your properties' })).toBeVisible()
    expect(screen.getByRole('heading', { name: managedProperty.title })).toBeVisible()
    expect(screen.getByText('Draft')).toBeVisible()
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/manager/session', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ email: 'manager@openhaus.ie', password: 'correct horse battery staple' }),
    }))
  })

  it('shows a safe error when credentials are rejected', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 401 }))
    const user = userEvent.setup()

    render(<ManagerApp />)
    await user.type(await screen.findByLabelText('Email address'), 'manager@openhaus.ie')
    await user.type(screen.getByLabelText('Password'), 'wrong password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect')
  })

  it('logs out and returns to the login form', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (String(input) === '/api/v1/manager/session' && init?.method === 'DELETE') {
        return new Response(null, { status: 204 })
      }
      return Response.json({ properties: [managedProperty] })
    })
    const user = userEvent.setup()

    render(<ManagerApp />)
    await user.click(await screen.findByRole('button', { name: 'Sign out' }))

    expect(await screen.findByRole('heading', { name: 'Manager sign in' })).toBeVisible()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/v1/manager/session', { method: 'DELETE' }))
  })
})

import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ClientApp } from './ClientApp'

afterEach(() => vi.unstubAllGlobals())
const response = (status: number, body = {}) => new Response(JSON.stringify(body), { status })
function api(...responses: Response[]) {
  const fetcher = vi.fn()
  responses.forEach(value => fetcher.mockResolvedValueOnce(value))
  vi.stubGlobal('fetch', fetcher)
  return fetcher
}
function credentials() {
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'buyer@example.test' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: crypto.randomUUID() } })
}
it('does not offer a broken form when accounts are disabled', async () => {
  api(response(404))
  render(<ClientApp />)
  expect(await screen.findByText('Client accounts are not enabled.')).toBeInTheDocument()
  expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
})
it('signs in through the cookie-backed API and signs out', async () => {
  const fetcher = api(response(401), response(200, { client: { id: 'buyer', email: 'buyer@example.test' } }), response(200, { properties: [] }), new Response(null, { status: 204 }))
  render(<ClientApp />)
  await screen.findByLabelText('Email address')
  credentials()
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
  expect(await screen.findByRole('heading', { name: 'Your client account.' })).toBeInTheDocument()
  expect(fetcher.mock.calls[1][0]).toBe('/api/v1/client/session')
  expect(fetcher.mock.calls[1][1].credentials).toBe('same-origin')
  await screen.findByText(/No account-saved homes yet/)
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
  expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument()
})
it('does not claim registration has verified identity or signed in', async () => {
  api(response(401), response(202))
  render(<ClientApp pathname="/client/register" />)
  await screen.findByLabelText('Email address')
  credentials()
  fireEvent.click(screen.getByRole('button', { name: 'Create development account' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Registration processed')
  expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
})
it('preserves the email and explains failed sign-in', async () => {
  api(response(401), response(401))
  render(<ClientApp />)
  await screen.findByLabelText('Email address')
  credentials()
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Email or password was not accepted')
  expect(screen.getByLabelText('Email address')).toHaveValue('buyer@example.test')
})
it('offers a retry after a connection failure', async () => {
  const fetcher = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce(response(401))
  vi.stubGlobal('fetch', fetcher)
  render(<ClientApp />)
  fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))
  expect(await screen.findByLabelText('Email address')).toBeInTheDocument()
})

it('restores an existing session and keeps the account visible if sign-out fails', async () => {
  api(response(200, { client: { id: 'buyer', email: 'buyer@example.test' } }), response(200, { properties: [] }), response(503))
  render(<ClientApp />)
  expect(await screen.findByRole('heading', { name: 'buyer@example.test' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Account options' })).toHaveTextContent('My account')
  expect(screen.queryByRole('button', { name: 'Sign in options' })).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
  await screen.findByText(/No account-saved homes yet/)
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
  expect(await screen.findByText(/could not confirm sign-out/)).toBeVisible()
  expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
})

it('shows account identity and changes the password before requiring sign-in again', async () => {
  const fetcher = api(
    response(200, { client: { id: 'buyer-identifier', email: 'buyer@example.test' } }),
    response(200, { properties: [] }),
    new Response(null, { status: 204 }),
  )
  render(<ClientApp />)

  expect(await screen.findByRole('region', { name: 'Account overview' })).toBeVisible()
  expect(screen.getByRole('navigation', { name: 'Account shortcuts' })).toBeVisible()
  expect(await screen.findByText('OH-BUYERIDE')).toHaveAttribute('title', 'buyer-identifier')
  expect(screen.getByRole('heading', { name: 'buyer@example.test' })).toBeVisible()
  expect(screen.getByRole('link', { name: 'Download my account data' })).toHaveAttribute('href', '/api/v1/client/export')
  fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'old password phrase' } })
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new password phrase' } })
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'new password phrase' } })
  fireEvent.click(screen.getByRole('button', { name: 'Change password' }))

  expect(await screen.findByRole('status')).toHaveTextContent('Password updated')
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeVisible()
  expect(fetcher.mock.calls[2][0]).toBe('/api/v1/client/password')
  expect(fetcher.mock.calls[2][1]).toMatchObject({ method: 'PUT', credentials: 'same-origin' })
})

it('requires explicit confirmation and the current password before deleting the buyer account', async () => {
  const fetcher = api(
    response(200, { client: { id: 'buyer-identifier', email: 'buyer@example.test' } }),
    response(200, { properties: [] }),
    new Response(null, { status: 204 }),
  )
  render(<ClientApp />)

  await screen.findByRole('heading', { name: 'buyer@example.test' })
  fireEvent.change(screen.getByLabelText('Current password for account deletion'), { target: { value: 'correct horse battery staple' } })
  fireEvent.change(screen.getByLabelText('Type DELETE to confirm'), { target: { value: 'DELETE' } })
  fireEvent.click(screen.getByRole('button', { name: 'Delete my account permanently' }))

  expect(await screen.findByRole('status')).toHaveTextContent('account has been deleted')
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeVisible()
  expect(fetcher.mock.calls[2][0]).toBe('/api/v1/client/account')
  expect(fetcher.mock.calls[2][1]).toMatchObject({ method: 'DELETE', credentials: 'same-origin' })
})

it('shows account-owned saved properties', async () => {
  api(response(200, { client: { id: 'buyer', email: 'buyer@example.test' } }), response(200, { properties: [{ id: 'home-one', title: 'Garden home', city: 'Cork', county: 'Cork', priceCents: 72500000, bedrooms: 4, propertyType: 'detached', longitude: -8.4, latitude: 51.9, media: [] }] }))
  render(<ClientApp />)

  expect(await screen.findByText('Garden home')).toBeVisible()
  expect(screen.getByRole('link', { name: 'View home' })).toHaveAttribute('href', '/properties/home-one')
})

it('loads and removes account-owned saved searches on demand', async () => {
  const fetcher = api(
    response(200, { client: { id: 'buyer', email: 'buyer@example.test' } }),
    response(200, { properties: [] }),
    response(200, { searches: [{ id: '22222222-2222-4222-8222-222222222222', location: 'Cork', county: 'Cork', minimumBedrooms: 3, propertyType: 'detached', maximumPrice: 80000000, spatialOnly: false, frequency: 'daily', createdAt: new Date().toISOString() }] }),
    new Response(null, { status: 204 }),
  )
  render(<ClientApp />)

  await screen.findByText(/No account-saved homes yet/)
  fireEvent.click(await screen.findByRole('button', { name: 'Load saved searches' }))
  expect(await screen.findByText('Cork')).toBeVisible()
  expect(screen.getByText(/3\+ bedrooms.*detached.*daily/i)).toBeVisible()
  expect(screen.getByRole('link', { name: 'View results' })).toHaveAttribute('href', '/?county=Cork&beds=3&type=detached&maxPrice=800000#homes')
  fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Saved search removed')
  expect(fetcher.mock.calls[3][0]).toContain('/api/v1/client/saved-searches/22222222-2222-4222-8222-222222222222')
})

it('imports the browser comparison into the signed-in account', async () => {
  localStorage.setItem('openhaus:comparison:v1', '["11111111-1111-4111-8111-111111111111"]')
  const fetcher = api(
    response(200, { client: { id: 'buyer', email: 'buyer@example.test' } }),
    response(200, { properties: [] }),
    new Response(null, { status: 204 }),
    response(200, { properties: [] }),
  )
  render(<ClientApp />)
  fireEvent.click(await screen.findByRole('button', { name: 'Import browser comparison' }))

  expect(await screen.findByRole('status')).toHaveTextContent('1 home saved')
  expect(fetcher.mock.calls[2][0]).toContain('/api/v1/client/saved-properties/11111111-1111-4111-8111-111111111111')
  localStorage.clear()
})

it('explains rate limits without claiming sign-in succeeded', async () => {
  api(response(401), response(429))
  render(<ClientApp />)
  await screen.findByLabelText('Email address')
  credentials()
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Wait 15 minutes')
  expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
})

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

  it('creates a draft listing from the manager workspace', async () => {
	const properties = [managedProperty]
	const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		if (String(input) === '/api/v1/manager/properties' && init?.method === 'POST') {
			const submitted = JSON.parse(String(init.body))
			const created = { ...submitted, id: 'new-property', status: 'draft', media: [] }
			properties.push(created)
			return Response.json(created, { status: 201 })
		}
		return Response.json({ properties })
	})
	const user = userEvent.setup()

	render(<ManagerApp />)
	await user.click(await screen.findByRole('button', { name: 'Add property' }))
	await user.type(screen.getByLabelText('Listing title'), 'Harbour home')
	await user.type(screen.getByLabelText('Address'), '1 Pier Road')
	await user.type(screen.getByLabelText('City'), 'Kinsale')
	await user.type(screen.getByLabelText('County'), 'Cork')
	await user.type(screen.getByLabelText('Price in euro'), '725000')
	await user.type(screen.getByLabelText('Bedrooms'), '3')
	await user.selectOptions(screen.getByLabelText('Property type'), 'terraced')
	await user.type(screen.getByLabelText('Longitude'), '-8.53')
	await user.type(screen.getByLabelText('Latitude'), '51.7')
	await user.click(screen.getByRole('button', { name: 'Create draft' }))

	expect(await screen.findByRole('heading', { name: 'Harbour home' })).toBeVisible()
	expect(fetchMock).toHaveBeenCalledWith('/api/v1/manager/properties', expect.objectContaining({ method: 'POST' }))
  })

  it('edits and publishes an existing listing', async () => {
	let current = { ...managedProperty }
	const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		if (String(input).endsWith(`/manager/properties/${managedProperty.id}`) && init?.method === 'PUT') {
			current = { ...current, ...JSON.parse(String(init.body)) }
			return Response.json(current)
		}
		return Response.json({ properties: [current] })
	})
	const user = userEvent.setup()

	render(<ManagerApp />)
	await user.click(await screen.findByRole('button', { name: `Edit ${managedProperty.title}` }))
	await user.clear(screen.getByLabelText('Listing title'))
	await user.type(screen.getByLabelText('Listing title'), 'Published city home')
	await user.selectOptions(screen.getByLabelText('Publication status'), 'published')
	await user.click(screen.getByRole('button', { name: 'Save changes' }))

	expect(await screen.findByRole('heading', { name: 'Published city home' })).toBeVisible()
	expect(screen.getAllByText('Published').some((element) => element.classList.contains('manager-status-published'))).toBe(true)
	expect(fetchMock).toHaveBeenCalledWith(`/api/v1/manager/properties/${managedProperty.id}`, expect.objectContaining({ method: 'PUT' }))
  })

  it('uploads and processes video through authenticated manager routes', async () => {
	const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		const url = String(input)
		if (url.endsWith('/videos') && init?.method === 'POST') return Response.json({ id: 'job-1', propertyId: managedProperty.id, status: 'pending', attempts: 0, createdAt: '2026-08-28T00:00:00Z' }, { status: 202 })
		if (url.endsWith('/media-jobs/job-1')) return Response.json({ id: 'job-1', propertyId: managedProperty.id, status: 'ready', attempts: 1, createdAt: '2026-08-28T00:00:00Z' })
		return Response.json({ properties: [managedProperty] })
	})
	const user = userEvent.setup()
	render(<ManagerApp />)
	await user.upload(await screen.findByLabelText(`Choose video for ${managedProperty.title}`), new File(['video'], 'tour.mp4', { type: 'video/mp4' }))
	await user.click(screen.getByRole('button', { name: 'Upload video' }))
	expect(await screen.findByText('Video tour ready.')).toBeVisible()
	expect(fetchMock).toHaveBeenCalledWith(`/api/v1/manager/properties/${managedProperty.id}/videos`, expect.objectContaining({ method: 'POST' }))
  })
})

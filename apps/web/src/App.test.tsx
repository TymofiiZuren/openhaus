import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const property = {
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
  media: [
    {
      url: '/media/properties/leeson-park/exterior-front.webp',
      kind: 'image',
      altText: 'Front exterior of the home',
      position: 0,
    },
    {
      url: '/media/properties/leeson-park/living-room.webp',
      kind: 'image',
      altText: 'Bright open-plan living room',
      position: 1,
    },
    {
      url: '/media/properties/leeson-park/floor-plan.webp',
      kind: 'floor_plan',
      altText: 'Measured floor plan of the property',
      position: 2,
    },
    {
      url: '/media/properties/leeson-park/tour.mp4',
      kind: 'video',
      altText: 'Video tour of the property',
      position: 3,
    },
  ],
}

const corkProperty = {
  ...property,
  id: '22222222-2222-4222-8222-222222222222',
  title: 'Garden-view contemporary residence',
  addressLine1: 'Douglas',
  city: 'Cork',
  county: 'Cork',
  longitude: -8.4932,
  latitude: 51.9045,
  media: [{
    url: '/media/properties/douglas-cork/exterior.webp',
    kind: 'image' as const,
    altText: 'Exterior of the Cork property',
    position: 0,
  }],
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('property catalogue', () => {
  it('shows a loading state while properties are requested', () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}))

    render(<App />)

    expect(screen.getByRole('status')).toHaveTextContent('Loading homes')
  })

  it('renders properties returned by the API', async () => {
    mockResponse({ properties: [property] })

    render(<App />)

    expect(await screen.findByRole('heading', { name: property.title })).toBeVisible()
    expect(screen.getByText('€895,000')).toBeVisible()
    expect(screen.getByText('4 bedrooms')).toBeVisible()
    expect(screen.getByText('Terraced')).toBeVisible()
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/properties?bbox=-10.68124,51.4199,-5.99629,55.44685',
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    )
  })

  it('lets buyers explore listings by county and city on the Ireland map', async () => {
    mockResponse({ properties: [property, corkProperty] })
    const user = userEvent.setup()

    render(<App />)

    const map = await screen.findByRole('region', { name: 'Explore homes by location' })
    expect(map).toBeVisible()
    expect(within(map).queryByRole('button', { name: /on map$/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cork, 1 home' }))

    expect(screen.getByRole('heading', { name: 'Cork' })).toBeVisible()
    expect(within(map).getByText('1 home')).toBeVisible()
    expect(screen.getByRole('button', { name: 'View Cork on street map' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'View Cork on street map' }))
    expect(await screen.findByRole('region', { name: 'Street map of Cork' })).toBeVisible()
    expect(screen.getByText('1 property in Cork')).toBeVisible()
    expect(await screen.findByText('The interactive map is unavailable in this browser.')).toBeVisible()
    expect(screen.getByRole('region', { name: 'Raster street map of Cork' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Back to Ireland' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: `View ${corkProperty.title} on street map` }))
    const streetMap = screen.getByRole('region', { name: 'Street map of Cork' })
    expect(within(streetMap).getByRole('heading', { name: corkProperty.title })).toBeVisible()
    expect(within(streetMap).getByRole('link', { name: 'View property' })).toHaveAttribute(
      'href', `#property-${corkProperty.id}`,
    )
  })

  it('requests the new geographic bounds when the buyer zooms the map', async () => {
    mockResponse({ properties: [property, corkProperty] })
    const user = userEvent.setup()

    render(<App />)
    await screen.findByRole('region', { name: 'Explore homes by location' })
    await user.click(screen.getByRole('button', { name: 'Zoom in' }))

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    const secondURL = vi.mocked(fetch).mock.calls[1][0]
    expect(secondURL).toMatch(/^\/api\/v1\/properties\?bbox=/)
    expect(secondURL).not.toBe('/api/v1/properties?bbox=-10.68124,51.4199,-5.99629,55.44685')
    const firstOptions = vi.mocked(fetch).mock.calls[0][1]
    expect(firstOptions?.signal).toBeInstanceOf(AbortSignal)
    expect(firstOptions?.signal?.aborted).toBe(true)
  })

  it('lets the buyer browse all media for a property', async () => {
    mockResponse({ properties: [property] })
    const user = userEvent.setup()

    render(<App />)

    expect(await screen.findByRole('img', { name: 'Front exterior of the home' })).toBeVisible()
    expect(screen.getByText('1 / 4')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'View Bright open-plan living room' }))

    expect(screen.getByRole('img', { name: 'Bright open-plan living room' })).toBeVisible()
    expect(screen.getByText('2 / 4')).toBeVisible()
  })

  it('shows native video controls when the buyer selects a video tour', async () => {
    mockResponse({ properties: [property] })
    const user = userEvent.setup()

    render(<App />)
    await screen.findByRole('img', { name: 'Front exterior of the home' })

    await user.click(screen.getByRole('button', { name: 'View Video tour of the property' }))

    const video = screen.getByLabelText('Video tour of the property')
    expect(video.tagName).toBe('VIDEO')
    expect(video).toHaveAttribute('controls')
    expect(video.querySelector('source')).toHaveAttribute('src', '/media/properties/leeson-park/tour.mp4')
  })

  it('uploads a video tour and reports when processing is complete', async () => {
	const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		const url = String(input)
		if (url.includes('/videos') && init?.method === 'POST') {
			return Response.json({
				id: 'job-1', propertyId: property.id, status: 'pending', attempts: 0,
				createdAt: '2026-08-25T00:00:00Z',
			}, { status: 202 })
		}
		if (url.includes('/media-jobs/job-1')) {
			return Response.json({
				id: 'job-1', propertyId: property.id, status: 'ready', attempts: 1,
				outputPath: '/media/uploads/job-1.mp4', createdAt: '2026-08-25T00:00:00Z',
			})
		}
		return Response.json({ properties: [property] })
	})
	const user = userEvent.setup()

	render(<App />)
	await screen.findByRole('heading', { name: property.title })
	await user.click(screen.getByRole('button', { name: `Add a video tour for ${property.title}` }))
	const file = new File(['\x00\x00\x00\x18ftypisomvideo'], 'house-tour.mp4', { type: 'video/mp4' })
	await user.upload(screen.getByLabelText('Choose an MP4 or MOV video'), file)
	await user.click(screen.getByRole('button', { name: 'Upload video' }))

	expect(await screen.findByRole('status')).toHaveTextContent('Video tour ready')
	expect(fetchMock).toHaveBeenCalledWith(
		`/api/v1/properties/${property.id}/videos`,
		expect.objectContaining({ method: 'POST' }),
	)
  })

	it('rejects an unsupported video before making an upload request', async () => {
		const fetchMock = mockResponse({ properties: [property] })
		const user = userEvent.setup({ applyAccept: false })

		render(<App />)
		await screen.findByRole('heading', { name: property.title })
		await user.click(screen.getByRole('button', { name: `Add a video tour for ${property.title}` }))
		await user.upload(
			screen.getByLabelText('Choose an MP4 or MOV video'),
			new File(['text'], 'notes.txt', { type: 'text/plain' }),
		)

		expect(screen.getByRole('alert')).toHaveTextContent('Choose an MP4 or MOV video')
		expect(fetchMock).toHaveBeenCalledTimes(1)
	})

  it('falls back safely when a property has no media', async () => {
    mockResponse({ properties: [{ ...property, media: [] }] })

    render(<App />)

    expect(await screen.findByRole('img', { name: 'No property photograph available' })).toBeVisible()
  })

  it('shows an empty state when no published homes exist', async () => {
    mockResponse({ properties: [] })

    render(<App />)

    expect(await screen.findByText('No homes are listed yet.')).toBeVisible()
  })

  it('shows an error and retries the request', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ properties: [property] }))
    const user = userEvent.setup()

    render(<App />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We could not load the homes.',
    )

    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('heading', { name: property.title })).toBeVisible()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })
})

function mockResponse(body: unknown) {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(() => Promise.resolve(Response.json(body, { status: 200 })))
}

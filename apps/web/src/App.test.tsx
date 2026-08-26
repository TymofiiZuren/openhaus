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
  addressLine1: 'Douglas, Cork',
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

const kinsaleProperty = {
  ...corkProperty,
  id: '33333333-3333-4333-8333-333333333333',
  title: 'Harbour-edge townhouse',
  addressLine1: 'Compass Hill',
  city: 'Kinsale',
  longitude: -8.5306,
  latitude: 51.7059,
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  window.history.replaceState({}, '', '/')
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
      '/api/v1/properties',
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    )
  })

  it('filters the location explorer and catalogue by county and restores all Ireland', async () => {
    mockResponse({ properties: [property, corkProperty] })
    const user = userEvent.setup()

    render(<App />)

    const explorer = await screen.findByRole('region', { name: 'Explore homes by location' })
    expect(explorer).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Explore Cork, 1 property' }))

    expect(screen.getByRole('heading', { name: corkProperty.title })).toBeVisible()
    expect(screen.queryByRole('heading', { name: property.title })).not.toBeInTheDocument()
    expect(within(explorer).getByText('1 home for sale')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Explore Cork City, 1 property' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'All Ireland' }))
    expect(screen.getByRole('heading', { name: property.title })).toBeVisible()
    expect(screen.getByRole('heading', { name: corkProperty.title })).toBeVisible()
  })

  it('does not expose property markers until a county is selected', async () => {
    mockResponse({ properties: [property, corkProperty] })

    render(<App />)

    const explorer = await screen.findByRole('region', { name: 'Explore homes by location' })
    expect(within(explorer).getByText('Choose a county to see homes and local areas')).toBeVisible()
    expect(within(explorer).queryByText('Areas')).not.toBeInTheDocument()
    expect(within(explorer).queryByRole('button', { name: /Explore Dublin City/ })).not.toBeInTheDocument()
  })

  it('lets a buyer search available counties and towns without relying on a map', async () => {
    mockResponse({ properties: [property, corkProperty] })
    const user = userEvent.setup()

    render(<App />)

    const search = await screen.findByRole('searchbox', { name: 'Search locations' })
    await user.type(search, 'douglas')

    expect(screen.getByRole('button', { name: 'Explore Cork, 1 property' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Explore Dublin, 1 property' })).not.toBeInTheDocument()
  })

  it('drills from a county into its administrative areas and filters the location panel', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', '')
    mockResponse({ properties: [property, corkProperty, kinsaleProperty] })
    const user = userEvent.setup()

    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Explore Cork, 2 properties' }))
    expect(screen.getByRole('button', { name: 'Explore Dublin, 1 property' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Explore Cork, 2 properties' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Show all Cork areas, 2 properties' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Explore Cork City, 1 property' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Explore Cork County, 1 property' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Explore Cork County, 1 property' }))

    expect(screen.getByRole('heading', { name: 'Homes in Cork County' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Explore Cork County, 1 property' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Explore Cork City, 1 property' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Show all Cork areas, 2 properties' })).toBeVisible()
    expect(screen.getByRole('heading', { name: kinsaleProperty.title })).toBeVisible()
    expect(screen.queryByRole('heading', { name: corkProperty.title })).not.toBeInTheDocument()
  })

  it('returns an unavailable county URL to the useful Ireland overview', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', '')
    window.history.replaceState({}, '', '/?county=Galway')
    mockResponse({ properties: [property, corkProperty] })

    render(<App />)

    await waitFor(() => expect(screen.getByRole('button', { name: 'All Ireland' })).toHaveAttribute('aria-pressed', 'true'))
    expect(screen.queryByRole('button', { name: /Explore Galway/ })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: property.title })).toBeVisible()
    expect(screen.getByRole('heading', { name: corkProperty.title })).toBeVisible()
    await waitFor(() => expect(window.location.search).toBe(''))
  })

  it('keeps location browsing usable when Google Maps is not configured', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', '')
    mockResponse({ properties: [property] })

    render(<App />)

    expect(await screen.findByText('Map view is unavailable right now.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Explore Dublin, 1 property' })).toBeVisible()
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

	expect(await screen.findByText('Video tour ready.')).toBeVisible()
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

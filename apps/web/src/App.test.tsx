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
  priceCents: 72500000,
  bedrooms: 3,
  propertyType: 'detached',
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
  it('filters homes from the search workspace and keeps map results in sync', async () => {
    mockResponse({ properties: [property, corkProperty] })
    const user = userEvent.setup()

    render(<App />)

    const search = await screen.findByRole('searchbox', { name: 'Search homes' })
    await user.type(search, 'Garden-view')

    expect(screen.getByRole('heading', { name: corkProperty.title })).toBeVisible()
    expect(screen.queryByRole('heading', { name: property.title })).not.toBeInTheDocument()
    expect(screen.getByText('1 result')).toBeVisible()
  })

  it('sorts the catalogue by price', async () => {
    mockResponse({ properties: [property, corkProperty] })
    const user = userEvent.setup()

    render(<App />)

    await screen.findByRole('heading', { name: property.title })
    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort properties' }), 'price-low')
    const cards = document.querySelectorAll('.property-grid .property-card h3')
    expect(cards[0]).toHaveTextContent(corkProperty.title)
    expect(cards[1]).toHaveTextContent(property.title)
  })

  it('opens a property on a dedicated detail URL', async () => {
    window.history.replaceState({}, '', `/properties/${property.id}`)
    mockResponse({ properties: [property, corkProperty] })

    render(<App />)

    expect(await screen.findByRole('main', { name: 'Property details' })).toBeVisible()
    expect(screen.getByRole('heading', { level: 1, name: property.title })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Back to property search' })).toHaveAttribute('href', '/')
    expect(screen.queryByRole('region', { name: 'Explore homes by location' })).not.toBeInTheDocument()
  })

  it('shows a loading state while properties are requested', () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}))

    render(<App />)

    expect(screen.getByRole('status')).toHaveTextContent('Loading homes')
  })

  it('renders properties returned by the API', async () => {
    mockResponse({ properties: [property] })

    render(<App />)

    expect(await screen.findByRole('heading', { name: property.title })).toBeVisible()
    expect(screen.getAllByText('€895,000').some((price) => price.classList.contains('property-price'))).toBe(true)
    expect(screen.getByText('4 bedrooms')).toBeVisible()
    expect(screen.getAllByText('Terraced').some((type) => type.tagName === 'SPAN')).toBe(true)
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
    const reservedDrilldownSlot = explorer.querySelector('.location-drilldown-slot')
    expect(reservedDrilldownSlot).toBeInTheDocument()
    expect(explorer).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Choose location' }))
    await user.click(screen.getByRole('button', { name: 'Explore Cork, 1 property' }))

    expect(explorer.querySelector('.location-drilldown-slot')).toBe(reservedDrilldownSlot)
    expect(screen.getByRole('button', { name: 'All Ireland' })).toHaveTextContent('Ireland')
    expect(screen.getByRole('heading', { name: corkProperty.title })).toBeVisible()
    expect(screen.queryByRole('heading', { name: property.title })).not.toBeInTheDocument()
    expect(within(explorer).getByText('1 home for sale')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Explore Cork City North West, 1 property' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'All Ireland' }))
    expect(screen.getByRole('heading', { name: property.title })).toBeVisible()
    expect(screen.getByRole('heading', { name: corkProperty.title })).toBeVisible()
  })

  it('keeps local areas hidden until a county is selected', async () => {
    mockResponse({ properties: [property, corkProperty] })

    render(<App />)

    const explorer = await screen.findByRole('region', { name: 'Explore homes by location' })
    expect(within(explorer).getByText('Select a home or choose a county to explore local areas')).toBeVisible()
    expect(within(explorer).queryByText('Areas')).not.toBeInTheDocument()
    expect(within(explorer).queryByRole('button', { name: /Explore Dublin City/ })).not.toBeInTheDocument()
  })

  it('keeps a selected sidebar home active on its matching map area', async () => {
    mockResponse({ properties: [corkProperty, kinsaleProperty] })
    const user = userEvent.setup()

    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Choose location' }))
    await user.click(await screen.findByRole('button', { name: 'Explore Cork, 2 properties' }))
    await user.click(screen.getByRole('button', { name: `Select ${kinsaleProperty.title} on map` }))

    expect(screen.getByRole('heading', { name: 'Homes in Bandon - Kinsale' })).toBeVisible()
    expect(screen.getByRole('button', { name: `Select ${kinsaleProperty.title} on map` })).toHaveAttribute('aria-pressed', 'true')
  })

  it('keeps the national map focused on geography until a county is selected', async () => {
    mockResponse({ properties: [property, kinsaleProperty] })

    render(<App />)

    const explorer = await screen.findByRole('region', { name: 'Explore homes by location' })
    expect(within(explorer).queryByRole('complementary', { name: 'Homes matching your search' })).not.toBeInTheDocument()
    expect(within(explorer).getByText('Select a home or choose a county to explore local areas')).toBeVisible()
  })

  it('uses location search as the page-level starting point', async () => {
    mockResponse({ properties: [property, corkProperty] })

    render(<App />)

    const explorer = await screen.findByRole('region', { name: 'Explore homes by location' })
    expect(within(explorer).getByRole('heading', { level: 1, name: 'Find a place that feels like home' })).toBeVisible()
  })

  it('lets a buyer search available counties and towns from the map panel', async () => {
    mockResponse({ properties: [property, corkProperty] })
    const user = userEvent.setup()

    render(<App />)

    expect(screen.queryByRole('searchbox', { name: 'Search locations' })).not.toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'Choose location' }))
    const search = await screen.findByRole('searchbox', { name: 'Search counties' })
    await user.type(search, 'douglas')

    expect(screen.getByRole('button', { name: 'Explore Cork, 1 property' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Explore Dublin, 1 property' })).not.toBeInTheDocument()
  })

  it('drills from a county into its administrative areas and filters the location panel', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', '')
    mockResponse({ properties: [property, corkProperty, kinsaleProperty] })
    const user = userEvent.setup()

    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Choose location' }))
    await user.click(await screen.findByRole('button', { name: 'Explore Cork, 2 properties' }))
    expect(screen.getByRole('button', { name: 'Explore Dublin, 1 property' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Explore Cork, 2 properties' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: 'Back to all Cork' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Explore Cork City North West, 1 property' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Explore Bandon - Kinsale, 1 property' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Explore Carrigaline, 0 properties' }))
    expect(screen.getByText('No homes in this area yet.')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Carrigaline' }))
    await user.click(screen.getByRole('button', { name: 'Explore Bandon - Kinsale, 1 property' }))

    expect(screen.getByRole('heading', { name: 'Homes in Bandon - Kinsale' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Bandon - Kinsale' }))
    expect(screen.getByRole('button', { name: 'Explore Bandon - Kinsale, 1 property' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Explore Cork City North West, 1 property' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Back to all Cork' })).toBeVisible()
    expect(screen.getByRole('heading', { name: kinsaleProperty.title })).toBeVisible()
    expect(screen.queryByRole('heading', { name: corkProperty.title })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Back to all Cork' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Homes in Cork' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Explore Bandon - Kinsale, 1 property' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('heading', { name: corkProperty.title })).toBeVisible()
    expect(screen.getByRole('heading', { name: kinsaleProperty.title })).toBeVisible()
  })

  it('returns an unavailable county URL to the useful Ireland overview', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', '')
    window.history.replaceState({}, '', '/?county=Galway')
    mockResponse({ properties: [property, corkProperty] })
    const user = userEvent.setup()

    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Choose location' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'All Ireland' })).toHaveAttribute('aria-pressed', 'true'))
    expect(screen.queryByRole('button', { name: /Explore Galway/ })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: property.title })).toBeVisible()
    expect(screen.getByRole('heading', { name: corkProperty.title })).toBeVisible()
    await waitFor(() => expect(window.location.search).toBe(''))
  })

  it('keeps location browsing usable when Google Maps is not configured', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', '')
    mockResponse({ properties: [property] })
    const user = userEvent.setup()

    render(<App />)

    expect(await screen.findByText('Map view is unavailable right now.')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Choose location' }))
    expect(screen.getByRole('button', { name: 'Explore Dublin, 1 property' })).toBeVisible()
  })

  it('lets the buyer browse all media for a property', async () => {
    mockResponse({ properties: [property] })
    const user = userEvent.setup()

    render(<App />)

    expect(await screen.findByRole('img', { name: 'Front exterior of the home' })).toBeVisible()
    expect(screen.getByText('1 / 4')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Next image' }))

    expect(screen.getByRole('img', { name: 'Bright open-plan living room' })).toBeVisible()
    expect(screen.getByText('2 / 4')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Next image' }))
    expect(screen.getAllByRole('img', { name: 'Measured floor plan of the property' }).some((image) => image.classList.contains('gallery-image'))).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Previous image' }))
    expect(screen.getByRole('img', { name: 'Bright open-plan living room' })).toBeVisible()
  })

  it('shows native video controls when the buyer selects a video tour', async () => {
    mockResponse({ properties: [property] })
    const user = userEvent.setup()

    render(<App />)
    await screen.findByRole('img', { name: 'Front exterior of the home' })

    const nextImage = screen.getByRole('button', { name: 'Next image' })
    await user.click(nextImage)
    await user.click(nextImage)
    await user.click(nextImage)

    const video = screen.getByLabelText('Video tour of the property')
    expect(video.tagName).toBe('VIDEO')
    expect(video).toHaveAttribute('controls')
    expect(video.querySelector('source')).toHaveAttribute('src', '/media/properties/leeson-park/tour.mp4')
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

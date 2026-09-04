import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

it('provides actionable property navigation without unavailable tour links', async () => {
  window.history.replaceState({}, '', `/properties/${property.id}`)
  mockResponse({ properties: [property] })
  render(<App />)
  const nav = await screen.findByRole('navigation', { name: 'Property sections' })
  expect(within(screen.getByRole('navigation', { name: 'Primary navigation' })).queryByRole('link', { name: 'Client account' })).not.toBeInTheDocument()
  expect(within(nav).queryByRole('link', { name: 'Your notes' })).not.toBeInTheDocument()
  expect(within(nav).queryByRole('link', { name: '360° tour' })).not.toBeInTheDocument()
  expect(within(nav).getByRole('link', { name: 'Show on map' })).toHaveAttribute('href', `/?county=Dublin&property=${property.id}#explore`)
  for (const link of within(nav).getAllByRole('link')) {
    const href = link.getAttribute('href')!
    if (href.startsWith('#')) expect(document.getElementById(href.slice(1))).not.toBeNull()
  }
  await userEvent.click(within(nav).getByRole('button', { name: 'Request viewing' }))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
})

it('marks the current property chapter for direct links and browser history', async () => {
  window.history.replaceState({}, '', `/properties/${property.id}#intelligence`)
  mockResponse({ properties: [property] })
  render(<App />)

  const nav = await screen.findByRole('navigation', { name: 'Property sections' })
  expect(within(nav).getByRole('link', { name: 'Property insights' })).toHaveAttribute('aria-current', 'location')
  expect(within(nav).getByRole('link', { name: 'Overview & media' })).not.toHaveAttribute('aria-current')

  window.history.replaceState({}, '', `/properties/${property.id}#overview`)
  window.dispatchEvent(new PopStateEvent('popstate'))

  await waitFor(() => expect(within(nav).getByRole('link', { name: 'Overview & media' })).toHaveAttribute('aria-current', 'location'))
  expect(within(nav).getByRole('link', { name: 'Property insights' })).not.toHaveAttribute('aria-current')
})

it('updates the current property chapter as sections enter the reading area', async () => {
  let notify: IntersectionObserverCallback | undefined
  vi.stubGlobal('IntersectionObserver', vi.fn(function (callback: IntersectionObserverCallback) {
    notify = callback
    return { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn(), takeRecords: () => [], root: null, rootMargin: '', thresholds: [] }
  }))
  window.history.replaceState({}, '', `/properties/${property.id}`)
  mockResponse({ properties: [property] })
  render(<App />)

  const nav = await screen.findByRole('navigation', { name: 'Property sections' })
  const intelligence = document.getElementById('intelligence')!
  const bounds = intelligence.getBoundingClientRect()
  act(() => notify?.([{
    boundingClientRect: bounds,
    intersectionRatio: 1,
    intersectionRect: bounds,
    isIntersecting: true,
    rootBounds: null,
    target: intelligence,
    time: 0,
  }], {} as IntersectionObserver))

  expect(within(nav).getByRole('link', { name: 'Property insights' })).toHaveAttribute('aria-current', 'location')
})

it('offers a direct full-window tour from the property summary', async () => {
  window.history.replaceState({}, '', `/properties/${property.id}`)
  mockResponse({ properties: [{ ...property, media: [...property.media, { url: 'https://kuula.co/share/LTPpc', kind: 'panorama', altText: 'Tour', position: 4 }] }] })
  render(<App />)
  expect(await screen.findByRole('link', { name: 'Open full-window 360° tour' })).toHaveAttribute('href', `/properties/${property.id}/tour`)
})

it('lets a signed-in client save a home from its property page', async () => {
  window.history.replaceState({}, '', `/properties/${property.id}`)
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = String(input)
    if (url === '/api/v1/properties') return Promise.resolve(Response.json({ properties: [property] }))
    if (url === '/api/v1/client/session') return Promise.resolve(Response.json({ client: { id: 'buyer', email: 'buyer@example.test' } }))
    if (url === '/api/v1/client/saved-properties') return Promise.resolve(Response.json({ properties: [] }))
    if (url.endsWith(`/saved-properties/${property.id}`) && init?.method === 'PUT') return Promise.resolve(new Response(null, { status: 204 }))
    return Promise.resolve(new Response(null, { status: 404 }))
  })

  render(<App />)
  const save = await screen.findByRole('button', { name: `Save ${property.title}` })
  await userEvent.click(save)

  expect(await screen.findByRole('status')).toHaveTextContent('Saved to your account')
  expect(fetchMock).toHaveBeenCalledWith(`/api/v1/client/saved-properties/${property.id}`, expect.objectContaining({ method: 'PUT' }))
})

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
  window.localStorage.clear()
  window.history.replaceState({}, '', '/')
})

describe('property catalogue', () => {
  it('restores a buyer comparison after returning to the website', async () => {
    mockResponse({ properties: [property] })
    const view = render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: `Add ${property.title} to comparison` }))
    view.unmount()
    render(<App />)
    const tray = await screen.findByRole('region', { name: 'Property comparison' })
    expect(within(tray).getByRole('button', { name: `Remove ${property.title} from comparison` })).toBeVisible()
  })

  it('keeps comparison usable when browser storage rejects updates', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Storage blocked', 'SecurityError') })
    mockResponse({ properties: [property] })
    render(<App />)

    await userEvent.click(await screen.findByRole('button', { name: `Add ${property.title} to comparison` }))

    const tray = await screen.findByRole('region', { name: 'Property comparison' })
    expect(within(tray).getByText('1 home selected')).toBeVisible()
    expect(within(tray).getByRole('button', { name: `Remove ${property.title} from comparison` })).toBeVisible()
  })

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

  it('filters the catalogue and map to homes with a 360 degree tour', async () => {
    const panoramaProperty = { ...property, media: [...property.media, { url: 'https://kuula.co/share/LTPpc', kind: 'panorama' as const, altText: '360 tour', position: 4 }] }
    mockResponse({ properties: [panoramaProperty, corkProperty] })
    const user = userEvent.setup()

    render(<App />)

    await user.click(await screen.findByRole('checkbox', { name: '360° tours only' }))

    expect(screen.getByRole('heading', { name: property.title })).toBeVisible()
    expect(screen.queryByRole('heading', { name: corkProperty.title })).not.toBeInTheDocument()
    expect(screen.getByText('1 result')).toBeVisible()
  })

  it('opens a property on a dedicated detail URL', async () => {
    window.history.replaceState({}, '', `/properties/${property.id}`)
    mockResponse({ properties: [{ ...property, media: [...property.media, { url: 'https://kuula.co/share/LTPpc?fs=1', kind: 'panorama', altText: '360 tour', position: 4 }] }, corkProperty] })

    render(<App />)

    expect(await screen.findByRole('main', { name: 'Property details' })).toBeVisible()
    expect(screen.getByRole('heading', { level: 1, name: property.title })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Back to property search' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: '360° tour' })).toHaveAttribute('href', '#tour')
    expect(screen.getByRole('heading', { name: 'Walk through every room.' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Open full 360° tour' })).toHaveAttribute('href', `/properties/${property.id}/tour`)
    expect(await screen.findByRole('button', { name: 'Enter 360° tour' })).toBeVisible()
    expect(screen.queryByRole('region', { name: 'Explore homes by location' })).not.toBeInTheDocument()
  })

  it('opens a property panorama on a dedicated full-view URL', async () => {
    window.history.replaceState({}, '', `/properties/${property.id}/tour`)
    mockResponse({ properties: [{ ...property, media: [...property.media, { url: 'https://kuula.co/share/LTPpc?fs=1', kind: 'panorama', altText: '360 tour', position: 4 }] }] })

    render(<App />)

    expect(await screen.findByRole('main', { name: `${property.title} 360° tour` })).toBeVisible()
    expect(screen.getByRole('link', { name: `Back to ${property.title}` })).toHaveAttribute('href', `/properties/${property.id}`)
    expect(screen.getByRole('link', { name: 'View property details' })).toHaveAttribute('href', `/properties/${property.id}`)
    expect(screen.getByRole('link', { name: 'View location on map' })).toHaveAttribute('href', `/?county=${property.county}&property=${property.id}#explore`)
    expect(await screen.findByRole('button', { name: 'Enter 360° tour' })).toBeVisible()
  })

  it('restores a linked property as the active map location', async () => {
    window.history.replaceState({}, '', `/?county=${property.county}&property=${property.id}#explore`)
    mockResponse({ properties: [property, corkProperty] })

    render(<App />)

    expect(await screen.findByRole('article', { name: `Preview ${property.title}` })).toBeVisible()
    expect(screen.getByRole('button', { name: `Select ${property.title} on map` })).toHaveAttribute('aria-pressed', 'true')
  })

  it('expands the property tour workspace to browser fullscreen', async () => {
    window.history.replaceState({}, '', `/properties/${property.id}/tour`)
    mockResponse({ properties: [{ ...property, media: [...property.media, { url: 'https://kuula.co/share/LTPpc?fs=1', kind: 'panorama', altText: '360 tour', position: 4 }] }] })
    const requestFullscreen = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', { configurable: true, value: requestFullscreen })
    const user = userEvent.setup()

    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Open tour in browser fullscreen' }))
    expect(requestFullscreen).toHaveBeenCalledOnce()
  })

  it('promotes the immersive service away from the opening showcase', async () => {
    const panoramaProperty = { ...property, media: [...property.media, { url: 'https://kuula.co/share/LTPpc?fs=1', kind: 'panorama' as const, altText: '360 tour', position: 4 }] }
    mockResponse({ properties: [panoramaProperty] })

    render(<App />)

    expect(await screen.findByRole('region', { name: 'Immersive property viewing' })).toBeVisible()
    expect(screen.getByRole('link', { name: `Open the 360° tour for ${property.title}` })).toHaveAttribute('href', `/properties/${property.id}/tour`)
  })

  it('collects a contextual viewing request from the property page', async () => {
    window.history.replaceState({}, '', `/properties/${property.id}`)
    mockResponse({ properties: [property] })
    const user = userEvent.setup()

    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Arrange a viewing' }))
    const dialog = screen.getByRole('dialog', { name: `Request a viewing for ${property.title}` })
    expect(within(dialog).getByText(new RegExp(property.addressLine1))).toBeVisible()
    await user.type(within(dialog).getByLabelText('Your name'), 'Aisling Murphy')
    await user.type(within(dialog).getByLabelText('Email address'), 'aisling@example.com')
    await user.click(within(dialog).getByRole('radio', { name: 'Saturday · 11:00' }))
    await user.click(within(dialog).getByRole('button', { name: 'Send viewing request' }))

    expect(within(dialog).getByRole('status')).toHaveTextContent('Your sample viewing request is ready')
  })

  it('keeps buyer notes attached to the property locally', async () => {
    window.history.replaceState({}, '', `/properties/${property.id}`)
    mockResponse({ properties: [property] })
    const user = userEvent.setup()

    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Add property notes' }))
    const dialog = screen.getByRole('dialog', { name: `Notes for ${property.title}` })
    await user.type(within(dialog).getByLabelText('Private notes'), 'Check afternoon light in the kitchen.')
    await user.click(within(dialog).getByRole('checkbox', { name: 'Ask about recent renovations' }))
    await user.click(within(dialog).getByRole('button', { name: 'Save property notes' }))

    expect(screen.getByText('Notes saved locally')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Edit property notes' }))
    expect(within(screen.getByRole('dialog', { name: `Notes for ${property.title}` })).getByLabelText('Private notes')).toHaveValue('Check afternoon light in the kitchen.')
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
    expect(explorer.querySelector('.map-back-button')).toHaveTextContent('Ireland')
    expect(screen.getByRole('heading', { name: corkProperty.title })).toBeVisible()
    expect(screen.queryByRole('heading', { name: property.title })).not.toBeInTheDocument()
    expect(within(explorer).getByText('1 home for sale')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Explore Cork City North West, 1 property' })).toBeVisible()

    await user.click(explorer.querySelector('.map-back-button') as HTMLButtonElement)
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
    expect(screen.getByRole('article', { name: `Preview ${kinsaleProperty.title}` })).toBeVisible()
  })

  it('keeps the national listing grid available before a county is selected', async () => {
    mockResponse({ properties: [property, kinsaleProperty] })

    render(<App />)

    const explorer = await screen.findByRole('region', { name: 'Explore homes by location' })
    expect(within(explorer).getByRole('complementary', { name: 'Homes matching your search' })).toBeVisible()
    expect(within(explorer).getByText('Select a home or choose a county to explore local areas')).toBeVisible()
  })

  it('uses location search as the page-level starting point', async () => {
    mockResponse({ properties: [property, corkProperty] })

    render(<App />)

    const hero = screen.getByRole('region', { name: 'Find your next home' })
    expect(within(hero).getByRole('heading', { level: 1, name: 'The complete picture, before the viewing.' })).toBeVisible()
    expect(within(hero).getByRole('searchbox', { name: 'Search homes from the opening feature' })).toBeVisible()
    expect(within(hero).getByRole('img', { name: 'Contemporary Irish home exterior' })).toHaveAttribute('src', '/media/properties/leeson-park/exterior-front.webp')
    expect(hero.querySelector('video')).not.toBeInTheDocument()

    const explorer = await screen.findByRole('region', { name: 'Explore homes by location' })
    expect(within(explorer).getByRole('heading', { level: 2, name: 'Explore homes across Ireland' })).toBeVisible()
  })

  it('shares the opening search query with the map search', async () => {
    mockResponse({ properties: [property, corkProperty] })
    const user = userEvent.setup()

    render(<App />)

    await user.type(screen.getByRole('searchbox', { name: 'Search homes from the opening feature' }), 'Cork')
    const explorer = await screen.findByRole('region', { name: 'Explore homes by location' })
    expect(within(explorer).getByRole('searchbox', { name: 'Search homes' })).toHaveValue('Cork')
  })

  it('opens a contextual saved-search dialog and confirms the alert', async () => {
    mockResponse({ properties: [property, corkProperty] })
    const user = userEvent.setup()

    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Save search' }))
    const dialog = screen.getByRole('dialog', { name: 'Save this search' })
    expect(within(dialog).getByText('2 matching homes')).toBeVisible()
    await user.type(within(dialog).getByLabelText('Email address'), 'buyer@example.com')
    await user.click(within(dialog).getByRole('button', { name: 'Create property alert' }))

    expect(within(dialog).getByRole('status')).toHaveTextContent('Your sample alert is ready')
  })

  it('shortlists homes and compares them in a persistent buyer tray', async () => {
    mockResponse({ properties: [property, corkProperty] })
    const user = userEvent.setup()

    render(<App />)

    await user.click(await screen.findByRole('button', { name: `Add ${property.title} to comparison` }))
    await user.click(screen.getByRole('button', { name: `Add ${corkProperty.title} to comparison` }))
    const tray = screen.getByRole('region', { name: 'Property comparison' })
    expect(within(tray).getByText('2 homes selected')).toBeVisible()
    await user.click(within(tray).getByRole('button', { name: 'Compare homes' }))

    const dialog = screen.getByRole('dialog', { name: 'Compare selected homes' })
    expect(within(dialog).getByText(property.title)).toBeVisible()
    expect(within(dialog).getByText(corkProperty.title)).toBeVisible()
    expect(within(dialog).getAllByText('Asking price')).toHaveLength(2)

    await user.click(within(dialog).getByRole('button', { name: `Remove ${property.title} from comparison` }))
    expect(within(dialog).queryByText(property.title)).not.toBeInTheDocument()
    expect(within(tray).getByText('1 home selected')).toBeVisible()
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
    expect(screen.queryByRole('searchbox', { name: 'Search counties' })).not.toBeInTheDocument()
    expect(document.querySelector('[aria-controls="county-options"]')).toHaveAttribute('aria-expanded', 'false')
    expect(document.querySelector('[aria-controls="county-options"]')).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Choose an area in Cork' })).toHaveAttribute('aria-expanded', 'true')
    await user.click(screen.getByRole('button', { name: 'Choose an area in Cork' }))
    expect(screen.queryByRole('searchbox', { name: 'Search areas in Cork' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Choose an area in Cork' }))
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
    expect(within(screen.getByRole('region', { name: 'Explore homes by location' })).getByRole('heading', { level: 2, name: 'Homes in Cork' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Explore Bandon - Kinsale, 1 property' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('heading', { name: corkProperty.title })).toBeVisible()
    expect(screen.getByRole('heading', { name: kinsaleProperty.title })).toBeVisible()
  })

  it('deep-links county and area selection and restores it with browser history', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', '')
    mockResponse({ properties: [property, corkProperty, kinsaleProperty] })
    const user = userEvent.setup()

    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Choose location' }))
    await user.click(screen.getByRole('button', { name: 'Explore Cork, 2 properties' }))
    await user.click(screen.getByRole('button', { name: 'Explore Bandon - Kinsale, 1 property' }))
    expect(window.location.search).toBe('?county=Cork&area=Bandon+-+Kinsale')

    window.history.back()
    window.dispatchEvent(new PopStateEvent('popstate'))
    await waitFor(() => expect(within(screen.getByRole('region', { name: 'Explore homes by location' })).getByRole('heading', { level: 2, name: 'Homes in Cork' })).toBeVisible())
    expect(window.location.search).toBe('?county=Cork')
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

    expect(await screen.findByText('Map is not available.')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Choose location' }))
    expect(screen.getByRole('button', { name: 'Explore Dublin, 1 property' })).toBeVisible()
  })

  it('lets the buyer browse all media for a property', async () => {
    mockResponse({ properties: [property] })
    const user = userEvent.setup()

    render(<App />)

    expect(await screen.findByRole('img', { name: 'Front exterior of the home' })).toBeVisible()
    expect(screen.getByText('1 / 4')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Earlier media thumbnails' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Later media thumbnails' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'View Bright open-plan living room' }))

    expect(screen.getByRole('img', { name: 'Bright open-plan living room' })).toBeVisible()
    expect(screen.getByText('2 / 4')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Next image' }))
    expect(screen.getAllByRole('img', { name: 'Measured floor plan of the property' }).some((image) => image.classList.contains('gallery-image'))).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Previous image' }))
    expect(screen.getByRole('img', { name: 'Bright open-plan living room' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Later media thumbnails' }))
    expect(screen.getAllByRole('img', { name: 'Measured floor plan of the property' }).some((image) => image.classList.contains('gallery-image'))).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Earlier media thumbnails' }))
    expect(screen.getByRole('img', { name: 'Bright open-plan living room' })).toBeVisible()
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

  it('falls back safely when a property has no media', async () => {
    mockResponse({ properties: [{ ...property, media: [] }] })
    const user = userEvent.setup()

    render(<App />)

    expect((await screen.findAllByRole('img', { name: /Architectural study for/ }))[0]).toBeVisible()

    await user.click(screen.getByRole('button', { name: `View Illustrative floor plan for ${property.title}` }))
    expect(screen.getByRole('img', { name: `Illustrative floor plan for ${property.title}` })).toHaveAttribute(
      'src',
      '/media/placeholders/sample-floor-plan.png',
    )
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

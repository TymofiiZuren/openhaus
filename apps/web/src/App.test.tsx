import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

it('preserves an area deep link through a failed geometry load and explicit retry', async () => {
  const geometry = await import('./administrativeAreas')
  const load = vi.spyOn(geometry, 'loadAreasForCounty').mockRejectedValueOnce(new Error('offline'))
  window.history.replaceState({}, '', '/?county=Dublin&area=Pembroke#explore')
  mockResponse({ properties: [property] })
  render(<App />)
  const retry = await screen.findByRole('button', { name: 'Retry map detail' })
  expect(new URLSearchParams(location.search).get('area')).toBe('Pembroke')
  expect(screen.queryByRole('article', { name: property.title })).not.toBeInTheDocument()
  await userEvent.click(retry)
  expect(await screen.findByRole('heading', { name: 'Homes in Pembroke' })).toBeVisible()
  expect(load).toHaveBeenCalledTimes(2)
})

it('preserves the map layout box while returning to all Ireland loads geometry', async () => {
  window.history.replaceState({}, '', '/?county=Dublin#explore')
  mockResponse({ properties: [property] })
  render(<App />)
  const filters = await screen.findByRole('search', { name: 'Search and filter homes' })
  await waitFor(() => expect(filters.closest('[hidden]')).toBeNull())
  const geometry = await import('./administrativeAreas')
  vi.spyOn(geometry, 'loadAreasForCounty').mockRejectedValueOnce(new Error('offline'))
  fireEvent.click(screen.getByRole('button', { name: 'All Ireland' }))
  await screen.findByRole('button', { name: 'Retry map detail' })
  expect(filters.closest('[hidden]')).toBeNull()
  expect(filters.closest('[aria-hidden="true"]')).toBeNull()
  expect(screen.getByRole('heading', { name: 'Homes in Dublin' })).toBeVisible()
  expect(screen.getByText(/Showing the previous area/)).toBeVisible()
})

it('keeps the last loaded county visible until the next county is ready', async () => {
  window.history.replaceState({}, '', '/?county=Dublin#explore')
  mockResponse({ properties: [property, { ...property, id: 'cork', county: 'Cork', city: 'Cork', longitude: -8.4932, latitude: 51.9045 }] })
  render(<App />)
  const workspace = await screen.findByRole('region', { name: 'Explore homes by location' })
  await waitFor(() => expect(workspace.closest('[aria-hidden="true"]')).toBeNull())
  const geometry = await import('./administrativeAreas')
  const original = geometry.loadAreasForCounty
  let finish!: () => void
  vi.spyOn(geometry, 'loadAreasForCounty').mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve }))
  act(() => {
    window.history.pushState({}, '', '/?county=Cork#explore')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await waitFor(() => expect(finish).toBeDefined())
  expect(within(workspace).getByRole('heading', { name: 'Homes in Dublin' })).toBeVisible()
  expect(workspace.closest('[aria-hidden="true"]')).toBeNull()
  await act(async () => { await original('Cork'); finish() })
  expect(within(workspace).getByRole('heading', { name: 'Homes in Cork' })).toBeVisible()
  expect(screen.queryByText(/Showing the previous area/)).not.toBeInTheDocument()
})

it('returns to a previously loaded county without a transitional loading message', async () => {
  window.history.replaceState({}, '', '/?county=Dublin#explore')
  mockResponse({ properties: [property, { ...property, id: 'cork', county: 'Cork', city: 'Cork', longitude: -8.4932, latitude: 51.9045 }] })
  render(<App />)
  const workspace = await screen.findByRole('region', { name: 'Explore homes by location' })
  await waitFor(() => expect(workspace.closest('[aria-hidden="true"]')).toBeNull())
  act(() => {
    window.history.pushState({}, '', '/?county=Cork#explore')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await within(workspace).findByRole('heading', { name: 'Homes in Cork' })
  const geometry = await import('./administrativeAreas')
  const load = vi.spyOn(geometry, 'loadAreasForCounty')
  act(() => {
    window.history.pushState({}, '', '/?county=Dublin#explore')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  expect(within(workspace).getByRole('heading', { name: 'Homes in Dublin' })).toBeVisible()
  expect(screen.queryByText(/Showing the previous area/)).not.toBeInTheDocument()
  expect(load).not.toHaveBeenCalled()
})

it('ignores a late county failure after returning to a cached county', async () => {
  window.history.replaceState({}, '', '/?county=Dublin#explore')
  mockResponse({ properties: [property, { ...property, id: 'cork', county: 'Cork', city: 'Cork', longitude: -8.4932, latitude: 51.9045 }] })
  render(<App />)
  const workspace = await screen.findByRole('region', { name: 'Explore homes by location' })
  await waitFor(() => expect(workspace.closest('[aria-hidden="true"]')).toBeNull())
  const geometry = await import('./administrativeAreas')
  let fail!: (error: Error) => void
  vi.spyOn(geometry, 'loadAreasForCounty').mockImplementationOnce(() => new Promise<void>((_, reject) => { fail = reject }))
  act(() => {
    window.history.pushState({}, '', '/?county=Cork#explore')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await waitFor(() => expect(fail).toBeDefined())
  expect(screen.getByText(/Showing the previous area/)).toBeVisible()
  act(() => {
    window.history.pushState({}, '', '/?county=Dublin#explore')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await act(async () => { fail(new Error('offline')) })
  expect(within(workspace).getByRole('heading', { name: 'Homes in Dublin' })).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Retry map detail' })).not.toBeInTheDocument()
  expect(screen.queryByText(/Showing the previous area/)).not.toBeInTheDocument()
  expect(workspace.closest('[aria-busy="true"]')).toBeNull()
})

it('caches a recovered county after a successful retry', async () => {
  window.history.replaceState({}, '', '/?county=Dublin#explore')
  mockResponse({ properties: [property, { ...property, id: 'cork', county: 'Cork', city: 'Cork', longitude: -8.4932, latitude: 51.9045 }] })
  render(<App />)
  const workspace = await screen.findByRole('region', { name: 'Explore homes by location' })
  await waitFor(() => expect(workspace.closest('[aria-hidden="true"]')).toBeNull())
  const geometry = await import('./administrativeAreas')
  const load = vi.spyOn(geometry, 'loadAreasForCounty').mockRejectedValueOnce(new Error('offline'))
  act(() => {
    window.history.pushState({}, '', '/?county=Cork#explore')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await userEvent.click(await screen.findByRole('button', { name: 'Retry map detail' }))
  await within(workspace).findByRole('heading', { name: 'Homes in Cork' })
  expect(load).toHaveBeenCalledTimes(2)
  for (const county of ['Dublin', 'Cork']) {
    act(() => {
      window.history.pushState({}, '', `/?county=${county}#explore`)
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(within(workspace).getByRole('heading', { name: `Homes in ${county}` })).toBeVisible()
    expect(screen.queryByText(/Showing the previous area/)).not.toBeInTheDocument()
  }
  expect(load).toHaveBeenCalledTimes(2)
})

it('ignores a late geometry response after navigating to another county', async () => {
  const geometry = await import('./administrativeAreas')
  const original = geometry.loadAreasForCounty
  let finish!: () => void
  vi.spyOn(geometry, 'loadAreasForCounty').mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve }))
  window.history.replaceState({}, '', '/?county=Dublin&area=Pembroke#explore')
  mockResponse({ properties: [property, { ...property, id: 'cork', county: 'Cork', city: 'Cork', longitude: -8.4932, latitude: 51.9045 }] })
  render(<App />)
  await waitFor(() => expect(finish).toBeDefined())
  act(() => {
    window.history.pushState({}, '', '/?county=Cork#explore')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await waitFor(() => expect(screen.queryByText('Preparing local map detail…')).not.toBeInTheDocument())
  expect(screen.getAllByRole('heading', { name: 'Homes in Cork', level: 2 }).length).toBeGreaterThan(0)
  await act(async () => { await original('Dublin'); finish() })
  expect(new URLSearchParams(location.search).get('county')).toBe('Cork')
  expect(screen.queryByRole('heading', { name: 'Homes in Pembroke' })).not.toBeInTheDocument()
  expect(screen.queryByText('Preparing local map detail…')).not.toBeInTheDocument()
})

it('labels showcase homes without promising a future real tour', async () => {
  const demo = {...property,id:'d3000000-0000-4000-8000-000000000003',title:'Demo listing · Harbour townhouse'}
  window.history.replaceState({}, '', `/properties/${demo.id}`)
  mockResponse({properties:[demo]})
  render(<App />)
  expect(await screen.findByText('Fictional showcase · not for sale')).toBeVisible()
  expect(screen.queryByText('Property for sale')).not.toBeInTheDocument()
  expect(screen.getByRole('heading',{name:'Concept imagery, clearly labelled.'})).toBeVisible()
  expect(screen.queryByText('Tour coming soon')).not.toBeInTheDocument()
})

it('restores the map anchor after the async homepage loads', async () => {
  window.history.replaceState({}, '', `/?county=Dublin&property=${property.id}#explore`)
  const scroll = vi.fn()
  const original = HTMLElement.prototype.scrollIntoView
  HTMLElement.prototype.scrollIntoView = scroll
  try {
    mockResponse({ properties: [property] })
    render(<App />)
    await waitFor(() => expect(scroll).toHaveBeenCalled())
    expect(scroll.mock.instances).toContain(document.getElementById('explore'))
  } finally {
    HTMLElement.prototype.scrollIntoView = original
  }
})

it('provides actionable property navigation without unavailable tour links', async () => {
  window.history.replaceState({}, '', `/properties/${property.id}`)
  mockResponse({ properties: [property] })
  render(<App />)
  const nav = await screen.findByRole('navigation', { name: 'Property sections' })
  expect(within(screen.getByRole('navigation', { name: 'Primary navigation' })).queryByRole('link', { name: 'Client account' })).not.toBeInTheDocument()
  expect(within(nav).queryByRole('link', { name: 'Your notes' })).not.toBeInTheDocument()
  expect(within(nav).queryByRole('link', { name: '360° tour' })).not.toBeInTheDocument()
  expect(within(nav).getByRole('link', { name: 'Show on map' })).toHaveAttribute('href', `/?county=Dublin&property=${property.id}#explore`)
  const agent = await screen.findByRole('complementary', { name: 'Selling agent' })
  expect(within(agent).getByRole('heading', { name: 'Aoife Byrne' })).toBeVisible()
  expect(within(agent).getByRole('link', { name: 'View Aoife Byrne’s profile' })).toHaveAttribute('href', '/agents/aoife-byrne')
  expect(within(agent).getByText('Demonstration profile')).toBeVisible()
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

it('does not let a stale scroll observation undo a rapid property chapter selection', async () => {
  let notify: IntersectionObserverCallback | undefined
  vi.stubGlobal('IntersectionObserver', vi.fn(function (callback: IntersectionObserverCallback) {
    notify = callback
    return { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn(), takeRecords: () => [], root: null, rootMargin: '', thresholds: [] }
  }))
  window.history.replaceState({}, '', `/properties/${property.id}`)
  mockResponse({ properties: [property] })
  render(<App />)

  const nav = await screen.findByRole('navigation', { name: 'Property sections' })
  await userEvent.click(within(nav).getByRole('link', { name: 'Property insights' }))
  expect(within(nav).getByRole('link', { name: 'Property insights' })).toHaveAttribute('aria-current', 'location')

  const overview = document.getElementById('overview')!
  const bounds = overview.getBoundingClientRect()
  act(() => notify?.([{
    boundingClientRect: bounds,
    intersectionRatio: 1,
    intersectionRect: bounds,
    isIntersecting: true,
    rootBounds: null,
    target: overview,
    time: 0,
  }], {} as IntersectionObserver))

  expect(within(nav).getByRole('link', { name: 'Property insights' })).toHaveAttribute('aria-current', 'location')
  expect(within(nav).getByRole('link', { name: 'Overview & media' })).not.toHaveAttribute('aria-current')
})

it('keeps overview selected while smooth scrolling settles past the tour section', async () => {
  let notify: IntersectionObserverCallback | undefined
  vi.stubGlobal('IntersectionObserver', vi.fn(function (callback: IntersectionObserverCallback) {
    notify = callback
    return { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn(), takeRecords: () => [], root: null, rootMargin: '', thresholds: [] }
  }))
  const panoramaProperty = { ...property, media: [...property.media, { url: 'https://kuula.co/share/LTPpc', kind: 'panorama' as const, altText: 'Tour', position: 4 }] }
  window.history.replaceState({}, '', `/properties/${property.id}#tour`)
  mockResponse({ properties: [panoramaProperty] })
  render(<App />)

  const nav = await screen.findByRole('navigation', { name: 'Property sections' })
  vi.useFakeTimers()
  fireEvent.click(within(nav).getByRole('link', { name: 'Overview & media' }))
  act(() => vi.advanceTimersByTime(1_200))

  const overview = document.getElementById('overview')!
  const tour = document.getElementById('tour')!
  const overviewBounds = overview.getBoundingClientRect()
  const tourBounds = tour.getBoundingClientRect()
  act(() => notify?.([{
    boundingClientRect: overviewBounds,
    intersectionRatio: 1,
    intersectionRect: overviewBounds,
    isIntersecting: true,
    rootBounds: null,
    target: overview,
    time: 0,
  }], {} as IntersectionObserver))
  act(() => notify?.([{
    boundingClientRect: tourBounds,
    intersectionRatio: 1,
    intersectionRect: tourBounds,
    isIntersecting: true,
    rootBounds: null,
    target: tour,
    time: 1,
  }], {} as IntersectionObserver))

  expect(within(nav).getByRole('link', { name: 'Overview & media' })).toHaveAttribute('aria-current', 'location')
  expect(within(nav).getByRole('link', { name: '360° tour' })).not.toHaveAttribute('aria-current')
  vi.useRealTimers()
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

it('loads and saves private property notes for the signed-in client account', async () => {
  window.history.replaceState({}, '', `/properties/${property.id}`)
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = String(input)
    if (url === '/api/v1/properties') return Promise.resolve(Response.json({ properties: [property] }))
    if (url === '/api/v1/client/session') return Promise.resolve(Response.json({ client: { id: 'buyer', email: 'buyer@example.test' } }))
    if (url === '/api/v1/client/saved-properties') return Promise.resolve(Response.json({ properties: [] }))
    if (url === `/api/v1/client/property-notes/${property.id}` && (!init?.method || init.method === 'GET')) {
      return Promise.resolve(Response.json({ note: { propertyId: property.id, notes: 'Check the roof', questions: ['Confirm fixtures and fittings'] } }))
    }
    if (url === `/api/v1/client/property-notes/${property.id}` && init?.method === 'PUT') {
      return Promise.resolve(Response.json({ note: { propertyId: property.id, notes: 'Check the roof and garden', questions: ['Confirm fixtures and fittings'] } }))
    }
    return Promise.resolve(new Response(null, { status: 404 }))
  })

  render(<App />)

  expect(await screen.findByText('Notes synced to your account')).toBeVisible()
  await userEvent.click(screen.getByRole('button', { name: 'Edit property notes' }))
  const dialog = screen.getByRole('dialog', { name: `Notes for ${property.title}` })
  expect(within(dialog).getByLabelText('Private notes')).toHaveValue('Check the roof')
  expect(within(dialog).getByText('Private to your signed-in buyer account.')).toBeVisible()
  await userEvent.type(within(dialog).getByLabelText('Private notes'), ' and garden')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Save property notes' }))

  expect(fetchMock).toHaveBeenCalledWith(`/api/v1/client/property-notes/${property.id}`, expect.objectContaining({ method: 'PUT', credentials: 'same-origin' }))
  expect(screen.getByText('Notes synced to your account')).toBeVisible()
})

it('does not claim browser notes are synced before the client saves them to the account', async () => {
  window.history.replaceState({}, '', `/properties/${property.id}`)
  localStorage.setItem(`openhaus:property-notes:${property.id}`, JSON.stringify({ notes: 'Browser-only note', questions: [] }))
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = String(input)
    if (url === '/api/v1/properties') return Promise.resolve(Response.json({ properties: [property] }))
    if (url === '/api/v1/client/session') return Promise.resolve(Response.json({ client: { id: 'buyer', email: 'buyer@example.test' } }))
    if (url === '/api/v1/client/saved-properties') return Promise.resolve(Response.json({ properties: [] }))
    if (url === `/api/v1/client/property-notes/${property.id}`) return Promise.resolve(Response.json({ note: { propertyId: property.id, notes: '', questions: [] } }))
    return Promise.resolve(new Response(null, { status: 404 }))
  })

  render(<App />)

  expect(await screen.findByText('Browser notes ready to save to your account')).toBeVisible()
  expect(screen.queryByText('Notes synced to your account')).not.toBeInTheDocument()
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
  vi.unstubAllGlobals()
  window.localStorage.clear()
  window.history.replaceState({}, '', '/')
})

describe('property catalogue', () => {
  it('defers the heavy map workspace until it approaches the viewport', async () => {
    let notify: IntersectionObserverCallback | undefined
    vi.stubGlobal('IntersectionObserver', vi.fn(function (callback: IntersectionObserverCallback) {
      notify = callback
      return { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn(), takeRecords: () => [], root: null, rootMargin: '', thresholds: [] }
    }))
    mockResponse({ properties: [property] })

    render(<App />)
    await screen.findByRole('heading', { name: property.title })
    expect(screen.queryByRole('region', { name: 'Explore homes by location' })).not.toBeInTheDocument()

    const target = document.getElementById('explore')!
    const bounds = target.getBoundingClientRect()
    act(() => notify?.([{
      boundingClientRect: bounds,
      intersectionRatio: 1,
      intersectionRect: bounds,
      isIntersecting: true,
      rootBounds: null,
      target,
      time: 0,
    }], {} as IntersectionObserver))

    expect(await screen.findByRole('region', { name: 'Explore homes by location' })).toBeVisible()
  })

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

  it('uses the OpenHaus guide to understand and apply a natural-language property brief', async () => {
    mockResponse({ properties: [property, corkProperty] })
    const user = userEvent.setup()

    render(<App />)

    const launcher = await screen.findByRole('button', { name: 'Ask OpenHaus' })
    await user.click(launcher)
    const guide = screen.getByRole('dialog', { name: 'OpenHaus guide' })
    await user.type(within(guide).getByLabelText('What are you looking for?'), '3 bedroom homes under €800k in Cork')
    await user.click(within(guide).getByRole('button', { name: 'Find matching homes' }))

    expect(within(guide).getByText('Garden-view contemporary residence')).toBeVisible()
    await user.click(within(guide).getByRole('button', { name: 'Apply to catalogue' }))

    expect(screen.getByRole('heading', { name: corkProperty.title })).toBeVisible()
    expect(screen.queryByRole('heading', { name: property.title })).not.toBeInTheDocument()
    expect(window.location.search).toContain('county=Cork')
    await waitFor(() => expect(launcher).toHaveFocus())
  })

  it('keeps the OpenHaus guide reachable and returns focus after closing it', async () => {
    mockResponse({ properties: [property, corkProperty] })
    const user = userEvent.setup()

    render(<App />)

    const launcher = await screen.findByRole('button', { name: 'Open OpenHaus guide' })
    expect(launcher).toHaveClass('openhaus-guide-trigger')
    expect(document.querySelector('.concierge-launcher')).not.toBeInTheDocument()
    await user.click(launcher)

    const guide = screen.getByRole('dialog', { name: 'OpenHaus guide' })
    expect(guide).toBeVisible()
    expect(guide).toHaveClass('guide-popover')
    expect(guide.closest('.guide-popover-layer')).not.toBeNull()
    await waitFor(() => expect(within(guide).getByLabelText('What are you looking for?')).toHaveFocus())
    expect(launcher).toHaveAttribute('aria-expanded', 'true')

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog', { name: 'OpenHaus guide' })).not.toBeInTheDocument()
    expect(launcher).toHaveAttribute('aria-expanded', 'false')
    await waitFor(() => expect(launcher).toHaveFocus())
  })

  it('sorts the catalogue by price', async () => {
    window.history.replaceState({ navigation: 'preserved' }, '', '/?view=catalogue#homes')
    mockResponse({ properties: [property, corkProperty] })
    const user = userEvent.setup()

    render(<App />)

    await screen.findByRole('heading', { name: property.title })
    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort properties' }), 'price-low')
    const cards = document.querySelectorAll('.property-grid .property-card h3')
    expect(cards[0]).toHaveTextContent(corkProperty.title)
    expect(cards[1]).toHaveTextContent(property.title)
    expect(new URLSearchParams(window.location.search).get('sort')).toBe('price-low')
    expect(new URLSearchParams(window.location.search).get('view')).toBe('catalogue')
    expect(window.location.hash).toBe('#homes')
    expect(window.history.state).toEqual({ navigation: 'preserved' })
    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort properties' }), 'recent')
    expect(new URLSearchParams(window.location.search).has('sort')).toBe(false)
  })

  it('restores sorting from the URL and browser history', async () => {
    window.history.replaceState({}, '', '/?sort=price-low#homes')
    mockResponse({ properties: [property, corkProperty] })
    render(<App />)
    const sort = await screen.findByRole('combobox', { name: 'Sort properties' })
    expect(sort).toHaveValue('price-low')
    expect(document.querySelector('.property-grid .property-card h3')).toHaveTextContent(corkProperty.title)
    act(() => {
      window.history.replaceState({}, '', '/?sort=price-high#homes')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(sort).toHaveValue('price-high')
    expect(document.querySelector('.property-grid .property-card h3')).toHaveTextContent(property.title)
    act(() => {
      window.history.replaceState({}, '', '/?sort=unknown#homes')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(sort).toHaveValue('recent')
  })

  it('persists filters and restores them together from browser history', async () => {
    window.history.replaceState({ preserved: true }, '', '/?sort=price-low#explore')
    mockResponse({ properties: [property, corkProperty] })
    const user = userEvent.setup()
    render(<App />)
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Minimum bedrooms' }), '4')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Maximum price' }), '650000')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Property type' }), 'detached')
    await user.click(screen.getByRole('checkbox', { name: '360° tours only' }))
    expect(new URLSearchParams(location.search).get('beds')).toBe('4')
    expect(new URLSearchParams(location.search).get('maxPrice')).toBe('650000')
    expect(new URLSearchParams(location.search).get('type')).toBe('detached')
    expect(new URLSearchParams(location.search).get('tour')).toBe('true')
    expect(new URLSearchParams(location.search).get('sort')).toBe('price-low')
    expect(history.state).toEqual({ preserved: true })
    act(() => {
      history.replaceState({}, '', '/?query=Cork&beds=3&type=apartment&maxPrice=800000#explore')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(screen.getByPlaceholderText('Search by address, town or property')).toHaveValue('Cork')
    expect(screen.getByRole('combobox', { name: 'Minimum bedrooms' })).toHaveValue('3')
    expect(screen.getByRole('combobox', { name: 'Maximum price' })).toHaveValue('800000')
    expect(screen.getByRole('combobox', { name: 'Property type' })).toHaveValue('apartment')
    expect(screen.getByRole('checkbox', { name: '360° tours only' })).not.toBeChecked()
    act(() => {
      history.replaceState({}, '', '/?beds=-1&type=invalid&maxPrice=NaN#explore')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(screen.getByRole('combobox', { name: 'Minimum bedrooms' })).toHaveValue('0')
    expect(screen.getByRole('combobox', { name: 'Maximum price' })).toHaveValue('0')
    expect(screen.getByRole('combobox', { name: 'Property type' })).toHaveValue('all')
    expect(location.search).toBe('')
  })

  it('prioritises only the first catalogue image and lazily loads later homes', async () => {
    mockResponse({ properties: [property, corkProperty] })

    render(<App />)

    expect(await screen.findByAltText('Front exterior of the home')).toHaveAttribute('loading', 'eager')
    expect(screen.getByAltText('Exterior of the Cork property')).toHaveAttribute('loading', 'lazy')
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
    const workspace = screen.getByRole('complementary', { name: 'Tour workspace controls' })
    expect(within(workspace).getByRole('heading', { name: 'Explore at your pace.' })).toBeVisible()
    expect(within(workspace).getByText('Secure provider connection')).toBeVisible()
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
    expect(dialog.closest('main')).toBeNull()
    expect(within(dialog).getByText(new RegExp(property.addressLine1))).toBeVisible()
    await user.type(within(dialog).getByLabelText('Your name'), 'Aisling Murphy')
    await user.type(within(dialog).getByLabelText('Email address'), 'aisling@example.com')
    await user.click(within(dialog).getByRole('radio', { name: 'Saturday · 11:00' }))
    await user.click(within(dialog).getByRole('button', { name: 'Send viewing request' }))

    expect(within(dialog).getByRole('status')).toHaveTextContent('Your sample viewing request is ready')
  })

  it.each([
    ['Arrange a viewing', 'Request a viewing', 'Close viewing request', 'Send viewing request', 'Your name'],
    ['Add property notes', 'Notes', 'Close property notes', 'Sign in', 'Private notes'],
  ])('keeps keyboard focus inside %s and restores the page on Escape', async (triggerName, title, closeName, lastName, initialField) => {
    window.history.replaceState({}, '', `/properties/${property.id}`)
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => Promise.resolve(
      String(input) === '/api/v1/client/session'
        ? Response.json({ error: 'Not signed in' }, { status: 401 })
        : Response.json({ properties: [property] }),
    ))
    const user = userEvent.setup()
    render(<App />)

    const trigger = await screen.findByRole('button', { name: triggerName })
    const previousOverflow = document.body.style.overflow
    await user.click(trigger)
    const dialog = screen.getByRole('dialog', { name: `${title} for ${property.title}` })
    expect(dialog.closest('main')).toBeNull()
    expect(document.body.style.overflow).toBe('hidden')
    expect(within(dialog).getByLabelText(initialField)).toHaveFocus()

    const close = within(dialog).getByRole('button', { name: closeName })
    const last = await within(dialog).findByRole(lastName === 'Sign in' ? 'link' : 'button', { name: lastName })
    close.focus()
    await user.tab({ shift: true })
    expect(last).toHaveFocus()
    await user.tab()
    expect(close).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(document.body.style.overflow).toBe(previousOverflow)
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
    expect(screen.getByText('Live listing')).toBeVisible()
    expect(screen.getByText(`${property.media.length} media items`)).toBeVisible()
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
    expect(within(hero).getByRole('heading', { level: 1, name: 'Find the address. See the whole picture.' })).toBeVisible()
    expect(within(hero).getByRole('searchbox', { name: 'Search homes from the opening feature' })).toBeVisible()
    expect(within(hero).getByRole('complementary', { name: 'Live property desk' })).toBeVisible()
    expect(hero.querySelector('img')).not.toBeInTheDocument()
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

  it('restores saved catalogue filters from a results link', async () => {
    window.history.replaceState({}, '', '/?query=garden&beds=3&type=detached&maxPrice=800000&tour=true#homes')
    mockResponse({ properties: [property, corkProperty] })

    render(<App />)

    expect(screen.getByRole('searchbox', { name: 'Search homes from the opening feature' })).toHaveValue('garden')
    const explorer = await screen.findByRole('region', { name: 'Explore homes by location' })
    expect(within(explorer).getByRole('combobox', { name: 'Minimum bedrooms' })).toHaveValue('3')
    expect(within(explorer).getByRole('combobox', { name: 'Property type' })).toHaveValue('detached')
    expect(within(explorer).getByRole('combobox', { name: 'Maximum price' })).toHaveValue('800000')
    expect(within(explorer).getByRole('checkbox', { name: /tours only/i })).toBeChecked()
  })

  it('saves contextual search criteria to the signed-in buyer account', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      if (String(input) === '/api/v1/properties') return Promise.resolve(Response.json({ properties: [property, corkProperty] }))
      if (String(input) === '/api/v1/client/saved-searches' && init?.method === 'POST') return Promise.resolve(Response.json({ search: { id: 'search-one', location: 'All Ireland', minimumBedrooms: 0, propertyType: 'all', maximumPrice: 0, spatialOnly: false, frequency: 'daily', createdAt: new Date().toISOString() } }, { status: 201 }))
      return Promise.resolve(new Response(null, { status: 401 }))
    })
    const user = userEvent.setup()

    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Save search' }))
    const dialog = screen.getByRole('dialog', { name: 'Save this search' })
    expect(within(dialog).getByText('2 matching homes')).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'Save to my account' }))

    expect(await within(dialog).findByRole('status')).toHaveTextContent('Search saved to your account')
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/client/saved-searches', expect.objectContaining({ method: 'POST', credentials: 'same-origin' }))
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
    expect(dialog.parentElement).toHaveClass('overlay-layer-centered')
    expect(within(dialog).getByText(property.title)).toBeVisible()
    expect(within(dialog).getByText(corkProperty.title)).toBeVisible()
    expect(within(dialog).getAllByText('Asking price')).toHaveLength(2)

    await user.click(within(dialog).getByRole('button', { name: `Remove ${property.title} from comparison` }))
    expect(within(dialog).queryByText(property.title)).not.toBeInTheDocument()
    expect(within(tray).getByText('1 home selected')).toBeVisible()
  })

  it('downloads selected public listing facts from the comparison dialog', async () => {
    mockResponse({ properties: [property, corkProperty] })
    const create = vi.fn(() => 'blob:comparison')
    const revoke = vi.fn()
    vi.stubGlobal('URL', class extends URL {
      static createObjectURL = create
      static revokeObjectURL = revoke
    })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: `Add ${property.title} to comparison` }))
    await user.click(screen.getByRole('button', { name: `Add ${corkProperty.title} to comparison` }))
    await user.click(screen.getByRole('button', { name: 'Compare homes' }))
    const dialog = screen.getByRole('dialog', { name: 'Compare selected homes' })
    await user.click(within(dialog).getByRole('button', { name: 'Download comparison CSV' }))
    expect(create).toHaveBeenCalledWith(expect.any(Blob))
    expect(click.mock.instances[0]).toHaveAttribute('download', 'openhaus-comparison.csv')
    expect(click.mock.instances[0]).toHaveAttribute('href', 'blob:comparison')
    expect(within(dialog).getByRole('status')).toHaveTextContent('Comparison download prepared')
    await waitFor(() => expect(revoke).toHaveBeenCalledWith('blob:comparison'), { timeout: 2000 })
  })

  it('keeps a failed comparison download recoverable', async () => {
    mockResponse({ properties: [property, corkProperty] })
    const create = vi.fn().mockImplementationOnce(() => { throw new Error('unavailable') }).mockReturnValue('blob:retry')
    vi.stubGlobal('URL', class extends URL {
      static createObjectURL = create
      static revokeObjectURL = vi.fn()
    })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: `Add ${property.title} to comparison` }))
    await user.click(screen.getByRole('button', { name: `Add ${corkProperty.title} to comparison` }))
    await user.click(screen.getByRole('button', { name: 'Compare homes' }))
    const dialog = screen.getByRole('dialog', { name: 'Compare selected homes' })
    const download = within(dialog).getByRole('button', { name: 'Download comparison CSV' })
    await user.click(download)
    expect(within(dialog).getByRole('status')).toHaveTextContent('The download could not be prepared. Please try again.')
    await user.click(download)
    expect(within(dialog).getByRole('status')).toHaveTextContent('Comparison download prepared')
    await new Promise((resolve) => setTimeout(resolve, 1100))
  })

  it('provides a useful empty comparison instead of exporting an empty file', async () => {
    mockResponse({ properties: [property, corkProperty] })
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: `Add ${property.title} to comparison` }))
    await user.click(screen.getByRole('button', { name: `Add ${corkProperty.title} to comparison` }))
    await user.click(screen.getByRole('button', { name: 'Compare homes' }))
    const dialog = screen.getByRole('dialog', { name: 'Compare selected homes' })
    await user.click(within(dialog).getByRole('button', { name: `Remove ${property.title} from comparison` }))
    await user.click(within(dialog).getByRole('button', { name: `Remove ${corkProperty.title} from comparison` }))
    expect(within(dialog).getByRole('button', { name: 'Download comparison CSV' })).toBeDisabled()
    expect(within(dialog).getByText(/No homes selected/)).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'Browse homes' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps comparison keyboard focus inside and restores its opener', async () => {
    mockResponse({ properties: [property, corkProperty] })
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: `Add ${property.title} to comparison` }))
    await user.click(screen.getByRole('button', { name: `Add ${corkProperty.title} to comparison` }))
    const opener = screen.getByRole('button', { name: 'Compare homes' })
    await user.click(opener)
    const dialog = screen.getByRole('dialog', { name: 'Compare selected homes' })
    const close = within(dialog).getByRole('button', { name: 'Close comparison' })
    expect(close).toHaveFocus()
    await user.tab({ shift: true })
    const links = within(dialog).getAllByRole('link', { name: 'View property' })
    expect(links[links.length - 1]).toHaveFocus()
    await user.tab()
    expect(close).toHaveFocus()
    act(() => opener.focus())
    await user.tab()
    expect(close).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(opener).toHaveFocus()
  })

  it('restores the saved-search opener after its form autofocus', async () => {
    mockResponse({ properties: [property] })
    const user = userEvent.setup()
    render(<App />)
    const opener = await screen.findByRole('button', { name: 'Save search' })
    await user.click(opener)
    const dialog = screen.getByRole('dialog', { name: 'Save this search' })
    expect(dialog.contains(document.activeElement)).toBe(true)
    await user.keyboard('{Escape}')
    expect(opener).toHaveFocus()
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

  it('uses small uploaded-image thumbnails but keeps selected photos full resolution', async () => {
    const uploaded = { ...property, media: property.media.map((item, index) => index < 2 ? { ...item, url: `/api/v1/property-images/photo${index}.jpg` } : item) }
    mockResponse({ properties: [uploaded] })
    const user = userEvent.setup()
    render(<App />)
    expect(await screen.findByRole('img', { name: 'Front exterior of the home' })).toHaveAttribute('src', '/api/v1/property-images/photo0.jpg')
    const thumbnail = screen.getByRole('button', { name: 'View Bright open-plan living room' }).querySelector('img')
    expect(thumbnail).toHaveAttribute('src', '/api/v1/property-images/photo1.jpg?size=thumbnail')
    expect(thumbnail).toHaveAttribute('decoding', 'async')
    const plan = screen.getByRole('button', { name: 'View Measured floor plan of the property' }).querySelector('img')
    expect(plan).toHaveAttribute('src', property.media.find((item) => item.kind === 'floor_plan')!.url)
    await user.click(screen.getByRole('button', { name: 'View Bright open-plan living room' }))
    expect(screen.getByRole('img', { name: 'Bright open-plan living room' })).toHaveAttribute('src', '/api/v1/property-images/photo1.jpg')
    expect(screen.getByRole('img', { name: 'Bright open-plan living room' })).toHaveAttribute('decoding', 'async')
  })

  it.each([
    'https://images.example.test/home.jpg?token=demo',
    '/api/v1/property-images/photo.jpg?version=2',
    '/media/showcase/home.jpg',
  ])('preserves non-derivative gallery image URL %s', async (url) => {
    const media = property.media.map((item, index) => index === 1 ? { ...item, url } : item)
    mockResponse({ properties: [{ ...property, media }] })
    render(<App />)
    const button = await screen.findByRole('button', { name: 'View Bright open-plan living room' })
    expect(button.querySelector('img')).toHaveAttribute('src', url)
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
    let propertyRequests = 0
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (String(input) !== '/api/v1/properties') return new Response(null, { status: 401 })
      propertyRequests += 1
      return propertyRequests === 1
        ? new Response(null, { status: 503 })
        : Response.json({ properties: [property] })
    })
    const user = userEvent.setup()

    render(<App />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We could not load the homes.',
    )

    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('heading', { name: property.title })).toBeVisible()
    await waitFor(() => expect(fetchMock.mock.calls.filter(([input]) => String(input) === '/api/v1/properties')).toHaveLength(2))
  })
})

function mockResponse(body: unknown) {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(() => Promise.resolve(Response.json(body, { status: 200 })))
}

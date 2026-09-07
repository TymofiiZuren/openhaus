import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ManagerApp } from './ManagerApp'
import { clientSessionHintKey, managerSessionHintKey } from './SiteHeader'

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

const managerIdentity = { id: 'manager-1', email: 'manager@example.test' }

function managerWorkspaceResponse(input: RequestInfo | URL, properties: unknown[]) {
  if (String(input) === '/api/v1/client/session') return Promise.resolve(new Response(null, { status: 401 }))
  if (String(input) === '/api/v1/manager/session') return Promise.resolve(Response.json({ manager: managerIdentity }))
  return Promise.resolve(Response.json({ properties }))
}

afterEach(() => { vi.restoreAllMocks(); localStorage.removeItem(clientSessionHintKey); localStorage.removeItem(managerSessionHintKey); window.history.replaceState({}, '', '/') })

describe('manager application', () => {
  it('opens an unsaved draft form from the account-menu shortcut', async () => {
    window.history.replaceState({}, '', '/manager?action=new#manager-editor-title')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(input => managerWorkspaceResponse(input, [managedProperty]))
    render(<ManagerApp />)
    expect(await screen.findByRole('heading', { name: 'Add a property' })).toBeVisible()
    expect(screen.getByLabelText('Listing title')).toHaveValue('')
    expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false)
  })
  it('does not expose manager sign in while a client account is active', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(input => {
      if (String(input) === '/api/v1/client/session') return Promise.resolve(Response.json({ client: { id: 'buyer', email: 'buyer@example.test' } }))
      return Promise.resolve(new Response(null, { status: 401 }))
    })

    render(<ManagerApp />)

    expect(await screen.findByRole('heading', { name: 'Your client account is active.' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Manager sign in' })).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalledWith('/api/v1/manager/properties', expect.anything())
  })

  it('updates the manager boundary immediately after the active client logs out', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      if (String(input) === '/api/v1/client/session' && init?.method === 'DELETE') return Promise.resolve(new Response(null, { status: 204 }))
      if (String(input) === '/api/v1/client/session') return Promise.resolve(Response.json({ client: { id: 'buyer', email: 'buyer@example.test' } }))
      return Promise.resolve(new Response(null, { status: 401 }))
    })

    render(<ManagerApp />)
    expect(await screen.findByRole('heading', { name: 'Your client account is active.' })).toBeVisible()

    await userEvent.click(screen.getByRole('button', { name: 'Log out' }))

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/client/session', expect.objectContaining({ method: 'DELETE' }))
    expect(await screen.findByRole('heading', { name: 'Manager sign in' })).toBeVisible()
  })
  it('uses an account menu instead of a standalone live-site button', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(input => managerWorkspaceResponse(input, []))
    render(<ManagerApp />)
    await waitFor(() => expect(screen.queryByText('Loading manager workspace…')).not.toBeInTheDocument())
    expect(screen.getByRole('link', { name: 'OpenHaus home' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('button', { name: 'Open navigation' })).toBeVisible()
    expect(screen.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible()
    expect(screen.queryByRole('link', { name: 'View live site' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Manager account options' }))
    expect(screen.getByRole('link', { name: 'Analytics overview' })).toHaveAttribute('href', '/manager/analytics')
  })
  it('shows authenticated portfolio analytics from live manager data', async () => {
    window.history.replaceState({}, '', '/manager/analytics')
    vi.spyOn(globalThis, 'fetch').mockImplementation(input => managerWorkspaceResponse(input, [managedProperty, { ...managedProperty, id: 'published', status: 'published', media: [{ kind: 'image', url: '/photo.jpg', altText: 'Front', position: 0 }] }]))
    render(<ManagerApp />)
    expect(await screen.findByRole('heading', { name: 'Portfolio analytics' })).toBeVisible()
    expect(screen.getByText('2', { selector: '.manager-analytics-value' })).toBeVisible()
    expect(screen.getByText('1 published')).toBeVisible()
    expect(screen.getByText('1 with photography')).toBeVisible()
  })

  it('shows authenticated manager information on the profile page', async () => {
    window.history.replaceState({}, '', '/manager/profile')
    vi.spyOn(globalThis, 'fetch').mockImplementation(async input => String(input) === '/api/v1/manager/session'
      ? Response.json({ manager: { id: 'manager-1', email: 'manager@example.test' } })
      : Response.json({ properties: [managedProperty] }))

    render(<ManagerApp />)

    expect(await screen.findByRole('heading', { name: 'Account profile' })).toBeVisible()
    expect(screen.getByText('manager@example.test')).toBeVisible()
    expect(screen.getByText('OH-MANAGER1')).toHaveAttribute('title', 'manager-1')
    expect(screen.getByText('Manager', { selector: 'dd' })).toBeVisible()
    expect(screen.queryByText('Session security')).not.toBeInTheDocument()
  })

  it('changes the manager password and requires a fresh sign in', async () => {
    window.history.replaceState({}, '', '/manager/profile')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (String(input) === '/api/v1/client/session') return new Response(null, { status: 401 })
      if (String(input) === '/api/v1/manager/session') return Response.json({ manager: managerIdentity })
      if (String(input) === '/api/v1/manager/password' && init?.method === 'PUT') return new Response(null, { status: 204 })
      return Response.json({ properties: [managedProperty] })
    })
    const user = userEvent.setup()
    render(<ManagerApp />)

    await user.type(await screen.findByLabelText('Current password'), 'current password phrase')
    await user.type(screen.getByLabelText('New password'), 'new password phrase')
    await user.type(screen.getByLabelText('Confirm new password'), 'new password phrase')
    await user.click(screen.getByRole('button', { name: 'Update password' }))

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/manager/password', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ currentPassword: 'current password phrase', newPassword: 'new password phrase' }),
    }))
    expect(await screen.findByText('Password updated. Sign in again with your new password.')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Manager sign in' })).toBeVisible()
  })

  it('keeps the manager signed in when a password update is rejected', async () => {
    window.history.replaceState({}, '', '/manager/profile')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (String(input) === '/api/v1/client/session') return new Response(null, { status: 401 })
      if (String(input) === '/api/v1/manager/session') return Response.json({ manager: managerIdentity })
      if (String(input) === '/api/v1/manager/password' && init?.method === 'PUT') return new Response(null, { status: 401 })
      return Response.json({ properties: [managedProperty] })
    })
    const user = userEvent.setup()
    render(<ManagerApp />)

    await user.type(await screen.findByLabelText('Current password'), 'incorrect password')
    await user.type(screen.getByLabelText('New password'), 'new password phrase')
    await user.type(screen.getByLabelText('Confirm new password'), 'different password phrase')
    await user.click(screen.getByRole('button', { name: 'Update password' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The new passwords do not match.')
    expect(fetchMock.mock.calls.some(([input]) => String(input) === '/api/v1/manager/password')).toBe(false)

    await user.clear(screen.getByLabelText('Confirm new password'))
    await user.type(screen.getByLabelText('Confirm new password'), 'new password phrase')
    await user.click(screen.getByRole('button', { name: 'Update password' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The current password is incorrect.')
    expect(screen.getByRole('heading', { name: 'Account profile' })).toBeVisible()
  })

  it('confirms before signing out every manager session', async () => {
    window.history.replaceState({}, '', '/manager/profile')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (String(input) === '/api/v1/client/session') return new Response(null, { status: 401 })
      if (String(input) === '/api/v1/manager/session') return Response.json({ manager: managerIdentity })
      if (String(input) === '/api/v1/manager/sessions' && init?.method === 'DELETE') return new Response(null, { status: 204 })
      return Response.json({ properties: [managedProperty] })
    })
    const user = userEvent.setup()
    render(<ManagerApp />)

    await user.click(await screen.findByRole('button', { name: 'Sign out everywhere' }))
    expect(fetchMock).not.toHaveBeenCalledWith('/api/v1/manager/sessions', expect.anything())
    await user.click(screen.getByRole('button', { name: 'Confirm sign out everywhere' }))

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/manager/sessions', expect.objectContaining({ method: 'DELETE' }))
    expect(await screen.findByText('Every manager session has been signed out.')).toBeVisible()
  })
  it('provides a consistent cover preview for photographed and empty listings', async () => {
    const photographed = { ...managedProperty, id: 'photographed', title: 'Photographed home', media: [{ kind: 'image', url: '/photo.jpg', altText: 'House exterior', position: 0 }] }
    vi.spyOn(globalThis, 'fetch').mockImplementation(input => managerWorkspaceResponse(input, [managedProperty, photographed]))
    render(<ManagerApp />)
    await screen.findByRole('heading', { name: photographed.title })
    for (const article of screen.getAllByRole('article')) {
      expect(article.querySelector('.manager-cover-preview')).not.toBeNull()
    }
    expect(screen.getByAltText('House exterior')).toBeVisible()
    expect(screen.getByText('Architectural concept · example only')).toBeVisible()
    expect(screen.getByAltText('Architectural concept illustration — not a photograph of this property')).toHaveAttribute('src', '/media/placeholders/architectural-home.svg?v=3')
    expect(screen.getByAltText('Cover preview for Photographed home')).toHaveAttribute('src', '/photo.jpg')
  })
  it('shows a quiet missing-photo status instead of a placeholder card', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(input => managerWorkspaceResponse(input, [managedProperty]))
    render(<ManagerApp />)
    expect(await screen.findByText('No photos added')).toBeVisible()
    expect(screen.queryByText('Property photography')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Upload image' })).toBeVisible()
  })
  it('sorts listings without discarding media input or changing the active filter', async () => {
    const second = { ...managedProperty, id: 'second', title: 'Alder house', priceCents: 10000000, media: [{kind:'image',url:'/photo.jpg',altText:'Front',position:0}] }
    vi.spyOn(globalThis, 'fetch').mockImplementation(input => managerWorkspaceResponse(input, [managedProperty, second]))
    const user = userEvent.setup()
    render(<ManagerApp />)
    const sort = await screen.findByLabelText('Sort listings')
    await user.type(screen.getAllByLabelText('Image description')[0], 'Work in progress')
    await user.selectOptions(screen.getByLabelText('Filter listings by stage'), 'media-capture')
    await user.selectOptions(sort, 'price-low')
    expect(screen.getAllByRole('article')[0]).toHaveTextContent(second.title)
    await user.selectOptions(sort, 'price-high')
    expect(screen.getAllByRole('article')[0]).toHaveTextContent(managedProperty.title)
    expect(screen.getAllByLabelText('Image description')[0]).toHaveValue('Work in progress')
    await user.selectOptions(sort, 'title')
    expect(screen.getAllByRole('article')[0]).toHaveTextContent(second.title)
    await user.selectOptions(sort, 'readiness')
    expect(screen.getAllByRole('article')[0]).toHaveTextContent(managedProperty.title)
    expect(screen.getByLabelText('Filter listings by stage')).toHaveValue('media-capture')
  })
  it('switches to a compact portfolio without discarding unfinished media input', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(input => managerWorkspaceResponse(input, [managedProperty]))
    const user = userEvent.setup()
    render(<ManagerApp />)
    await user.type(await screen.findByLabelText('Image description'), 'Garden at sunset')
    await user.click(screen.getByRole('button', { name: 'Compact view' }))
    expect(screen.getByRole('button', { name: 'Compact view' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: 'Upload image' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: `Manage ${managedProperty.title}` }))
    expect(screen.getByLabelText('Image description')).toHaveValue('Garden at sunset')
    expect(screen.getByRole('button', { name: 'Upload image' })).toBeVisible()
  })
  it('offers authenticated publication previews for draft listings', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(input => managerWorkspaceResponse(input, [managedProperty]))
    render(<ManagerApp />)
    expect(await screen.findByRole('link', { name: 'Preview listing' })).toHaveAttribute('href', `/manager/preview/${managedProperty.id}`)
  })

  it('switches preview widths without publishing the draft', async () => {
    window.history.replaceState({}, '', `/manager/preview/${managedProperty.id}`)
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(input => managerWorkspaceResponse(input, [managedProperty]))
    const user = userEvent.setup()
    render(<ManagerApp />)
    const frame = await screen.findByTitle('Listing publication preview')
    expect(frame).toHaveAttribute('src', `/manager/preview/${managedProperty.id}?frame=1`)
    await user.click(screen.getByRole('button', { name: 'Mobile · 390px' }))
    expect(frame).toHaveStyle({ width: '390px' })
    expect(fetchMock.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true)
  })

  it('renders saved draft media through the protected preview image route', async () => {
    window.history.replaceState({}, '', `/manager/preview/${managedProperty.id}?frame=1`)
    vi.spyOn(globalThis, 'fetch').mockImplementation(input => managerWorkspaceResponse(input, [{ ...managedProperty, media: [{ kind: 'image', url: '/api/v1/property-images/test.png', altText: 'Front of the house', position: 0 }] }]))
    render(<ManagerApp />)
    expect(await screen.findByRole('heading', { name: managedProperty.title })).toBeVisible()
    expect(screen.getByRole('main', { name: 'Property details' })).toBeVisible()
    expect(screen.getAllByAltText('Front of the house')[0]).toHaveAttribute('src', '/api/v1/manager/property-images/test.png')
  })

  it('requires a manager session before showing a publication preview', async () => {
    window.history.replaceState({}, '', `/manager/preview/${managedProperty.id}?frame=1`)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 401 }))
    render(<ManagerApp />)
    expect(await screen.findByRole('heading', { name: 'Manager sign in' })).toBeVisible()
    expect(screen.queryByRole('main', { name: 'Property details' })).not.toBeInTheDocument()
    expect(screen.queryByTitle('Listing publication preview')).not.toBeInTheDocument()
  })
  it('searches across listing facts and combines search with the stage filter', async () => {
    const other = { ...managedProperty, id: 'second', title: 'Harbour house', addressLine1: 'Pier Road', city: 'Kinsale', county: 'Cork', status: 'published' }
    vi.spyOn(globalThis, 'fetch').mockImplementation(input => managerWorkspaceResponse(input, [managedProperty, other]))
    const user = userEvent.setup()
    render(<ManagerApp />)
    const search = await screen.findByRole('searchbox', { name: 'Search your listings' })
    for (const query of ['  HARBOUR ', 'pier road', 'kinsale', 'cork']) {
      await user.clear(search)
      await user.type(search, query)
      expect(screen.getByRole('heading', { name: other.title })).toBeVisible()
      expect(screen.queryByRole('heading', { name: managedProperty.title })).not.toBeInTheDocument()
      expect(screen.getByText('1 of 2 listings')).toBeVisible()
    }
    await user.selectOptions(screen.getByLabelText('Filter listings by stage'), 'media-capture')
    expect(screen.getByText('No listings match your search and stage.')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Reset filters' }))
    expect(search).toHaveValue('')
    expect(screen.getByRole('heading', { name: managedProperty.title })).toBeVisible()
    expect(screen.getByRole('heading', { name: other.title })).toBeVisible()
  })

  it('preserves an unfinished image description while filtering a listing out and back in', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(input => managerWorkspaceResponse(input, [managedProperty]))
    const user = userEvent.setup()
    render(<ManagerApp />)
    await user.type(await screen.findByLabelText('Image description'), 'Living room facing the garden')
    await user.type(screen.getByRole('searchbox', { name: 'Search your listings' }), 'no matching home')
    await user.click(screen.getByRole('button', { name: 'Reset filters' }))
    expect(screen.getByLabelText('Image description')).toHaveValue('Living room facing the garden')
  })
  it('retries a failed media refresh without uploading the video twice', async () => {
    let reads = 0
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (String(input) === '/api/v1/client/session') return new Response(null, { status: 401 })
      if (String(input) === '/api/v1/manager/session') return Response.json({ manager: { id: 'manager-1', email: 'manager@example.test' } })
      if (String(input).endsWith('/videos')) return Response.json({ id: 'job-1', status: 'pending' })
      if (String(input).includes('/media-jobs/')) return Response.json({ id: 'job-1', status: 'ready' })
      reads++
      if (reads === 2) return new Response(null, { status: 503 })
      return Response.json({ properties: [{ ...managedProperty, media: reads > 2 ? [{ kind: 'video', url: '/media/tour.mp4', position: 0, altText: 'Video' }] : [] }] })
    })
    const user = userEvent.setup()
    render(<ManagerApp />)
    await user.upload(await screen.findByLabelText(`Choose video for ${managedProperty.title}`), new File(['video'], 'tour.mp4', { type: 'video/mp4' }))
    await user.click(screen.getByRole('button', { name: 'Upload video' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Video processed, but listing readiness could not be refreshed')
    expect(screen.getByText('63% complete')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Refresh listing media' }))
    expect(await screen.findByText('75% complete')).toBeVisible()
    expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith('/videos'))).toHaveLength(1)
  })
  it('refreshes readiness after video processing without reloading the workspace', async () => {
    let ready = false
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (String(input) === '/api/v1/client/session') return new Response(null, { status: 401 })
      if (String(input) === '/api/v1/manager/session') return Response.json({ manager: managerIdentity })
      if (String(input).endsWith('/videos')) return Response.json({ id: 'job-1', status: 'pending' })
      if (String(input).includes('/media-jobs/')) { ready = true; return Response.json({ id: 'job-1', status: 'ready' }) }
      return Response.json({ properties: [{ ...managedProperty, media: ready ? [{ kind: 'video', url: '/media/tour.mp4', position: 0, altText: 'Video' }] : [] }] })
    })
    const user = userEvent.setup()
    render(<ManagerApp />)
    await user.upload(await screen.findByLabelText(`Choose video for ${managedProperty.title}`), new File(['video'], 'tour.mp4', { type: 'video/mp4' }))
    await user.click(screen.getByRole('button', { name: 'Upload video' }))
    expect(await screen.findByText('Video tour ready.')).toBeVisible()
    expect(screen.getByText('75% complete')).toBeVisible()
    expect(screen.getByText('Review checklist · 2 missing')).toBeVisible()
  })
  it('explains the readiness score with missing media and completed facts', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(input => managerWorkspaceResponse(input, [managedProperty]))
    const user = userEvent.setup()
    render(<ManagerApp />)

    await user.click(await screen.findByText('Review checklist · 3 missing'))
    const checklist = screen.getByRole('list', { name: `Readiness checks for ${managedProperty.title}` })
    expect(within(checklist).getByText('Photography').closest('li')).toHaveTextContent('Missing')
    expect(within(checklist).getByText('Title and address').closest('li')).toHaveTextContent('Complete')
    expect(within(checklist).getByText('Floor plan').closest('li')).toHaveTextContent('Missing')
    await user.click(screen.getByRole('button', { name: 'Edit property facts' }))
    expect(screen.getByLabelText('Listing title')).toHaveValue(managedProperty.title)
  })

  it('previews a saved tour on a draft without making the listing public', async () => {
    const draft = { ...managedProperty, media: [{ url: 'https://kuula.co/share/LTPpc', kind: 'panorama', altText: 'Tour', position: 0 }] }
    vi.spyOn(globalThis, 'fetch').mockImplementation(input => managerWorkspaceResponse(input, [draft]))
    const user = userEvent.setup()
    render(<ManagerApp />)

    await user.click(await screen.findByText('Preview saved 360° tour'))
    expect(screen.queryByTitle(`${managedProperty.title} manager preview`)).not.toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'Enter 360° tour' }))
    expect(screen.getByTitle(`${managedProperty.title} manager preview`)).toHaveAttribute('src', expect.stringContaining('https://kuula.co/share/LTPpc'))
    expect(screen.queryByRole('link', { name: /View public listing/ })).not.toBeInTheDocument()
  })
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
    expect(screen.getAllByText('Media capture').some((element) => element.classList.contains('manager-workflow-stage'))).toBe(true)
    expect(screen.getByText('63% complete')).toBeVisible()
    expect(screen.getByLabelText(`${managedProperty.title} completeness`)).toHaveAttribute('value', '63')
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/manager/session', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ email: 'manager@openhaus.ie', password: 'correct horse battery staple' }),
    }))
  })

  it('filters the listing pipeline by workflow stage', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(input => managerWorkspaceResponse(input, [managedProperty]))
    const user = userEvent.setup()

    render(<ManagerApp />)

    expect(await screen.findByRole('heading', { name: managedProperty.title })).toBeVisible()
    await user.selectOptions(screen.getByLabelText('Filter listings by stage'), 'live')

    expect(screen.queryByRole('heading', { name: managedProperty.title })).not.toBeInTheDocument()
    expect(screen.getByText('No listings match this stage.')).toBeVisible()
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
      if (String(input) === '/api/v1/client/session') return new Response(null, { status: 401 })
      if (String(input) === '/api/v1/manager/session' && init?.method === 'DELETE') {
        return new Response(null, { status: 204 })
      }
      if (String(input) === '/api/v1/manager/session') return Response.json({ manager: managerIdentity })
      return Response.json({ properties: [managedProperty] })
    })
    const user = userEvent.setup()

    render(<ManagerApp />)
    await user.click(await screen.findByRole('button', { name: 'Log out' }))

    expect(await screen.findByRole('heading', { name: 'Manager sign in' })).toBeVisible()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/v1/manager/session', { method: 'DELETE' }))
  })

  it('keeps the authenticated workspace visible when logout is not confirmed', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (String(input) === '/api/v1/client/session') return new Response(null, { status: 401 })
      if (String(input) === '/api/v1/manager/session' && init?.method === 'DELETE') return new Response(null, { status: 503 })
      if (String(input) === '/api/v1/manager/session') return Response.json({ manager: managerIdentity })
      return Response.json({ properties: [managedProperty] })
    })
    render(<ManagerApp />)

    await userEvent.click(await screen.findByRole('button', { name: 'Log out' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('could not confirm sign-out')
    expect(screen.getByRole('button', { name: 'Manager account options' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Manager sign in' })).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/manager/session', { method: 'DELETE' })
  })

  it('creates a draft listing from the manager workspace', async () => {
	const properties = [managedProperty]
	const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		if (String(input) === '/api/v1/client/session') return new Response(null, { status: 401 })
		if (String(input) === '/api/v1/manager/session') return Response.json({ manager: managerIdentity })
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
		if (String(input) === '/api/v1/client/session') return new Response(null, { status: 401 })
		if (String(input) === '/api/v1/manager/session') return Response.json({ manager: managerIdentity })
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
	let processed = false
	const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		const url = String(input)
		if (url === '/api/v1/client/session') return new Response(null, { status: 401 })
		if (url === '/api/v1/manager/session') return Response.json({ manager: managerIdentity })
		if (url.endsWith('/videos') && init?.method === 'POST') return Response.json({ id: 'job-1', propertyId: managedProperty.id, status: 'pending', attempts: 0, createdAt: '2026-08-28T00:00:00Z' }, { status: 202 })
		if (url.endsWith('/media-jobs/job-1')) { processed = true; return Response.json({ id: 'job-1', propertyId: managedProperty.id, status: 'ready', attempts: 1, createdAt: '2026-08-28T00:00:00Z' }) }
		return Response.json({ properties: [{ ...managedProperty, media: processed ? [{ kind: 'video', url: '/media/tour.mp4', altText: 'Video tour', position: 0 }] : [] }] })
	})
	const user = userEvent.setup()
	render(<ManagerApp />)
	await user.upload(await screen.findByLabelText(`Choose video for ${managedProperty.title}`), new File(['video'], 'tour.mp4', { type: 'video/mp4' }))
	await user.click(screen.getByRole('button', { name: 'Upload video' }))
	expect(await screen.findByText('Video tour ready.')).toBeVisible()
	expect(fetchMock).toHaveBeenCalledWith(`/api/v1/manager/properties/${managedProperty.id}/videos`, expect.objectContaining({ method: 'POST' }))
  })

  it('attaches a Kuula tour to a listing record', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (String(input) === '/api/v1/client/session') return new Response(null, { status: 401 })
      if (String(input) === '/api/v1/manager/session') return Response.json({ manager: managerIdentity })
      if (String(input).endsWith('/panorama') && init?.method === 'PUT') return Response.json({ url: 'https://kuula.co/share/LTPpc?fs=1', kind: 'panorama', altText: `360° tour of ${managedProperty.title}`, position: 0 })
      return Response.json({ properties: [managedProperty] })
    })
    const user = userEvent.setup()
    render(<ManagerApp />)
    await user.type(await screen.findByLabelText('Add Kuula 360° tour'), 'https://kuula.co/share/LTPpc?fs=1')
    await user.click(screen.getByRole('button', { name: 'Attach tour' }))
    expect(await screen.findByText('360° tour attached.')).toHaveAttribute('role', 'status')
    expect(fetchMock).toHaveBeenCalledWith(`/api/v1/manager/properties/${managedProperty.id}/panorama`, expect.objectContaining({ method: 'PUT' }))
  })

  it('confirms before removing a panorama from a listing', async () => {
    const propertyWithTour = { ...managedProperty, media: [...managedProperty.media, { url: 'https://kuula.co/share/LTPpc', kind: 'panorama' as const, altText: '360 tour', position: 4 }] }
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (String(input) === '/api/v1/client/session') return new Response(null, { status: 401 })
      if (String(input) === '/api/v1/manager/session') return Response.json({ manager: managerIdentity })
      if (String(input).endsWith('/panorama') && init?.method === 'DELETE') return new Response(null, { status: 204 })
      return Response.json({ properties: [propertyWithTour] })
    })
    const user = userEvent.setup()
    render(<ManagerApp />)

    await user.click(await screen.findByRole('button', { name: `Remove 360° tour from ${managedProperty.title}` }))
    expect(screen.getByText('Remove this tour?')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Confirm remove tour' }))

    expect(await screen.findByText('360° tour removed.')).toHaveAttribute('role', 'status')
    expect(fetchMock).toHaveBeenCalledWith(`/api/v1/manager/properties/${managedProperty.id}/panorama`, expect.objectContaining({ method: 'DELETE' }))
  })
})

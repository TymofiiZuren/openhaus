import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { Application, ApplicationBoundary } from './Application'

const loaded = vi.hoisted(() => ({ public: vi.fn(), manager: vi.fn(), discovery: vi.fn(), agents: vi.fn() }))
vi.mock('./App', () => {
  loaded.public()
  return { default: () => <h1>Public catalogue</h1> }
})
vi.mock('./ManagerApp', () => {
  loaded.manager()
  return { ManagerApp: () => <h1>Staff workspace</h1> }
})
vi.mock('./DiscoveryApp', () => {
  loaded.discovery()
  return { DiscoveryApp: ({ page }: { page: string }) => <h1>{page === 'match' ? 'Match workspace' : 'Area workspace'}</h1> }
})
vi.mock('./AgentPages', () => {
  loaded.agents()
  return { AgentPages: ({ slug }: { slug?: string }) => <h1>{slug ? `Agent ${slug}` : 'Agent directory'}</h1> }
})
afterEach(() => { vi.restoreAllMocks(); window.history.replaceState({}, '', '/') })

it('opens the engineering lab with honest sample labels', async () => {
  render(<Application pathname="/media-lab" />)
  expect(await screen.findByRole('heading', { name: 'See beyond the image.' })).toBeInTheDocument()
  expect(screen.getByText(/fictional property · not for sale/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Sobel edges' })).toBeDisabled()
})

it.each(['/missing-page', '/client/missing-page', '/properties/one/missing-page'])('shows a recoverable not-found page for %s', async pathname => {
  render(<Application pathname={pathname} />)
  expect(await screen.findByRole('heading', { name: 'Page not found.' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Back to property search' })).toHaveAttribute('href', '/#explore')
  expect(screen.queryByRole('heading', { name: 'Public catalogue' })).not.toBeInTheDocument()
})

it('opens client registration without exposing a form when accounts are disabled', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 404 }))
  render(<Application pathname="/client/register" />)
  expect(await screen.findByRole('heading', { name: 'Make room for what’s next.' })).toBeInTheDocument()
  expect(await screen.findByText('Client accounts are not enabled.')).toBeInTheDocument()
})

it.each([
  ['/about', 'A fuller picture of home.'],
  ['/contact', 'Start a conversation.'],
  ['/help', 'A little clarity.'],
  ['/privacy/', 'Your information, explained.'],
  ['/services', 'Property decisions, connected.'],
  ['/buyers', 'A clearer path to the right home.'],
  ['/sellers', 'Present every home with precision.'],
  ['/accessibility', 'Open to more ways of browsing.'],
  ['/terms', 'The boundaries of this demonstration.'],
  ['/roadmap', 'Building the complete property workspace.'],
])('opens the information route %s', async (pathname, title) => {
  render(<Application pathname={pathname} />)
  expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument()
})

it.each([
  ['/agents', 'Agent directory'],
  ['/agents/aoife-byrne', 'Agent aoife-byrne'],
])('opens the agent route %s', async (pathname, title) => {
  render(<Application pathname={pathname} />)
  expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument()
})

it.each([
  ['/match', 'Match workspace'],
  ['/areas/', 'Area workspace'],
])('opens the discovery route %s', async (pathname, title) => {
  render(<Application pathname={pathname} />)
  expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument()
})

it('loads the public catalogue without importing staff tools', async () => {
  render(<Application pathname="/" />)
  expect(screen.queryByText('Preparing your visit')).not.toBeInTheDocument()
  expect(await screen.findByRole('heading', { name: 'Public catalogue' })).toBeInTheDocument()
  expect(loaded.manager).not.toHaveBeenCalled()
})

it('opens the property guide without leaving an information page', async () => {
  window.history.replaceState({}, '', '/about')
  vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
    if (String(input) === '/api/v1/properties') return Response.json({ properties: [] })
    return new Response(null, { status: 401 })
  })
  render(<Application pathname="/about" />)

  expect(await screen.findByRole('heading', { name: 'A fuller picture of home.' })).toBeVisible()
  await userEvent.click(screen.getByRole('button', { name: 'Open OpenHaus guide' }))

  expect(await screen.findByRole('dialog', { name: 'OpenHaus guide' })).toBeVisible()
  expect(await screen.findByText('Catalogue ready · 0 homes indexed')).toBeVisible()
  expect(screen.getByRole('heading', { name: 'A fuller picture of home.' })).toBeVisible()
  expect(window.location.pathname).toBe('/about')
})

it.each(['/manager/login', '/manager/analytics', '/manager/profile'])('loads staff tools for the manager route %s', async pathname => {
  render(<Application pathname={pathname} />)
  expect(await screen.findByRole('heading', { name: 'Staff workspace' })).toBeInTheDocument()
})

it('offers a fresh page load and home link after a loading failure', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  function FailedRoute(): never { throw new Error('Chunk unavailable') }
  render(<ApplicationBoundary><FailedRoute /></ApplicationBoundary>)
  expect(screen.getByRole('alert')).toHaveTextContent('Please reload the page')
  expect(screen.getByRole('button', { name: 'Reload page' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Back to OpenHaus' })).toHaveAttribute('href', '/')
})

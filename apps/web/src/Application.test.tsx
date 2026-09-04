import { render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Application, ApplicationBoundary } from './Application'

const loaded = vi.hoisted(() => ({ public: vi.fn(), manager: vi.fn() }))
vi.mock('./App', () => {
  loaded.public()
  return { default: () => <h1>Public catalogue</h1> }
})
vi.mock('./ManagerApp', () => {
  loaded.manager()
  return { ManagerApp: () => <h1>Staff workspace</h1> }
})
afterEach(() => { vi.restoreAllMocks() })

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
])('opens the information route %s', async (pathname, title) => {
  render(<Application pathname={pathname} />)
  expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument()
})

it('loads the public catalogue without importing staff tools', async () => {
  render(<Application pathname="/" />)
  expect(screen.queryByText('Preparing your visit')).not.toBeInTheDocument()
  expect(await screen.findByRole('heading', { name: 'Public catalogue' })).toBeInTheDocument()
  expect(loaded.manager).not.toHaveBeenCalled()
})

it('loads staff tools for a manager deep link', async () => {
  render(<Application pathname="/manager/login" />)
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

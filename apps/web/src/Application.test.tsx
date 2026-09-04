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

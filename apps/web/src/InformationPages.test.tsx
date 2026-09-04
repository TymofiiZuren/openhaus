import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { InformationPages } from './InformationPages'

afterEach(() => { localStorage.clear(); vi.restoreAllMocks() })

it('filters help answers and gives a useful empty state', async () => {
  render(<InformationPages page="help" />)
  await userEvent.type(screen.getByRole('searchbox', { name: 'Search help' }), 'panorama')
  expect(screen.getByText('How do I open a 360° tour?')).toBeVisible()
  expect(screen.queryByText('Can I sign in as a buyer?')).not.toBeInTheDocument()
  await userEvent.clear(screen.getByRole('searchbox', { name: 'Search help' }))
  await userEvent.type(screen.getByRole('searchbox', { name: 'Search help' }), 'xyzxyz')
  expect(screen.getByRole('status')).toHaveTextContent('No matching answers')
})

it('requires confirmation and only clears browser-saved buyer data', async () => {
  localStorage.setItem('openhaus:property-notes:one', 'private notes')
  localStorage.setItem('openhaus:comparison:v1', '["one"]')
  localStorage.setItem('openhaus-appearance', 'dark')
  localStorage.setItem('unrelated', 'keep')
  render(<InformationPages page="privacy" />)
  const clear = screen.getByRole('button', { name: 'Clear saved buyer data' })
  expect(clear).toBeDisabled()
  await userEvent.click(screen.getByRole('checkbox'))
  await userEvent.click(clear)
  expect(localStorage.getItem('openhaus:property-notes:one')).toBeNull()
  expect(localStorage.getItem('openhaus:comparison:v1')).toBeNull()
  expect(localStorage.getItem('openhaus-appearance')).toBe('dark')
  expect(localStorage.getItem('unrelated')).toBe('keep')
  expect(screen.getByRole('status')).toHaveTextContent('Cleared')
  expect(screen.getByText(/Account-saved homes are server records/)).toBeVisible()
})

it('does not invent contact details or claim a final privacy policy', () => {
  render(<InformationPages page="contact" />)
  expect(screen.getByText(/Contact details are not configured/)).toBeVisible()
})

it('reports blocked storage without claiming deletion succeeded', async () => {
  render(<InformationPages page="privacy" />)
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('blocked') })
  localStorage.setItem('openhaus:comparison:v1', '[]')
  await userEvent.click(screen.getByRole('checkbox'))
  await userEvent.click(screen.getByRole('button', { name: 'Clear saved buyer data' }))
  expect(screen.getByRole('alert')).toHaveTextContent('could not be fully cleared')
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

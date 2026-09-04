import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { PropertyDetailPage } from './App'
import type { Property } from './api/properties'

const property: Property = { id: 'notes-test', title: 'Test home', addressLine1: 'Example street', city: 'Dublin', county: 'Dublin', priceCents: 50000000, bedrooms: 3, propertyType: 'detached', latitude: 53.3, longitude: -6.2, media: [] }
afterEach(() => { localStorage.clear(); vi.restoreAllMocks() })
it.each(['null', '{"notes":null,"questions":[]}', '{"notes":"","questions":null}', '{"notes":0,"questions":[null,4]}'])('keeps a property usable with malformed saved notes (%s)', async saved => {
  localStorage.setItem('openhaus:property-notes:notes-test', saved)
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 404 }))
  render(<PropertyDetailPage property={property} status="success" onRetry={() => {}} />)
  await userEvent.click(screen.getByRole('button', { name: 'Add property notes' }))
  expect(screen.getByLabelText('Private notes')).toHaveValue('')
})
it('keeps the draft and dialog open when browser storage rejects a save, then allows retry', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 404 }))
  render(<PropertyDetailPage property={property} status="success" onRetry={() => {}} />)
  await userEvent.click(screen.getByRole('button', { name: 'Add property notes' }))
  const dialog = screen.getByRole('dialog')
  await userEvent.type(within(dialog).getByLabelText('Private notes'), 'Check the garden.')
  const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage unavailable') })
  await userEvent.click(within(dialog).getByRole('button', { name: 'Save property notes' }))
  expect(within(dialog).getByRole('alert')).toHaveTextContent('could not be saved')
  expect(within(dialog).getByLabelText('Private notes')).toHaveValue('Check the garden.')
  storage.mockRestore()
  await userEvent.click(within(dialog).getByRole('button', { name: 'Save property notes' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByText('Notes saved locally')).toBeInTheDocument()
})

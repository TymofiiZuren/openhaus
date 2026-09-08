import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { GooglePropertyMap } from './GooglePropertyMap'
import { loadGoogleMaps, type GoogleMaps } from './googleMapsLoader'

vi.mock('./googleMapsLoader', () => ({ loadGoogleMaps: vi.fn() }))
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.mocked(loadGoogleMaps).mockReset(); delete window.google })

const props = {
  properties: [], selectedCounty: 'Dublin', areas: [], availableCounties: ['Dublin'],
  onSelectCounty: vi.fn(), onSelectArea: vi.fn(), onSelectProperty: vi.fn(), onDismissProperty: vi.fn(),
}

it('retries a failed startup without changing the selected location', async () => {
  vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key')
  let resolve!: (maps: GoogleMaps) => void
  vi.mocked(loadGoogleMaps).mockRejectedValueOnce(new Error('offline'))
    .mockImplementationOnce(() => new Promise(done => { resolve = done }))
  const remove = vi.fn()
  const maps = { Map: class { addListener() { return { remove } } setOptions() {} } } as unknown as GoogleMaps
  const { unmount } = render(<GooglePropertyMap {...props} />)
  const retry = await screen.findByRole('button', { name: 'Retry map' })
  retry.focus()
  await userEvent.keyboard('{Enter}')
  await waitFor(() => expect(loadGoogleMaps).toHaveBeenCalledTimes(2))
  expect(screen.getByText('Loading map…')).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Retry map' })).not.toBeInTheDocument()
  await act(async () => resolve(maps))
  expect(screen.getByRole('button', { name: 'Recenter current area' })).toBeVisible()
  expect(props.onSelectCounty).not.toHaveBeenCalled()
  expect(props.onSelectArea).not.toHaveBeenCalled()
  unmount()
  expect(remove).toHaveBeenCalledOnce()
})

it('does not offer a retry when map configuration is absent', () => {
  vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', '')
  render(<GooglePropertyMap {...props} />)
  expect(screen.getByText('Map is not available.')).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Retry map' })).not.toBeInTheDocument()
  expect(loadGoogleMaps).not.toHaveBeenCalled()
})

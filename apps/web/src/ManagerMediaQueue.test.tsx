import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { ManagerMediaQueue } from './ManagerMediaQueue'

const snapshot = { observedAt: '2026-09-18T12:00:00Z', pending: 2, processing: 3, ready: 4, failed: 1, recoverable: 1, exhausted: 1, oldestPendingSeconds: 120 }
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

it('shows the snapshot, explains recovery subsets, and refreshes without mutations', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json(snapshot)).mockResolvedValueOnce(Response.json({ ...snapshot, pending: 0, oldestPendingSeconds: null }))
  render(<ManagerMediaQueue />)
  expect(await screen.findByText('2 min')).toBeVisible()
  expect(screen.getByText(/eligible for recovery/)).toBeVisible()
  await userEvent.click(screen.getByRole('button', { name: 'Refresh queue' }))
  expect(await screen.findByText('No waiting jobs')).toBeVisible()
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(fetchMock).toHaveBeenLastCalledWith('/api/v1/manager/media-queue', expect.objectContaining({ cache: 'no-store', credentials: 'same-origin' }))
})

it('keeps the last snapshot marked stale when a refresh fails', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json(snapshot)).mockResolvedValueOnce(new Response(null, { status: 503 }))
  render(<ManagerMediaQueue />)
  await screen.findByText('2 min')
  await userEvent.click(screen.getByRole('button', { name: 'Refresh queue' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Showing the last snapshot')
  expect(screen.getByText('2 min')).toBeVisible()
})

it.each([{ ...snapshot, pending: -1 }, { ...snapshot, recoverable: 5 }, { ...snapshot, observedAt: 'invalid' }, { ...snapshot, oldestPendingSeconds: null }])('rejects an invalid snapshot', async value => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(value))
  render(<ManagerMediaQueue />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Queue status is unavailable')
  expect(screen.queryByRole('definition')).not.toBeInTheDocument()
})

it('clears private counts when the session expires', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json(snapshot)).mockResolvedValueOnce(new Response(null, { status: 401 }))
  render(<ManagerMediaQueue />)
  await screen.findByText('2 min')
  await userEvent.click(screen.getByRole('button', { name: 'Refresh queue' }))
  const alert = await screen.findByRole('alert')
  expect(within(alert).getByRole('link', { name: 'Sign in again' })).toHaveAttribute('href', '/manager/login')
  expect(screen.queryByText('2 min')).not.toBeInTheDocument()
})

it('cancels the request when the panel unmounts', async () => {
  let signal: AbortSignal | undefined
  vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => { signal = init?.signal as AbortSignal; return new Promise(() => {}) })
  const view = render(<ManagerMediaQueue />)
  await waitFor(() => expect(signal).toBeDefined())
  view.unmount()
  expect(signal?.aborted).toBe(true)
})

it('offers recovery when the queue request times out', async () => {
  vi.useFakeTimers()
  vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
  }))
  render(<ManagerMediaQueue />)
  expect(screen.getByRole('button', { name: 'Refresh queue' })).toBeDisabled()
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
  expect(screen.getByRole('alert')).toHaveTextContent('Queue status is unavailable')
  expect(screen.getByRole('button', { name: 'Refresh queue' })).toBeEnabled()
})

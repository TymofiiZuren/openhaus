import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { runProcessingBenchmark } from './processingBenchmark'
import { ComputeComparison } from './ComputeComparison'
vi.mock('./processingBenchmark', () => ({ runProcessingBenchmark: vi.fn() }))
beforeEach(() => vi.clearAllMocks())
it('runs only on request and allows cancellation', async () => {
  vi.mocked(runProcessingBenchmark).mockImplementation(signal => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')))))
  render(<ComputeComparison />)
  expect(runProcessingBenchmark).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Run processing comparison' }))
  expect(screen.getByRole('button', { name: 'Running comparison…' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel comparison' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Run processing comparison' })).toBeEnabled())
  expect(screen.getByRole('status')).toHaveTextContent('cancelled')
})
it('aborts work when leaving the page', () => {
  let activeSignal!: AbortSignal
  vi.mocked(runProcessingBenchmark).mockImplementation(signal => { activeSignal = signal; return new Promise(() => {}) })
  const { unmount } = render(<ComputeComparison />)
  fireEvent.click(screen.getByRole('button', { name: 'Run processing comparison' }))
  unmount()
  expect(activeSignal.aborted).toBe(true)
})

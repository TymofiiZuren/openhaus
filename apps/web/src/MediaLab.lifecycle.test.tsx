import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MediaLab } from './MediaLab'
import { analysePixels } from './mediaAnalysis'

vi.mock('./SiteHeader', () => ({ SiteHeader: () => null }))
vi.mock('./MediaAudit', () => ({ MediaAudit: () => null }))
vi.mock('./TonalComparison', () => ({ TonalComparison: () => null }))
vi.mock('./ComputeComparison', () => ({ ComputeComparison: () => null }))

let images: FakeImage[]
let workers: FakeWorker[]
class FakeImage {
  naturalWidth = 3
  naturalHeight = 3
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  src = ''
  constructor() { images.push(this) }
}
class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null
  onmessageerror: (() => void) | null = null
  onerror: (() => void) | null = null
  postMessage = vi.fn()
  terminate = vi.fn()
  constructor() { workers.push(this) }
}
beforeEach(() => {
  images = []; workers = []
  vi.stubGlobal('Image', FakeImage)
  vi.stubGlobal('Worker', FakeWorker)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(), putImageData: vi.fn(), getImageData: () => ({ data: new Uint8ClampedArray(36) }),
  } as unknown as CanvasRenderingContext2D)
})

it('retries the same photo with a fresh worker and publishes recovered measurements', () => {
  vi.stubGlobal('ImageData', class {})
  render(<MediaLab />)
  act(() => images[0].onload?.())
  act(() => workers[0].onerror?.())
  fireEvent.click(screen.getByRole('button', { name: 'Retry analysis' }))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('Analysing')
  expect(screen.queryByRole('button', { name: 'Retry analysis' })).not.toBeInTheDocument()
  expect(images[1].src).toBe(images[0].src)
  act(() => images[1].onload?.())
  const result = { ...analysePixels(new Uint8ClampedArray(36), 3, 3), elapsedMs: 1 }
  act(() => workers[1].onmessage?.({ data: result } as MessageEvent))
  expect(screen.getByRole('heading', { name: 'Light & detail' })).toBeVisible()
  expect(screen.getByRole('link', { name: /Download analysis report/ })).toBeVisible()
  expect(workers[1].terminate).toHaveBeenCalled()
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('reports unreadable worker responses and releases the failed worker', () => {
  render(<MediaLab />)
  act(() => images[0].onload?.())
  act(() => workers[0].onmessageerror?.())
  expect(screen.getByRole('alert')).toHaveTextContent('could not be read')
  expect(workers[0].terminate).toHaveBeenCalled()
  expect(workers[0].onmessage).toBeNull()
})

it('releases the worker if transferring pixels fails', () => {
  render(<MediaLab />)
  // Install a throwing worker before the image finishes decoding.
  vi.stubGlobal('Worker', class extends FakeWorker {
    constructor() { super(); this.postMessage.mockImplementation(() => { throw new Error('transfer failed') }) }
  })
  act(() => images[0].onload?.())
  expect(screen.getByRole('alert')).toHaveTextContent('Could not prepare')
  expect(workers[0].terminate).toHaveBeenCalled()
})

it('detaches callbacks and terminates analysis when switching samples', () => {
  render(<MediaLab />)
  act(() => images[0].onload?.())
  const lateMessage = workers[0].onmessage
  fireEvent.click(screen.getByRole('button', { name: /Coastal living room/ }))
  expect(workers[0].terminate).toHaveBeenCalled()
  expect(workers[0].onmessage).toBeNull()
  expect(images[0].onload).toBeNull()
  act(() => images[1].onload?.())
  act(() => lateMessage?.({ data: { error: 'Old analysis failed' } } as MessageEvent))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(workers).toHaveLength(2)
  expect(workers[1].terminate).not.toHaveBeenCalled()
})

import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { CubemapViewer } from './CubemapViewer'

const faces = ['front', 'right', 'back', 'left', 'top', 'bottom'].map(name => ({ name, url: `blob:${name}` }))
it('reports a stalled face load instead of preparing forever', () => {
  vi.useFakeTimers()
  try {
    const { unmount } = render(<CubemapViewer faces={faces} />)
    act(() => vi.advanceTimersByTime(10_000))
    Array.from(document.querySelectorAll('.cubemap-face')).slice(0, 5).forEach(image => fireEvent.load(image))
    act(() => vi.advanceTimersByTime(5_000))
    expect(screen.getByRole('alert')).toHaveTextContent('Inspect faces')
    expect(screen.queryByText('Preparing interactive view…')).not.toBeInTheDocument()
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  } finally { vi.useRealTimers() }
})
it('releases the pending deadline when leaving the interactive view', () => {
  vi.useFakeTimers()
  try {
    const { unmount } = render(<CubemapViewer faces={faces} />)
    expect(vi.getTimerCount()).toBe(1)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  } finally { vi.useRealTimers() }
})
it('cancels the loading deadline once all faces are displayed', () => {
  vi.useFakeTimers()
  try {
    const { unmount } = render(<CubemapViewer faces={faces} />)
    Array.from(document.querySelectorAll('.cubemap-face')).forEach(image => fireEvent.load(image))
    act(() => vi.advanceTimersByTime(15_000))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(document.querySelector('.cubemap-cube')).toHaveStyle({ visibility: 'visible' })
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  } finally { vi.useRealTimers() }
})
it('supports keyboard viewing, bounded pitch and zoom, and reset', () => {
  render(<CubemapViewer faces={faces} />)
  const stage = screen.getByRole('region', { name: 'Interactive native panorama' })
  fireEvent.keyDown(stage, { key: 'ArrowRight' })
  expect(screen.getByText('Heading 15° · Tilt 0° · Field of view 75°')).toBeInTheDocument()
  for (let i = 0; i < 20; i++) fireEvent.click(screen.getByRole('button', { name: 'Look up' }))
  expect(screen.getByText(/Tilt 89°/)).toBeInTheDocument()
  for (let i = 0; i < 20; i++) fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
  expect(screen.getByRole('button', { name: 'Zoom in' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Reset view' }))
  expect(screen.getByText('Heading 0° · Tilt 0° · Field of view 75°')).toBeInTheDocument()
})
it('keeps the six producer face orientations and permits keyboard exit', () => {
  render(<CubemapViewer faces={faces} />)
  for (const face of faces) expect(document.querySelector(`[data-face="${face.name}"]`)).toHaveAttribute('src', face.url)
  const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
  screen.getByRole('region', { name: 'Interactive native panorama' }).dispatchEvent(event)
  expect(event.defaultPrevented).toBe(false)
})
it('reveals the cube only after every face loads and reports failures', () => {
  render(<CubemapViewer faces={faces} />)
  const cube = document.querySelector('.cubemap-cube')!
  expect(cube).toHaveStyle({ visibility: 'hidden' })
  const images = Array.from(document.querySelectorAll('.cubemap-face'))
  images.slice(0, 5).forEach(image => fireEvent.load(image))
  expect(cube).toHaveStyle({ visibility: 'hidden' })
  fireEvent.load(images[5])
  expect(cube).toHaveStyle({ visibility: 'visible' })
  fireEvent.error(images[5])
  expect(screen.getByRole('alert')).toHaveTextContent('Inspect faces')
  expect(cube).toHaveStyle({ visibility: 'hidden' })
})
it('stops dragging on cancellation and preserves vertical touch scrolling', () => {
  render(<CubemapViewer faces={faces} />)
  const stage = screen.getByRole('region', { name: 'Interactive native panorama' })
  stage.setPointerCapture = vi.fn()
  const pointer = (type: string, x: number, y: number) => fireEvent(stage, Object.assign(new Event(type, { bubbles: true }), {
    isPrimary: true, button: 0, pointerId: 1, pointerType: 'touch', clientX: x, clientY: y,
  }))
  pointer('pointerdown', 100, 100); pointer('pointermove', 50, 180)
  expect(screen.getByText('Heading 10° · Tilt 0° · Field of view 75°')).toBeInTheDocument()
  pointer('pointercancel', 50, 180); pointer('pointermove', 0, 200)
  expect(screen.getByText('Heading 10° · Tilt 0° · Field of view 75°')).toBeInTheDocument()
})

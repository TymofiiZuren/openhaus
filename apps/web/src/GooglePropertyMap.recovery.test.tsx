import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { GooglePropertyMap } from './GooglePropertyMap'
import { loadGoogleMaps, type GoogleMaps } from './googleMapsLoader'
import { areasForCounty, loadAreasForCounty } from './administrativeAreas'
import type { Property } from './api/properties'

vi.mock('./googleMapsLoader', () => ({ loadGoogleMaps: vi.fn() }))
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.mocked(loadGoogleMaps).mockReset(); delete window.google })

const props = {
  properties: [], selectedCounty: 'Dublin', areas: [], availableCounties: ['Dublin'],
  onSelectCounty: vi.fn(), onSelectArea: vi.fn(), onSelectProperty: vi.fn(), onDismissProperty: vi.fn(),
}

it.each([false, true])('keeps pins clickable and geographically anchored (Ireland overview: %s)', async (overview) => {
  await loadAreasForCounty('Wexford')
  vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key')
  const homes: Property[] = [
    { id: 'demo', title: 'Townhouse', county: 'Wexford', city: 'Wexford', addressLine1: '', latitude: 52.34, longitude: -6.46, priceCents: 49500000, bedrooms: 4, propertyType: 'detached', media: [] },
    { id: 'coastal', title: 'Coastal home', county: 'Wexford', city: 'Wexford', addressLine1: '', latitude: 52.3369, longitude: -6.4633, priceCents: 52500000, bedrooms: 4, propertyType: 'detached', media: [] },
  ]
  if (overview) homes[1] = { ...homes[1], county: 'Carlow' }
  type Pin = { title: string; icon: { url: string; anchor?: { x: number; y: number } }; zIndex: number; clickable?: boolean; click?: () => void }
  const pins: Pin[] = []
  const connectors: Pin[] = []
  const detached: Pin[] = []
  const removePinListener = vi.fn()
  let zoom = 6
  let idle: (() => void) | undefined
  const moveCamera = vi.fn()
  class Overlay {
    setMap(_map: unknown) {}
    setOptions() {}
    addListener(_event: string, _callback: () => void) { return { remove: vi.fn() } }
  }
  const maps = {
    Point: class { x: number; y: number; constructor(x: number, y: number) { this.x = x; this.y = y } },
    Map: class extends Overlay {
      moveCamera = moveCamera
      getZoom() { return zoom }
      getCenter() {
        const center = moveCamera.mock.lastCall?.[0].center
        return center ? { lat: () => center.lat, lng: () => center.lng } : undefined
      }
      addListener(event: string, callback: () => void) {
        if (event === 'idle') idle = callback
        return { remove: vi.fn() }
      }
    },
    Polygon: Overlay,
    Marker: class extends Overlay {
      pin: Pin
      constructor(options: Pin) { super(); this.pin = { ...options }; (options.clickable === false ? connectors : pins).push(this.pin) }
      addListener(_event: string, callback: () => void) { this.pin.click = callback; return { remove: removePinListener } }
      setMap(map: unknown) { if (map === null) detached.push(this.pin) }
    },
  } as unknown as GoogleMaps
  window.google = { maps }
  vi.mocked(loadGoogleMaps).mockResolvedValue(maps)
  const select = vi.fn(), selectArea = vi.fn(), selectCounty = vi.fn()
  const mapProps = { ...props, properties: homes, selectedCounty: overview ? null : 'Wexford', areas: overview ? [] : areasForCounty('Wexford'), onSelectProperty: select, onSelectArea: selectArea, onSelectCounty: selectCounty }
  const { unmount, rerender } = render(<GooglePropertyMap {...mapProps} />)
  const verifyCleanup = () => {
    unmount()
    expect(detached).toHaveLength(pins.length + connectors.length)
    for (const item of [...pins, ...connectors]) expect(detached).toContain(item)
    expect(removePinListener).toHaveBeenCalledTimes(pins.length)
  }
  await waitFor(() => expect(pins).toHaveLength(overview ? 2 : 1))
  if (overview) {
    for (const pin of pins) {
      expect(decodeURIComponent(pin.icon.url)).toContain('height="46"')
      act(() => pin.click?.())
    }
    expect(selectCounty.mock.calls).toEqual([['Wexford'], ['Carlow']])
    expect(select).not.toHaveBeenCalled()
    verifyCleanup()
    return
  }
  expect(connectors).toHaveLength(0)
  act(() => pins[0].click?.())
  expect(selectArea).toHaveBeenCalledWith('Wexford')
  expect(select).not.toHaveBeenCalled()
  // Zoom alone must never reveal houses; explicit area selection does.
  zoom = 14
  act(() => idle?.())
  expect(pins.filter(pin => !detached.includes(pin)).map(pin => pin.title)).toEqual(['2 homes in Wexford'])
  rerender(<GooglePropertyMap {...mapProps} selectedArea="Wexford" />)
  expect(moveCamera.mock.lastCall?.[0].zoom).toBeGreaterThanOrEqual(14)
  const closeUpPins = pins.filter(pin => !detached.includes(pin))
  expect(closeUpPins).toHaveLength(2)
  expect(connectors).toHaveLength(0)
  for (const pin of closeUpPins) expect(pin.icon.anchor?.y).toBe(46)
  expect(closeUpPins.map(pin => decodeURIComponent(pin.icon.url)).join(' ')).toContain('€525k')
  act(() => closeUpPins.find(pin => pin.title.includes('Coastal home'))?.click?.())
  expect(select).toHaveBeenLastCalledWith(homes[1])
  expect(selectArea).toHaveBeenCalledTimes(1)
  rerender(<GooglePropertyMap {...mapProps} selectedArea="Wexford" selectedPropertyID="coastal" />)
  expect(moveCamera.mock.lastCall?.[0]).toEqual({ center: { lat: homes[1].latitude, lng: homes[1].longitude }, zoom: 17 })
  zoom = 19
  rerender(<GooglePropertyMap {...mapProps} selectedArea="Wexford" selectedPropertyID="demo" />)
  expect(moveCamera.mock.lastCall?.[0].zoom).toBe(19)
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { callback(0); return 1 })
  const closeUpCamera = moveCamera.mock.lastCall?.[0]
  // Entering and leaving fullscreen must preserve the current camera.
  for (let i = 0; i < 2; i++) {
    act(() => document.dispatchEvent(new Event('fullscreenchange')))
    expect(moveCamera.mock.lastCall?.[0]).toEqual(closeUpCamera)
  }
  const movesBeforeDismiss = moveCamera.mock.calls.length
  rerender(<GooglePropertyMap {...mapProps} selectedArea="Wexford" />)
  expect(moveCamera).toHaveBeenCalledTimes(movesBeforeDismiss)
  rerender(<GooglePropertyMap {...mapProps} />)
  expect(pins.filter(pin => !detached.includes(pin)).map(pin => pin.title)).toEqual(['2 homes in Wexford'])
  verifyCleanup()
})

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
  // Both drag dismissal and idle label-layout listeners must be released.
  expect(remove).toHaveBeenCalledTimes(2)
})

it('does not offer a retry when map configuration is absent', () => {
  vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', '')
  render(<GooglePropertyMap {...props} />)
  expect(screen.getByText('Map is not available.')).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Retry map' })).not.toBeInTheDocument()
  expect(loadGoogleMaps).not.toHaveBeenCalled()
})

it('tracks fullscreen controls, coalesces rapid resizes and cancels pending work on navigation', async () => {
  vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key')
  const frames = new Map<number, FrameRequestCallback>()
  let nextFrame = 0
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
    frames.set(++nextFrame, callback)
    return nextFrame
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => { frames.delete(id) })
  const moveCamera = vi.fn(), resize = vi.fn()
  class Overlay {
    setMap() {}
    setOptions() {}
    addListener() { return { remove: vi.fn() } }
  }
  const maps = {
    Map: class extends Overlay {
      moveCamera = moveCamera
      getZoom() { return 18 }
      getCenter() { return { lat: () => 52.34, lng: () => -6.46 } }
    },
    Polygon: Overlay,
    event: { trigger: resize },
  } as unknown as GoogleMaps
  window.google = { maps }
  vi.mocked(loadGoogleMaps).mockResolvedValue(maps)
  let fullscreen: Element | null = null
  const original = Object.getOwnPropertyDescriptor(document, 'fullscreenElement')
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fullscreen })
  const { container, unmount } = render(<div className="map-stage"><GooglePropertyMap {...props} /></div>)
  try {
    const open = await screen.findByRole('button', { name: 'Open full screen map' })
    const stage = container.querySelector<HTMLElement>('.map-stage')!
    await userEvent.click(open)
    expect(await screen.findByRole('alert')).toHaveTextContent('Fullscreen is unavailable in this browser. You can continue using the map here.')
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss fullscreen message' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    stage.requestFullscreen = vi.fn().mockRejectedValue(new Error('Browser policy denied request'))
    await userEvent.click(open)
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not open fullscreen. You can continue using the map here or try again.')
    expect(open).toHaveAttribute('aria-pressed', 'false')
    stage.requestFullscreen = vi.fn(async () => {
      fullscreen = stage
      document.dispatchEvent(new Event('fullscreenchange'))
    })
    await userEvent.click(open)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(stage.requestFullscreen).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Exit full screen map' })).toHaveAttribute('aria-pressed', 'true')
    // Escape/browser UI can leave fullscreen without clicking our control.
    act(() => { fullscreen = null; document.dispatchEvent(new Event('fullscreenchange')) })
    expect(screen.getByRole('button', { name: 'Open full screen map' })).toHaveAttribute('aria-pressed', 'false')
    expect(frames.size).toBe(1)
    act(() => {
      const pending = [...frames.values()]
      frames.clear()
      pending.forEach(callback => callback(0))
    })
    expect(resize).toHaveBeenCalledOnce()
    expect(resize.mock.calls[0][1]).toBe('resize')
    expect(moveCamera.mock.lastCall?.[0]).toEqual({ center: { lat: 52.34, lng: -6.46 }, zoom: 18 })
    act(() => document.dispatchEvent(new Event('fullscreenchange')))
    expect(frames.size).toBe(1)
    unmount()
    expect(frames.size).toBe(0)
    act(() => document.dispatchEvent(new Event('fullscreenchange')))
    expect(frames.size).toBe(0)
  } finally {
    unmount()
    if (original) Object.defineProperty(document, 'fullscreenElement', original)
    else Reflect.deleteProperty(document, 'fullscreenElement')
  }
})

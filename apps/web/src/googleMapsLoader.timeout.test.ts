import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  delete window.google
  delete window.__openHausGoogleMapsReady
  delete window.gm_authFailure
  document.querySelectorAll('script[data-openhaus-google-maps]').forEach(script => script.remove())
})

it('expires a stalled startup and lets a new request succeed', async () => {
  vi.resetModules()
  vi.useFakeTimers()
  const { loadGoogleMaps } = await import('./googleMapsLoader')
  const priorAuthFailure = vi.fn()
  window.gm_authFailure = priorAuthFailure
  const loading = loadGoogleMaps('test-key')
  expect(loadGoogleMaps('test-key')).toBe(loading)
  const oldScript = document.querySelector<HTMLScriptElement>('script[data-openhaus-google-maps]')!
  const oldCallback = window.__openHausGoogleMapsReady!
  const rejected = expect(loading).rejects.toThrow('Google Maps loading timed out')
  await vi.advanceTimersByTimeAsync(15_000)
  await rejected
  expect(oldScript.isConnected).toBe(false)
  expect(window.gm_authFailure).toBe(priorAuthFailure)
  expect(window.__openHausGoogleMapsReady).toBeUndefined()

  const retry = loadGoogleMaps('test-key')
  const retryCallback = window.__openHausGoogleMapsReady
  oldCallback()
  oldScript.dispatchEvent(new Event('error'))
  expect(window.__openHausGoogleMapsReady).toBe(retryCallback)
  const maps = {} as NonNullable<typeof window.google>['maps']
  window.google = { maps }
  retryCallback?.()
  await expect(retry).resolves.toBe(maps)
  expect(vi.getTimerCount()).toBe(0)
})

it('clears the deadline on a successful startup', async () => {
  vi.resetModules()
  vi.useFakeTimers()
  const { loadGoogleMaps } = await import('./googleMapsLoader')
  const loading = loadGoogleMaps('test-key')
  const maps = {} as NonNullable<typeof window.google>['maps']
  window.google = { maps }
  window.__openHausGoogleMapsReady?.()
  await expect(loading).resolves.toBe(maps)
  expect(vi.getTimerCount()).toBe(0)
  await vi.advanceTimersByTimeAsync(15_000)
  expect(document.querySelector('script[data-openhaus-google-maps]')).not.toBeNull()
})

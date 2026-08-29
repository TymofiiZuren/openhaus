import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadGoogleMaps } from './googleMapsLoader'

afterEach(() => {
  vi.restoreAllMocks()
  delete window.google
})

describe('Google Maps loader', () => {
  it('waits for the Google callback before reporting the API as ready', async () => {
    const maps = {} as NonNullable<typeof window.google>['maps']
    let requestedScript: HTMLScriptElement | undefined

    vi.spyOn(document.head, 'append').mockImplementation((...nodes) => {
      requestedScript = nodes[0] as HTMLScriptElement
    })

    const loading = loadGoogleMaps('test-key')
    const callbackName = new URL(requestedScript?.src ?? '').searchParams.get('callback')

    expect(callbackName).toBe('__openHausGoogleMapsReady')
    expect(window.google).toBeUndefined()

    window.google = { maps }
    window.__openHausGoogleMapsReady?.()

    await expect(loading).resolves.toBe(maps)
  })
})

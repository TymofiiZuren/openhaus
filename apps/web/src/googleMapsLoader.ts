export type Coordinate = { lat: number; lng: number }
export type BoundsInstance = { extend(position: Coordinate): void }
export type Listener = { remove(): void }
export type MapInstance = {
  addListener(event: 'dragstart' | 'zoom_changed' | 'idle', listener: () => void): Listener
  fitBounds(bounds: BoundsInstance, padding?: number): void
  getZoom(): number | undefined
  getCenter(): { lat(): number; lng(): number } | undefined
  moveCamera?(options: { center: Coordinate; zoom: number }): void
  panTo?(position: Coordinate): void
  setCenter(position: Coordinate): void
  setMapTypeId(type: 'roadmap' | 'satellite'): void
  setOptions(options: Record<string, unknown>): void
  setZoom(zoom: number): void
}
export type MarkerInstance = {
  addListener(event: 'click', listener: () => void): Listener
  setMap(map: MapInstance | null): void
  setIcon(icon: Record<string, unknown>): void
  setZIndex(index: number): void
}
export type InfoWindowInstance = {
  addListener(event: 'closeclick', listener: () => void): Listener
  close(): void
  open(options: { map: MapInstance; anchor: MarkerInstance }): void
}
export type PolygonInstance = {
  addListener(event: 'click' | 'mouseover' | 'mouseout', listener: () => void): Listener
  setMap(map: MapInstance | null): void
  setOptions(options: Record<string, unknown>): void
}
export type GoogleMaps = {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => MapInstance
  Marker: new (options: Record<string, unknown>) => MarkerInstance
  InfoWindow: new (options: Record<string, unknown>) => InfoWindowInstance
  Polygon: new (options: Record<string, unknown>) => PolygonInstance
  LatLngBounds: new () => BoundsInstance
  event?: { trigger(instance: MapInstance, event: 'resize'): void }
}

declare global {
  interface Window {
    google?: { maps: GoogleMaps }
    __openHausGoogleMapsReady?: () => void
    gm_authFailure?: () => void
  }
}

let googleMapsPromise: Promise<GoogleMaps> | undefined

export function loadGoogleMaps(apiKey: string): Promise<GoogleMaps> {
  if (window.google?.maps) return Promise.resolve(window.google.maps)
  if (googleMapsPromise) return googleMapsPromise

  const loading = new Promise<GoogleMaps>((resolve, reject) => {
    const staleScript = document.querySelector<HTMLScriptElement>('script[data-openhaus-google-maps]')
    staleScript?.remove()

    const script = document.createElement('script')
    const callbackName = '__openHausGoogleMapsReady'
    const previousAuthFailure = window.gm_authFailure
    const cleanup = () => {
      delete window.__openHausGoogleMapsReady
      if (previousAuthFailure) window.gm_authFailure = previousAuthFailure
      else delete window.gm_authFailure
    }
    const fail = (error: Error) => {
      cleanup()
      script.remove()
      reject(error)
    }

    window.__openHausGoogleMapsReady = () => {
      if (!window.google?.maps) {
        fail(new Error('Google Maps callback ran without the Maps API'))
        return
      }
      const maps = window.google.maps
      cleanup()
      resolve(maps)
    }
    window.gm_authFailure = () => fail(new Error('Google Maps rejected the configured API key'))

    const parameters = new URLSearchParams({
      key: apiKey,
      v: 'weekly',
      loading: 'async',
      callback: callbackName,
      language: 'en',
      region: 'IE',
    })
    script.src = `https://maps.googleapis.com/maps/api/js?${parameters}`
    script.async = true
    script.dataset.openhausGoogleMaps = 'true'
    script.onerror = () => fail(new Error('Google Maps failed to load'))
    document.head.append(script)
  })

  googleMapsPromise = loading.catch((error) => {
    googleMapsPromise = undefined
    throw error
  })
  return googleMapsPromise
}

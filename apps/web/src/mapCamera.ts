import type { Coordinate, MapInstance } from './googleMapsLoader'

// Web Mercator bounds fit, applied atomically: Google's fitBounds may animate.
export function fitCameraImmediately(map: MapInstance, points: Coordinate[], padding: number) {
  if (!points.length) return
  const element = map.getDiv?.()
  const width = element?.clientWidth || 800
  const height = element?.clientHeight || 680
  const mercatorY = (lat: number) => {
    const sine = Math.sin(Math.max(-85, Math.min(85, lat)) * Math.PI / 180)
    return .5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)
  }
  const xs = points.map(point => (point.lng + 180) / 360)
  const ys = points.map(point => mercatorY(point.lat))
  const west = Math.min(...xs), east = Math.max(...xs)
  const north = Math.min(...ys), south = Math.max(...ys)
  const zoom = Math.max(5, Math.min(20, Math.floor(Math.min(
    Math.log2(Math.max(1, width - padding * 2) / (256 * Math.max(east - west, 1e-9))),
    Math.log2(Math.max(1, height - padding * 2) / (256 * Math.max(south - north, 1e-9))),
  ))))
  map.moveCamera?.({ center: {
    lng: (west + east) / 2 * 360 - 180,
    lat: Math.atan(Math.sinh(Math.PI * (1 - north - south))) * 180 / Math.PI,
  }, zoom })
}

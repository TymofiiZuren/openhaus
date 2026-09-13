import type { Coordinate } from './googleMapsLoader'

// Web Mercator world pixels at the current zoom. Greedy placement keeps source
// coordinates untouched and lifts only labels whose padded rectangles collide.
export function priceMarkerLifts(points: Coordinate[], widths: number[], zoom: number, keys?: string[]): number[] {
  const scale = 256 * 2 ** zoom
  const placed: Array<{ x: number; y: number; width: number }> = []
  const order = points.map((_, index) => index)
  if (keys) order.sort((a, b) => keys[a] < keys[b] ? -1 : keys[a] > keys[b] ? 1 : 0)
  const lifts = new Array<number>(points.length)
  // Stable identities make layout independent of catalogue sorting. Return
  // offsets in the caller's order so markers retain their property association.
  for (const index of order) {
    const point = points[index]
    const sine = Math.sin(Math.max(-85, Math.min(85, point.lat)) * Math.PI / 180)
    const x = (point.lng + 180) / 360 * scale
    const y = (0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * scale
    const width = widths[index]
    let lift = 0
    while (placed.some(other => Math.abs(x - other.x) < (width + other.width) / 2 + 8 && Math.abs(y - lift - other.y) < 52)) lift += 52
    placed.push({ x, y: y - lift, width })
    lifts[index] = lift
  }
  return lifts
}

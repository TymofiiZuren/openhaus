import { expect, it } from 'vitest'
import { priceMarkerLifts } from './mapPriceLayout'

it('keeps each home at the same label offset when results are reordered', () => {
  const point = { lat: 52.34, lng: -6.46 }
  const first = priceMarkerLifts([point, point], [80, 100], 12, ['home:a', 'home:b'])
  const reversed = priceMarkerLifts([point, point], [100, 80], 12, ['home:b', 'home:a'])
  expect(reversed).toEqual([...first].reverse())
})

it('separates coincident price labels without changing coordinates', () => {
  const points = [{ lat: 52.34, lng: -6.46 }, { lat: 52.34, lng: -6.46 }]
  expect(priceMarkerLifts(points, [80, 80], 12)).toEqual([0, 52])
  expect(points[1]).toEqual(points[0])
})
it('leaves distant homes alone and releases labels when zoom reveals space', () => {
  const points = [{ lat: 52.34, lng: -6.46 }, { lat: 52.3369, lng: -6.4633 }]
  expect(priceMarkerLifts(points, [80, 80], 10)[1]).toBeGreaterThan(0)
  expect(priceMarkerLifts(points, [80, 80], 18)).toEqual([0, 0])
})
it('handles several identical locations with deterministic spacing', () => {
  expect(priceMarkerLifts(Array.from({ length: 4 }, () => ({ lat: 52, lng: -6 })), [80, 80, 80, 80], 12)).toEqual([0, 52, 104, 156])
})

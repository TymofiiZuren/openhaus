import { expect, it } from 'vitest'
import { decodeBoundary, encodeBoundary } from './boundaryCodec'

it('decodes a known delta-encoded path at six-decimal precision', () => {
  const points: [number, number][] = [[3.85, -12.02], [4.07, -12.095], [4.3252, -12.6453]]
  expect(encodeBoundary(points)).toBe('_p~iF~ps|U_ulLnnqC_mqNvxq`@')
  expect(decodeBoundary('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual(points)
})

it('preserves closed rings, negative deltas and individual coordinate precision', () => {
  const ring: [number, number][] = [[53.123456, -6.123456], [53.123455, -6.123457], [53.223456, -6.123456], [53.123456, -6.123456]]
  expect(decodeBoundary(encodeBoundary(ring))).toEqual(ring)
  expect(decodeBoundary(encodeBoundary([]))).toEqual([])
})

it('rejects truncated and invalid encoded geometry', () => {
  expect(() => decodeBoundary('_')).toThrow()
  expect(() => decodeBoundary('?')).toThrow()
  expect(() => decodeBoundary('!!')).toThrow()
})

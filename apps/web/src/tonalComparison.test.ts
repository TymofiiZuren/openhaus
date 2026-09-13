import { expect, it } from 'vitest'
import { compareTones } from './tonalDistance'

const point = (index: number, count = 1) => Array.from({ length: 32 }, (_, i) => i === index ? count : 0)

it('measures exact transport cost between luma bins', () => {
  expect(compareTones(point(0), point(31)).distance).toBe(248)
  expect(compareTones(point(10), point(11)).distance).toBe(8)
  expect(compareTones(point(10, 100), point(10, 5)).distance).toBe(0)
  expect(compareTones(point(10), point(10)).referenceCDF.at(-1)).toBe(1)
})

it('agrees with independent sorted-pixel matching across seeded distributions', () => {
  let seed = 123
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed % 32 }
  for (let trial = 0; trial < 80; trial++) {
    const a = Array.from({ length: 128 }, random).sort((x, y) => x - y)
    const b = Array.from({ length: 128 }, random).sort((x, y) => x - y)
    const histogram = (values: number[]) => values.reduce((bins, value) => { bins[value]++; return bins }, Array<number>(32).fill(0))
    const expected = a.reduce((sum, value, i) => sum + Math.abs(value - b[i]) * 8, 0) / a.length
    const result = compareTones(histogram(a), histogram(b))
    expect(result.distance).toBeCloseTo(expected, 10)
    expect(compareTones(histogram(b), histogram(a)).distance).toBeCloseTo(expected, 10)
    expect(result.currentCDF.at(-1)).toBeCloseTo(1)
  }
})

it('rejects sparse bins rather than producing a non-finite result', () => {
  const sparse = Array<number>(32)
  sparse[0] = 1
  expect(() => compareTones(sparse, point(0))).toThrow('Invalid tonal histogram')
})

it.each([[], Array(32).fill(0), Array(32).fill(-1), Array(32).fill(NaN), Array(32).fill(Infinity), Array(32).fill(Number.MAX_VALUE)].map(histogram => [histogram]))('rejects invalid histograms', histogram => {
  expect(() => compareTones(histogram, point(0))).toThrow('Invalid tonal histogram')
  expect(() => compareTones(point(0), histogram)).toThrow('Invalid tonal histogram')
})

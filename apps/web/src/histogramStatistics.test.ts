import { expect, it } from 'vitest'
import { histogramStatistics } from './histogramStatistics'

it('has zero entropy and no split for a constant channel', () => {
  const bins = Array(32).fill(0); bins[12] = 100
  expect(histogramStatistics(bins)).toEqual({ entropyBits: 0, splitAfter: null })
})
it('has five bits for a uniform 32-bin distribution', () => {
  expect(histogramStatistics(Array(32).fill(1))).toEqual({ entropyBits: 5, splitAfter: 127 })
})
it('uses the lowest boundary when empty bins produce equally good splits', () => {
  const bins = Array(32).fill(0); bins[0] = 50; bins[31] = 50
  expect(histogramStatistics(bins)).toEqual({ entropyBits: 1, splitAfter: 7 })
  expect(histogramStatistics(bins.map(count => count * 100))).toEqual(histogramStatistics(bins))
})
it('agrees with an exhaustive two-class variance calculation', () => {
  const bins = Array.from({ length: 32 }, (_, i) => (i * 13 + 7) % 19)
  const total = bins.reduce((a, b) => a + b, 0)
  const scores = bins.slice(0, -1).map((_, split) => {
    const weight = bins.slice(0, split + 1).reduce((a, b) => a + b, 0)
    const left = bins.reduce((sum, count, i) => sum + (i <= split ? count * i : 0), 0) / weight
    const right = bins.reduce((sum, count, i) => sum + (i > split ? count * i : 0), 0) / (total - weight)
    return weight * (total - weight) * (left - right) ** 2 / total ** 2
  })
  expect(histogramStatistics(bins).splitAfter).toBe(scores.indexOf(Math.max(...scores)) * 8 + 7)
})
it.each([[], Array(32).fill(0), Array(32).fill(-1), Array(32).fill(NaN), Array(32).fill(.5)])('rejects invalid histogram counts', bins => {
  expect(() => histogramStatistics(bins)).toThrow()
})

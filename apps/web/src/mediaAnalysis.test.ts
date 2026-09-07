import { expect, it } from 'vitest'
import { analysePixels, analysisReport } from './mediaAnalysis'

it('measures flat black and white without inventing detail', () => {
  const black = new Uint8ClampedArray(36)
  const white = new Uint8ClampedArray(36).fill(255)
  expect(analysePixels(black, 3, 3).shadows).toBe(100)
  const result = analysePixels(white, 3, 3)
  expect(result.highlights).toBe(100)
  expect(result.mean).toBe(255)
  expect(result.edgeMean).toBe(0)
  expect(result.histogram.reduce((a, b) => a + b, 0)).toBe(9)
})
it('detects a contrasting edge and rejects malformed buffers', () => {
  const pixels = new Uint8ClampedArray(36)
  for (let y = 0; y < 3; y++) for (let c = 0; c < 3; c++) pixels[(y * 3 + 2) * 4 + c] = 255
  expect(analysePixels(pixels, 3, 3).edgeMean).toBeGreaterThan(0)
  expect(() => analysePixels(pixels, 4, 4)).toThrow()
})

it('exports a versioned report without the large pixel buffer', () => {
  const report = analysisReport({ ...analysePixels(new Uint8ClampedArray(36), 3, 3), elapsedMs: 2 }, 'sample.jpg')
  expect(report.schemaVersion).toBe(1)
  expect(report.source).toBe('sample.jpg')
  expect(report.workerComputeMs).toBe(2)
  expect(report).not.toHaveProperty('edges')
  expect(JSON.parse(JSON.stringify(report)).histogram).toHaveLength(32)
})

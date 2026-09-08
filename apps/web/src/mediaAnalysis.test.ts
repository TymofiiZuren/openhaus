import { expect, it } from 'vitest'
import { analysePixels, analysisReport, analysisDimensions } from './mediaAnalysis'

it('exports versioned distribution statistics for all sampled channels', () => {
  const result = { ...analysePixels(new Uint8ClampedArray(36), 3, 3), elapsedMs: 1 }
  expect(analysisReport(result, 'local-image', 'local').distributionStatistics).toEqual({
    algorithm: 'binned-shannon-otsu-32-v1',
    luma: { entropyBits: 0, splitAfter: null },
    red: { entropyBits: 0, splitAfter: null },
    green: { entropyBits: 0, splitAfter: null },
    blue: { entropyBits: 0, splitAfter: null },
  })
})

it('bounds analysis allocation for portrait, landscape and extreme aspect ratios', () => {
  expect(analysisDimensions(1536, 1024)).toEqual({ width: 640, height: 427 })
  expect(analysisDimensions(1024, 1536)).toEqual({ width: 427, height: 640 })
  expect(analysisDimensions(1, 100_000)).toEqual({ width: 3, height: 640 })
  expect(analysisDimensions(100_000, 1)).toEqual({ width: 640, height: 3 })
  expect(analysisDimensions(32, 16)).toEqual({ width: 32, height: 16 })
  expect(analysisDimensions(1, 1)).toEqual({ width: 3, height: 3 })
})

it.each([0, -1, NaN, Infinity, 1.5])('rejects invalid source dimensions: %s', value => {
  expect(() => analysisDimensions(value, 10)).toThrow('Invalid source dimensions')
  expect(() => analysisDimensions(10, value)).toThrow('Invalid source dimensions')
})

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

it('counts RGB bins in the same sample with exact boundary handling', () => {
  const pixels = new Uint8ClampedArray(3 * 3 * 4)
  const values = [0, 7, 8, 15, 16, 127, 128, 248, 255]
  values.forEach((value, i) => { pixels[i * 4] = value; pixels[i * 4 + 1] = 255 - value; pixels[i * 4 + 2] = 64; pixels[i * 4 + 3] = 255 })
  const result = analysePixels(pixels, 3, 3)
  expect(result.channels.red[0]).toBe(2)
  expect(result.channels.red[1]).toBe(2)
  expect(result.channels.red[31]).toBe(2)
  expect(result.channels.green[31]).toBe(2)
  expect(result.channels.blue[8]).toBe(9)
  for (const histogram of Object.values(result.channels)) {
    expect(histogram).toHaveLength(32)
    expect(histogram.reduce((sum, count) => sum + count, 0)).toBe(9)
  }
  const report = analysisReport({ ...result, elapsedMs: 1 }, 'sample.jpg')
  expect(report.rgbHistograms).toEqual(result.channels)
  expect(report.histogram).toEqual(result.histogram)
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

it('labels local reports without claiming fictional imagery or including a filename', () => {
  const report = analysisReport({ ...analysePixels(new Uint8ClampedArray(36), 3, 3), elapsedMs: 1 }, 'local-image', 'local')
  expect(report.source).toBe('local-image')
  expect(report.limitations).not.toContain('AI-generated')
  expect(report.limitations).toContain('black')
})

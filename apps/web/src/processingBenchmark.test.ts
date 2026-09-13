import { afterEach, expect, it, vi } from 'vitest'
import { analysePixels } from './mediaAnalysis'
import { runProcessingBenchmark, timingSummary } from './processingBenchmark'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
it('uses nearest-rank percentiles and rejects invalid timings', () => {
  expect(timingSummary([4, 1, 3, 2])).toEqual({ p50: 2, p95: 4 })
  for (const values of [[], [NaN], [-1], [Infinity]]) expect(() => timingSummary(values)).toThrow()
})
class TestWorker {
  static instances: TestWorker[] = []
  onmessage: ((event: { data: unknown }) => void) | null = null
  onerror: (() => void) | null = null
  terminate = vi.fn()
  constructor() { TestWorker.instances.push(this) }
  postMessage({ pixels, width, height }: { pixels: Uint8ClampedArray; width: number; height: number }) {
    queueMicrotask(() => this.onmessage?.({ data: { ...analysePixels(pixels, width, height), elapsedMs: 1 } }))
  }
}
it('measures twenty matching pairs, excludes warmup and closes the worker', async () => {
  vi.stubGlobal('Worker', TestWorker)
  const report = await runProcessingBenchmark(new AbortController().signal)
  expect(report.trials).toHaveLength(20)
  expect(report.warmupRuns).toBe(1)
  expect(report.outputsMatch).toBe(true)
  expect(report.trials.every(row => row.workerComputeMs === 1)).toBe(true)
  expect(TestWorker.instances.at(-1)?.terminate).toHaveBeenCalledTimes(1)
})
it('terminates a stalled worker on cancellation', async () => {
  class Stalled extends TestWorker { postMessage() {} }
  vi.stubGlobal('Worker', Stalled)
  const controller = new AbortController()
  const pending = runProcessingBenchmark(controller.signal)
  controller.abort()
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  expect(TestWorker.instances.at(-1)?.terminate).toHaveBeenCalledTimes(1)
})
it('rejects mismatched output instead of reporting a speedup', async () => {
  class Wrong extends TestWorker {
    postMessage({ pixels, width, height }: { pixels: Uint8ClampedArray; width: number; height: number }) {
      const result = analysePixels(pixels, width, height); result.edges[0] = 42
      queueMicrotask(() => this.onmessage?.({ data: { ...result, elapsedMs: 1 } }))
    }
  }
  vi.stubGlobal('Worker', Wrong)
  await expect(runProcessingBenchmark(new AbortController().signal)).rejects.toThrow('outputs differ')
  expect(TestWorker.instances.at(-1)?.terminate).toHaveBeenCalledTimes(1)
})
it('times out a silent worker and releases it', async () => {
  vi.useFakeTimers()
  class Silent extends TestWorker { postMessage() {} }
  vi.stubGlobal('Worker', Silent)
  const pending = runProcessingBenchmark(new AbortController().signal)
  const rejected = expect(pending).rejects.toThrow('timed out')
  await vi.advanceTimersByTimeAsync(5000)
  await rejected
  expect(TestWorker.instances.at(-1)?.terminate).toHaveBeenCalledTimes(1)
  expect(vi.getTimerCount()).toBe(0)
})
it('does not allocate a worker for a cancelled run', async () => {
  const worker = vi.fn()
  vi.stubGlobal('Worker', worker)
  const controller = new AbortController(); controller.abort()
  await expect(runProcessingBenchmark(controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  expect(worker).not.toHaveBeenCalled()
})

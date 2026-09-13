import { analysePixels, type MediaAnalysis } from './mediaAnalysis'

export function timingSummary(values: number[]) {
  if (!values.length || values.some(value => !Number.isFinite(value) || value < 0)) throw new Error('Invalid timing samples')
  const sorted = [...values].sort((a, b) => a - b)
  return { p50: sorted[Math.ceil(sorted.length * .5) - 1], p95: sorted[Math.ceil(sorted.length * .95) - 1] }
}

export async function runProcessingBenchmark(signal: AbortSignal) {
  signal.throwIfAborted()
  const width = 256, height = 256
  const fixture = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4
    fixture[i] = x; fixture[i + 1] = y; fixture[i + 2] = x ^ y; fixture[i + 3] = 255
  }
  const initialStart = performance.now()
  const worker = new Worker(new URL('./mediaAnalysis.worker.ts', import.meta.url), { type: 'module' })
  function inWorker(start?: number): Promise<{ result: MediaAnalysis; roundTripMs: number }> {
    signal.throwIfAborted()
    const pixels = fixture.slice()
    return new Promise((resolve, reject) => {
      const began = start ?? performance.now()
      const cleanup = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); worker.onmessage = null; worker.onerror = null; worker.onmessageerror = null }
      const fail = (error: Error) => { cleanup(); reject(error) }
      const abort = () => fail(new DOMException('Benchmark cancelled.', 'AbortError'))
      const timer = setTimeout(() => fail(new Error('Worker timed out. Try again in an active tab.')), 5000)
      signal.addEventListener('abort', abort, { once: true })
      worker.onerror = () => fail(new Error('Worker processing failed.'))
      worker.onmessageerror = () => fail(new Error('Worker response could not be read.'))
      worker.onmessage = event => {
        const roundTripMs = performance.now() - began
        cleanup()
        if (event.data.error || !Number.isFinite(event.data.elapsedMs) || event.data.elapsedMs < 0) reject(new Error('Worker returned an invalid measurement.'))
        else resolve({ result: event.data, roundTripMs })
      }
      try { worker.postMessage({ pixels, width, height }, [pixels.buffer]) } catch { fail(new Error('Could not start worker processing.')) }
    })
  }
  function onMain() {
    const pixels = fixture.slice()
    const start = performance.now()
    const result = analysePixels(pixels, width, height)
    return { result, elapsedMs: performance.now() - start }
  }
  function verify(main: ReturnType<typeof analysePixels>, other: MediaAnalysis) {
    const { edges, ...metrics } = main
    const { edges: workerEdges, elapsedMs: _elapsed, ...workerMetrics } = other
    if (JSON.stringify(metrics) !== JSON.stringify(workerMetrics) || edges.length !== workerEdges.length || !edges.every((value, i) => value === workerEdges[i])) throw new Error('Main-thread and worker outputs differ. No timing report was produced.')
  }
  try {
    const cold = await inWorker(initialStart)
    verify(onMain().result, cold.result)
    const trials: { mainComputeMs: number; workerComputeMs: number; workerRoundTripMs: number }[] = []
    for (let i = 0; i < 20; i++) {
      // Let input/rendering run between trials; never include this yield in timing.
      await new Promise(resolve => setTimeout(resolve, 0))
      signal.throwIfAborted()
      if (performance.now() - initialStart > 30_000) throw new Error('Benchmark exceeded 30 seconds. Try again in an active tab.')
      // Alternate order to reduce systematic main-first bias.
      let main: ReturnType<typeof onMain>, remote: Awaited<ReturnType<typeof inWorker>>
      if (i % 2) { remote = await inWorker(); signal.throwIfAborted(); main = onMain() }
      else { main = onMain(); remote = await inWorker() }
      verify(main.result, remote.result)
      trials.push({ mainComputeMs: main.elapsedMs, workerComputeMs: remote.result.elapsedMs, workerRoundTripMs: remote.roundTripMs })
    }
    signal.throwIfAborted()
    return {
      schemaVersion: 1, algorithm: 'rec709-gamma-luma-rgb-sobel-v1', fixture: 'xy-xor-rgba-v1', width, height,
      warmupRuns: 1, coldWorkerRoundTripMs: cold.roundTripMs, outputsMatch: true,
      trials,
      summary: {
        mainCompute: timingSummary(trials.map(row => row.mainComputeMs)),
        workerCompute: timingSummary(trials.map(row => row.workerComputeMs)),
        workerRoundTrip: timingSummary(trials.map(row => row.workerRoundTripMs)),
      },
      limitations: '20 paired trials after one warmup per context. Nearest-rank p50/p95. Warm worker reused. Compute includes kernel allocations; round trip includes messaging and return buffers. Fixture construction, input copies, output checks, yields, image decoding and rendering excluded from warm timings. Cold round trip includes startup and first input copy. Timer precision, JIT, GC, device load and background throttling affect results. Not page-load timing or proof of faster processing. Hardware and browser are not collected; record them separately when comparing runs.',
    }
  } finally { worker.terminate() }
}
export type ProcessingReport = Awaited<ReturnType<typeof runProcessingBenchmark>>

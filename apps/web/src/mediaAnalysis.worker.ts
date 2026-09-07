import { analysePixels } from './mediaAnalysis'

self.onmessage = (event: MessageEvent<{ pixels: Uint8ClampedArray; width: number; height: number }>) => {
  try {
    const start = performance.now()
    const { pixels, width, height } = event.data
    const result = analysePixels(pixels, width, height)
    self.postMessage({ ...result, elapsedMs: performance.now() - start }, { transfer: [result.edges.buffer] })
  } catch { self.postMessage({ error: 'Image analysis failed. Please try again.' }) }
}

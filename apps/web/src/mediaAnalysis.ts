// Bound canvas allocation before decoding pixels or transferring a worker buffer.
// Preserve aspect ratio except for a minimum 3px axis required by Sobel's kernel.
export function analysisDimensions(sourceWidth: number, sourceHeight: number) {
  if (!Number.isSafeInteger(sourceWidth) || !Number.isSafeInteger(sourceHeight) || sourceWidth < 1 || sourceHeight < 1) throw new Error('Invalid source dimensions')
  const scale = Math.min(1, 640 / Math.max(sourceWidth, sourceHeight))
  return {
    width: Math.max(3, Math.round(sourceWidth * scale)),
    height: Math.max(3, Math.round(sourceHeight * scale)),
  }
}

export function analysePixels(rgba: Uint8ClampedArray, width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 3 || height < 3 || width * height > 1024 * 1024 || rgba.length !== width * height * 4) throw new Error('Invalid analysis dimensions')
  const count = width * height
  const luminance = new Float32Array(count)
  const edges = new Uint8ClampedArray(count * 4)
  const histogram = Array<number>(32).fill(0)
  let total = 0, shadows = 0, highlights = 0, edgeTotal = 0
  for (let i = 0; i < count; i++) {
    // Gamma-encoded Rec.709 luma approximation, not physical luminance.
    const value = Math.round(.2126 * rgba[i * 4] + .7152 * rgba[i * 4 + 1] + .0722 * rgba[i * 4 + 2])
    luminance[i] = value
    histogram[Math.min(31, value >> 3)]++
    total += value
    if (value <= 5) shadows++
    if (value >= 250) highlights++
    edges[i * 4 + 3] = 255
  }
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const i = y * width + x
    const gx = -luminance[i-width-1] + luminance[i-width+1] - 2*luminance[i-1] + 2*luminance[i+1] - luminance[i+width-1] + luminance[i+width+1]
    const gy = -luminance[i-width-1] - 2*luminance[i-width] - luminance[i-width+1] + luminance[i+width-1] + 2*luminance[i+width] + luminance[i+width+1]
    const strength = Math.min(255, Math.hypot(gx, gy) / 4)
    edgeTotal += strength
    edges[i*4] = edges[i*4+1] = edges[i*4+2] = strength
  }
  return { histogram, mean: total / count, shadows: shadows / count * 100, highlights: highlights / count * 100, edgeMean: edgeTotal / ((width-2)*(height-2)), edges, width, height }
}
export type MediaAnalysis = ReturnType<typeof analysePixels> & { elapsedMs: number }

export function analysisReport(result: MediaAnalysis, source: string) {
  return {
    schemaVersion: 1,
    algorithm: 'rec709-gamma-luma-sobel-v1',
    source,
    width: result.width, height: result.height,
    histogram: result.histogram,
    meanLuma: result.mean,
    nearBlackPercent: result.shadows,
    nearWhitePercent: result.highlights,
    meanSobelMagnitude: result.edgeMean,
    workerComputeMs: result.elapsedMs,
    limitations: 'Sampled image; compute time excludes decode and transfer. Not a calibrated quality score. AI-generated fictional sample.',
  }
}

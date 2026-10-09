import { useEffect, useRef, useState } from 'react'
import { SiteHeader } from './SiteHeader'
import { MediaAudit } from './MediaAudit'
import { TonalComparison } from './TonalComparison'
import { ChannelHistogram } from './ChannelHistogram'
import { ComputeComparison } from './ComputeComparison'
import { LocalImagePicker } from './LocalImagePicker'
import { NativePanoramaPreview } from './NativePanoramaPreview'
import { checkLocalDimensions } from './localImage'
import { analysisDimensions, analysisReport, type MediaAnalysis } from './mediaAnalysis'
import './MediaLab.css'

const samples = [
  { name: 'Coastal exterior', src: '/media-demo/coastal-exterior.jpg' },
  { name: 'Coastal living room', src: '/media-demo/coastal-interior.jpg' },
  { name: 'Courtyard exterior', src: '/media-demo/courtyard-exterior.jpg' },
  { name: 'Courtyard living room', src: '/media-demo/courtyard-interior.jpg' },
  { name: 'Harbour exterior', src: '/media-demo/harbour-exterior.jpg' },
  { name: 'Harbour living room', src: '/media-demo/harbour-interior.jpg' },
]

export function MediaLab() {
  const [sample, setSample] = useState(0)
  const [localURL, setLocalURL] = useState<string>()
  const source = localURL ?? samples[sample].src
  const [result, setResult] = useState<MediaAnalysis>()
  const [error, setError] = useState('')
  const [analysisAttempt, setAnalysisAttempt] = useState(0)
  const [edgeView, setEdgeView] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => () => { if (localURL) URL.revokeObjectURL(localURL) }, [localURL])
  useEffect(() => {
    const previous = document.title
    document.title = 'Media Lab — OpenHaus'
    return () => { document.title = previous }
  }, [])
  useEffect(() => {
    let active = true
    let worker: Worker | undefined
    let workerDeadline: ReturnType<typeof setTimeout> | undefined
    const stopWorker = () => {
      active = false
      clearTimeout(workerDeadline)
      if (!worker) return
      worker.onmessage = null
      worker.onerror = null
      worker.onmessageerror = null
      worker.terminate()
      worker = undefined
    }
    const image = new Image()
    image.onload = () => {
      if (!active) return
      try {
        if (localURL) checkLocalDimensions(image.naturalWidth, image.naturalHeight)
        const { width, height } = analysisDimensions(image.naturalWidth, image.naturalHeight)
        const staging = document.createElement('canvas')
        staging.width = width; staging.height = height
        const context = staging.getContext('2d')
        if (!context) throw new Error('Canvas unavailable')
        if (localURL) { context.fillStyle = '#000000'; context.fillRect(0, 0, width, height) }
        context.drawImage(image, 0, 0, width, height)
        const pixels = context.getImageData(0, 0, width, height).data
        worker = new Worker(new URL('./mediaAnalysis.worker.ts', import.meta.url), { type: 'module' })
        workerDeadline = setTimeout(() => {
          if (active) setError('Image analysis timed out. Retry in an active tab or choose another image.')
          stopWorker()
        }, 15_000)
        worker.onmessage = (event: MessageEvent<MediaAnalysis & { error?: string }>) => {
          if (!active) return
          if (event.data.error) setError(event.data.error)
          else setResult(event.data)
          stopWorker()
        }
        worker.onerror = () => { if (active) setError('Background analysis is unavailable in this browser.'); stopWorker() }
        worker.onmessageerror = () => { if (active) setError('The analysis response could not be read. Choose another file or sample.'); stopWorker() }
        worker.postMessage({ pixels, width, height }, [pixels.buffer])
      } catch { setError('Could not prepare this image for analysis.'); stopWorker() }
    }
    image.onerror = () => { if (active) setError('This image could not be decoded. Choose another file or sample.') }
    image.src = source
    return () => { stopWorker(); image.onload = null; image.onerror = null }
  }, [source, localURL, analysisAttempt])
  useEffect(() => {
    if (!result || !canvas.current) return
    canvas.current.width = result.width; canvas.current.height = result.height
    canvas.current.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(result.edges), result.width, result.height), 0, 0)
  }, [result, edgeView])
  return <div className="site-shell"><SiteHeader pathname="/media-lab" /><main className="media-lab">
    <header><p className="eyebrow">OpenHaus / Engineering demonstration</p><h1>See beyond the image.</h1><p>Real pixel measurements, explained. A small browser-based companion to the listing media pipeline.</p><a href="/services">All services →</a></header>
    <div className="media-lab-workbench"><section aria-label="Sample image analysis">
      <div className="media-lab-toolbar"><p className="eyebrow">01 / Image workbench</p><button disabled={!result} aria-pressed={edgeView} onClick={() => setEdgeView(!edgeView)}>Sobel edges</button></div>
      <div className="media-lab-controls">{samples.map((item, index) => <button key={item.src} aria-pressed={!localURL && sample === index} onClick={() => { if (sample !== index || localURL) { setResult(undefined); setError(''); setLocalURL(undefined); setSample(index) } }}><span aria-hidden="true">0{index + 1}</span>{item.name}</button>)}</div>
      <div className="media-lab-stage"><img src={source} alt={localURL ? 'Locally selected image' : `AI-generated fictional ${samples[sample].name.toLowerCase()}`} hidden={edgeView && !!result} /><canvas ref={canvas} hidden={!edgeView || !result} aria-label="Sobel edge magnitude visualisation" role="img" /></div>
      <p className="media-lab-caption">{localURL ? 'Local image · analysed only in this browser · transparency measured against black' : 'AI-generated concept imagery · fictional property · not for sale'}</p>
      <LocalImagePicker key={source} onSelect={url => { setResult(undefined); setError(''); setLocalURL(url) }} />
      {localURL && <div className="media-lab-local-actions"><button onClick={() => { setResult(undefined); setError(''); setLocalURL(undefined) }}>Clear local image</button><p>Clearing or leaving this page releases the local preview. Comparison and duplicate reports below are available for demo samples only.</p></div>}
    </section><aside aria-label="Image measurements">
      <p className="eyebrow">Measured, not simulated</p>
      {error ? <><p role="alert">{error}</p><button type="button" onClick={() => { setError(''); setResult(undefined); setAnalysisAttempt(value => value + 1) }}>Retry analysis</button></> : !result ? <p role="status">Analysing pixels in a background worker…</p> : <>
        <h2>Light & detail</h2><ChannelHistogram result={result} />
        <dl><div><dt>Mean luma / 255</dt><dd>{result.mean.toFixed(1)}</dd></div><div><dt>Near-black pixels ≤ 5</dt><dd>{result.shadows.toFixed(2)}%</dd></div><div><dt>Near-white pixels ≥ 250</dt><dd>{result.highlights.toFixed(2)}%</dd></div><div><dt>Mean Sobel magnitude / 255</dt><dd>{result.edgeMean.toFixed(1)}</dd></div><div><dt>Worker compute time</dt><dd>{result.elapsedMs.toFixed(1)} ms</dd></div></dl>
        <p>Sampled at {result.width} × {result.height}. Compute time excludes loading and decoding. Edge strength is not a calibrated sharpness or quality score.</p>
        <a className="media-lab-export" download={`openhaus-${localURL ? 'local-image' : source.split('/').pop()}-analysis.json`} href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(analysisReport(result, localURL ? 'local-image' : source, localURL ? 'local' : 'sample'), null, 2))}`}>Download analysis report ↓</a>
      </>}
    </aside></div>
    {!localURL && <TonalComparison current={result && !error ? { ...samples[sample], histogram: result.histogram } : undefined} />}
    <ComputeComparison />
    <NativePanoramaPreview />
    <section className="media-lab-method"><div><p className="eyebrow">The algorithm</p><h2>Pixels → signal → explanation.</h2><p>Canvas fits the sample within a 640px longest edge before allocating its pixel buffer. Very narrow images use a minimum 3px axis for the Sobel kernel. An RGBA buffer is transferred to a TypeScript Web Worker. A single luma pass builds the histogram; 3 × 3 Sobel kernels reveal horizontal and vertical gradients. Results return without uploading the image to an analysis service.</p><p>Luma uses a gamma-encoded Rec.709 approximation. Threshold counts indicate possible clipping, not proof of lost detail. No AI model judges the home.</p></div><div><p className="eyebrow">FFmpeg / H.264 / 24 fps</p><h2>A photographic study.</h2><video controls playsInline preload="none" poster={samples[0].src} src="/media-demo/coastal-study.mp4" aria-label="Seven-second photo sequence made from two AI-generated images" /><p>A seven-second dissolve between generated stills—not recorded footage or a 3D walkthrough. No audio. Playback is always your choice.</p></div></section>
    {!localURL && <MediaAudit filename={samples[sample].src.split('/').pop()!} />}
    <section className="media-lab-method" aria-label="Fictional showcase listings"><div><p className="eyebrow">Connected catalogue</p><h2>Explore the concept homes.</h2><p>These demonstration listings are served by the property API and local PostgreSQL database. Prices and map positions are illustrative, and every home is labelled as fictional.</p></div><div><p><a href="/properties/d3000000-0000-4000-8000-000000000001">Coastal retreat →</a></p><p><a href="/properties/d3000000-0000-4000-8000-000000000002">Limestone courtyard →</a></p><p><a href="/properties/d3000000-0000-4000-8000-000000000003">Harbour townhouse →</a></p></div></section>
  </main></div>
}

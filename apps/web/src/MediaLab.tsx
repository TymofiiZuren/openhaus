import { useEffect, useRef, useState } from 'react'
import { SiteHeader } from './SiteHeader'
import { MediaAudit } from './MediaAudit'
import { analysisReport, type MediaAnalysis } from './mediaAnalysis'
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
  const [result, setResult] = useState<MediaAnalysis>()
  const [error, setError] = useState('')
  const [edgeView, setEdgeView] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const previous = document.title
    document.title = 'Media Lab — OpenHaus'
    return () => { document.title = previous }
  }, [])
  useEffect(() => {
    let active = true
    let worker: Worker | undefined
    const image = new Image()
    image.onload = () => {
      if (!active) return
      try {
        const width = 640, height = Math.max(3, Math.round(image.naturalHeight / image.naturalWidth * width))
        const staging = document.createElement('canvas')
        staging.width = width; staging.height = height
        const context = staging.getContext('2d')
        if (!context) throw new Error('Canvas unavailable')
        context.drawImage(image, 0, 0, width, height)
        const pixels = context.getImageData(0, 0, width, height).data
        worker = new Worker(new URL('./mediaAnalysis.worker.ts', import.meta.url), { type: 'module' })
        worker.onmessage = (event: MessageEvent<MediaAnalysis & { error?: string }>) => {
          if (!active) return
          if (event.data.error) setError(event.data.error)
          else setResult(event.data)
          worker?.terminate()
        }
        worker.onerror = () => { if (active) setError('Background analysis is unavailable in this browser.'); worker?.terminate() }
        worker.postMessage({ pixels, width, height }, [pixels.buffer])
      } catch { setError('Could not prepare this image for analysis.') }
    }
    image.onerror = () => { if (active) setError('Sample image could not load. Choose another sample or reload.') }
    image.src = samples[sample].src
    return () => { active = false; worker?.terminate(); image.onload = null; image.onerror = null }
  }, [sample])
  useEffect(() => {
    if (!result || !canvas.current) return
    canvas.current.width = result.width; canvas.current.height = result.height
    canvas.current.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(result.edges), result.width, result.height), 0, 0)
  }, [result, edgeView])
  return <div className="site-shell"><SiteHeader pathname="/media-lab" /><main className="media-lab">
    <header><p className="eyebrow">OpenHaus / Engineering demonstration</p><h1>See beyond the image.</h1><p>Real pixel measurements, explained. A small browser-based companion to the listing media pipeline.</p><a href="/services">All services →</a></header>
    <div className="media-lab-workbench"><section aria-label="Sample image analysis">
      <div className="media-lab-controls">{samples.map((item, index) => <button key={item.src} aria-pressed={sample === index} onClick={() => { if (sample !== index) { setResult(undefined); setError(''); setSample(index) } }}>{item.name}</button>)}<button disabled={!result} aria-pressed={edgeView} onClick={() => setEdgeView(!edgeView)}>Sobel edges</button></div>
      <div className="media-lab-stage"><img src={samples[sample].src} alt={`AI-generated fictional ${samples[sample].name.toLowerCase()}`} hidden={edgeView && !!result} /><canvas ref={canvas} hidden={!edgeView || !result} aria-label="Sobel edge magnitude visualisation" role="img" /></div>
      <p className="media-lab-caption">AI-generated concept imagery · fictional property · not for sale</p>
    </section><aside aria-label="Image measurements">
      <p className="eyebrow">Measured, not simulated</p>
      {error ? <p role="alert">{error}</p> : !result ? <p role="status">Analysing pixels in a background worker…</p> : <>
        <h2>Light & detail</h2><div className="media-lab-histogram" role="img" aria-label="32-bin luma histogram from shadows to highlights">{result.histogram.map((count, index) => <i key={index} style={{ height: `${Math.max(1, count / Math.max(...result.histogram) * 100)}%` }} />)}</div><p>Shadows ← brightness → highlights</p>
        <dl><div><dt>Mean luma / 255</dt><dd>{result.mean.toFixed(1)}</dd></div><div><dt>Near-black pixels ≤ 5</dt><dd>{result.shadows.toFixed(2)}%</dd></div><div><dt>Near-white pixels ≥ 250</dt><dd>{result.highlights.toFixed(2)}%</dd></div><div><dt>Mean Sobel magnitude / 255</dt><dd>{result.edgeMean.toFixed(1)}</dd></div><div><dt>Worker compute time</dt><dd>{result.elapsedMs.toFixed(1)} ms</dd></div></dl>
        <p>Sampled at {result.width} × {result.height}. Compute time excludes loading and decoding. Edge strength is not a calibrated sharpness or quality score.</p>
        <a className="media-lab-export" download={`openhaus-${samples[sample].src.split('/').pop()}-analysis.json`} href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(analysisReport(result, samples[sample].src), null, 2))}`}>Download analysis report ↓</a>
      </>}
    </aside></div>
    <section className="media-lab-method"><div><p className="eyebrow">The algorithm</p><h2>Pixels → signal → explanation.</h2><p>Canvas decodes a 640px-wide sample. An RGBA buffer is transferred to a TypeScript Web Worker. A single luma pass builds the histogram; 3 × 3 Sobel kernels reveal horizontal and vertical gradients. Results return without uploading the image to an analysis service.</p><p>Luma uses a gamma-encoded Rec.709 approximation. Threshold counts indicate possible clipping, not proof of lost detail. No AI model judges the home.</p></div><div><p className="eyebrow">FFmpeg / H.264 / 24 fps</p><h2>A photographic study.</h2><video controls playsInline preload="none" poster={samples[0].src} src="/media-demo/coastal-study.mp4" aria-label="Seven-second photo sequence made from two AI-generated images" /><p>A seven-second dissolve between generated stills—not recorded footage or a 3D walkthrough. No audio. Playback is always your choice.</p></div></section>
    <MediaAudit filename={samples[sample].src.split('/').pop()!} />
    <section className="media-lab-method" aria-label="Fictional showcase listings"><div><p className="eyebrow">Connected catalogue</p><h2>Explore the concept homes.</h2><p>These demonstration listings are served by the property API and local PostgreSQL database. Prices and map positions are illustrative, and every home is labelled as fictional.</p></div><div><p><a href="/properties/d3000000-0000-4000-8000-000000000001">Coastal retreat →</a></p><p><a href="/properties/d3000000-0000-4000-8000-000000000002">Limestone courtyard →</a></p><p><a href="/properties/d3000000-0000-4000-8000-000000000003">Harbour townhouse →</a></p></div></section>
  </main></div>
}

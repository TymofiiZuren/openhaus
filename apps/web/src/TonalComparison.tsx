import { useState } from 'react'
import { compareTones } from './tonalDistance'
import './TonalComparison.css'

type Sample = { name: string; src: string; histogram: number[] }

export function TonalComparison({ current }: { current?: Sample }) {
  const [reference, setReference] = useState<Sample>()
  const comparison = reference && current ? compareTones(reference.histogram, current.histogram) : undefined
  const points = (cdf: number[]) => cdf.map((value, index) => `${index / 31 * 320},${120 - value * 120}`).join(' ')
  const report = comparison && reference && current ? {
    schemaVersion: 1, algorithm: 'binned-luma-wasserstein-1-v1',
    reference, current, ...comparison,
    units: 'luma units; 32 bins, centres spaced 8 units apart; maximum distance 248',
    limitations: 'Sampled gamma-encoded luma only. Ignores colour and spatial arrangement. Not a quality or duplicate score. Fictional AI-generated imagery.',
  } : undefined
  return <section className="tonal-comparison" aria-labelledby="tonal-comparison-title">
    <div className="tonal-comparison-intro">
      <p className="eyebrow">02 / Compare the light</p>
      <h2 id="tonal-comparison-title">A reference. A different perspective.</h2>
      <p>Pin a photograph, then choose another sample above. Compare the spread of light—not the objects in the scene.</p>
      <div className="tonal-comparison-actions">
        <button disabled={!current} onClick={() => current && setReference({ ...current, histogram: [...current.histogram] })}>{reference ? 'Replace reference with current image' : 'Use current image as reference'}</button>
        {reference && <button onClick={() => setReference(undefined)}>Clear reference</button>}
      </div>
      {reference && <figure className="tonal-reference"><img src={reference.src} alt="" /><figcaption><span>Reference photograph</span><strong>{reference.name}</strong></figcaption></figure>}
      <p className="tonal-comparison-note">32 bins · computed locally · no image upload</p>
    </div>
    <div className="tonal-comparison-result" aria-live="polite">
      {!reference ? <div className="tonal-comparison-empty"><span aria-hidden="true">A ↔ B</span><h3>Build a tonal pair</h3><p>Start with the current image as your reference. Measurements appear here once you pin it.</p></div> : !comparison || !current ? <p role="status">Preparing the next image. Your reference is retained.</p> : <>
        <div className="tonal-distance"><div><p className="eyebrow">Wasserstein-1 distance</p><strong>{comparison.distance.toFixed(2)} <small>luma units</small></strong></div><span>0–248</span></div>
        <p>{reference.src === current.src ? 'Same sample selected. Choose another photograph above to compare.' : `${reference.name} → ${current.name}`}</p>
        <svg viewBox="-4 -4 328 130" role="img" aria-label="Cumulative brightness distributions: dashed reference and solid current image">
          {[0, 30, 60, 90, 120].map(y => <line key={y} x1="0" x2="320" y1={y} y2={y} className="tonal-grid" />)}
          <polyline points={points(comparison.referenceCDF)} className="tonal-curve tonal-curve-reference" />
          <polyline points={points(comparison.currentCDF)} className="tonal-curve" />
        </svg>
        <div className="tonal-axis"><span>Shadows · 0</span><span>Highlights · 255</span></div>
        <div className="tonal-legend"><span>– – Reference</span><span>━━ Current</span><span>Cumulative share: 0–100%</span></div>
        <p>The distance is the average brightness movement needed to align these binned distributions. Smaller means closer tonal distributions—not better photography or matching content.</p>
        <details><summary>Explore all 32 measurements</summary><div className="tonal-table"><table><caption>Cumulative share of pixels by luma bin</caption><thead><tr><th scope="col">Luma</th><th scope="col">Reference</th><th scope="col">Current</th></tr></thead><tbody>{comparison.referenceCDF.map((value, i) => <tr key={i}><th scope="row">{i * 8}–{i * 8 + 7}</th><td>{(value * 100).toFixed(2)}%</td><td>{(comparison.currentCDF[i] * 100).toFixed(2)}%</td></tr>)}</tbody></table></div></details>
        <a className="media-lab-export" download="openhaus-tonal-comparison.json" href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(report, null, 2))}`}>Download comparison report ↓</a>
      </>}
    </div>
  </section>
}

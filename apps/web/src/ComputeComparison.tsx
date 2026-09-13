import { useEffect, useRef, useState } from 'react'
import { runProcessingBenchmark, type ProcessingReport } from './processingBenchmark'
import './ComputeComparison.css'

export function ComputeComparison() {
  const controller = useRef<AbortController | null>(null)
  const [running, setRunning] = useState(false)
  const [report, setReport] = useState<ProcessingReport>()
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  useEffect(() => () => { controller.current?.abort(); controller.current = null }, [])
  async function run() {
    if (controller.current) return
    const current = new AbortController()
    controller.current = current
    setRunning(true); setReport(undefined); setError(''); setNotice('Comparing 20 paired trials. Keep this tab active…')
    try {
      const result = await runProcessingBenchmark(current.signal)
      if (controller.current === current) { setReport(result); setNotice('Comparison complete. All measured outputs match.') }
    } catch (cause) {
      if (controller.current !== current) return
      if (current.signal.aborted) setNotice('Comparison cancelled. No partial results retained.')
      else { setNotice(''); setError(cause instanceof Error ? cause.message : 'Comparison failed. Please try again.') }
    } finally {
      if (controller.current === current) { controller.current = null; setRunning(false) }
    }
  }
  return <section className="compute-comparison" aria-labelledby="compute-comparison-title">
    <div className="compute-comparison-intro"><p className="eyebrow">03 / Measure the trade-off</p><h2 id="compute-comparison-title">Same pixels. Two execution paths.</h2>
      <p>A worker moves processing off the interface thread; it does not promise faster arithmetic. Compare the same RGB, luma and Sobel kernel here.</p>
      <p>256 × 256 generated pixels · one warmup per context · 20 paired trials. No photos or device identifiers are collected. Main-thread trials can briefly pause the interface; cancellation takes effect between calls.</p>
      <div className="compute-comparison-actions"><button disabled={running} onClick={() => void run()}>{running ? 'Running comparison…' : 'Run processing comparison'}</button>{running && <button onClick={() => controller.current?.abort()}>Cancel comparison</button>}</div>
      <p role="status">{notice}</p>{error && <p role="alert">{error}</p>}
    </div>
    <div className="compute-comparison-results">
      {!report ? <div className="compute-comparison-empty"><h3>Evidence before optimisation.</h3><p>Run the comparison to see compute time, messaging overhead and output parity. Nothing runs automatically.</p></div> : <>
        <div className="compute-comparison-table"><table><caption>Measured milliseconds · lower is shorter</caption><thead><tr><th scope="col">Execution</th><th scope="col">p50</th><th scope="col">p95</th></tr></thead><tbody>
          {([['Main-thread compute', report.summary.mainCompute], ['Worker compute', report.summary.workerCompute], ['Worker round trip', report.summary.workerRoundTrip]] as const).map(([label, metric]) => <tr key={label}><th scope="row">{label}</th><td>{metric.p50.toFixed(2)}</td><td>{metric.p95.toFixed(2)}</td></tr>)}
        </tbody></table></div>
        <p>Cold worker round trip: <strong>{report.coldWorkerRoundTripMs.toFixed(2)} ms</strong>, including startup and first processing. Warm timings above reuse the worker.</p>
        <p>All 20 pairs match, including every edge pixel. Round-trip timing includes messaging; compute timing does not. p50/p95 use nearest rank, and small timing differences may be timer noise.</p>
        <details><summary>Method and limits</summary><p>{report.limitations}</p></details>
        <a className="media-lab-export" download="openhaus-processing-comparison.json" href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(report, null, 2))}`}>Download timing report ↓</a>
      </>}
    </div>
  </section>
}

import { useEffect, useRef, useState } from 'react'

type QueueSnapshot = {
  observedAt: string
  pending: number
  processing: number
  ready: number
  failed: number
  recoverable: number
  exhausted: number
  oldestPendingSeconds: number | null
}

function parseSnapshot(value: unknown): QueueSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid queue snapshot')
  const data = value as Record<string, unknown>
  const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
  for (const field of ['pending', 'processing', 'ready', 'failed', 'recoverable', 'exhausted']) {
    if (!count(data[field])) throw new Error('Invalid queue snapshot')
  }
  if (typeof data.observedAt !== 'string' || !Number.isFinite(Date.parse(data.observedAt))
    || (data.oldestPendingSeconds !== null && !count(data.oldestPendingSeconds))) throw new Error('Invalid queue snapshot')
  const snapshot = data as QueueSnapshot
  if (snapshot.recoverable > snapshot.processing || snapshot.exhausted > snapshot.pending + snapshot.processing - snapshot.recoverable
    || (snapshot.pending === 0) !== (snapshot.oldestPendingSeconds === null)) throw new Error('Invalid queue snapshot')
  return snapshot
}

export function ManagerMediaQueue() {
  const [snapshot, setSnapshot] = useState<QueueSnapshot>()
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'signed-out'>('loading')
  const [refresh, setRefresh] = useState(0)
  const request = useRef<AbortController | undefined>(undefined)

  useEffect(() => {
    const controller = new AbortController()
    request.current = controller
    const deadline = window.setTimeout(() => controller.abort(new DOMException('Queue request timed out', 'TimeoutError')), 10_000)
    let active = true
    async function load() {
      try {
        const response = await fetch('/api/v1/manager/media-queue', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal })
        if (!active) return
        if (response.status === 401 || response.status === 403) {
          setSnapshot(undefined)
          setStatus('signed-out')
          return
        }
        if (!response.ok) throw new Error('Queue unavailable')
        const next = parseSnapshot(await response.json())
        if (active) { setSnapshot(next); setStatus('ready') }
      } catch {
        if (active) setStatus('error')
      } finally {
        window.clearTimeout(deadline)
      }
    }
    void load()
    return () => { active = false; window.clearTimeout(deadline); controller.abort() }
  }, [refresh])

  return <div className="manager-analytics-panels">
    <section aria-labelledby="media-queue-title">
      <p className="section-index">03 / Processing</p><h2 id="media-queue-title">Video processing queue</h2>
      <p>Installation-wide job counts. A snapshot, not a worker heartbeat.</p>
      <button className="manager-primary-button" type="button" disabled={status === 'loading'} onClick={() => { request.current?.abort(); setStatus('loading'); setRefresh(value => value + 1) }}>Refresh queue</button>
      {status === 'loading' && <p role="status">Loading queue snapshot…</p>}
      {status === 'error' && <p role="alert">Queue status is unavailable. {snapshot ? 'Showing the last snapshot; refresh to try again.' : 'Refresh to try again.'}</p>}
      {status === 'signed-out' && <p role="alert">Your manager session has expired. <a href="/manager/login">Sign in again</a></p>}
      {snapshot && <>
        <p>Snapshot taken <time dateTime={snapshot.observedAt}>{new Date(snapshot.observedAt).toLocaleString()}</time></p>
        <dl>{([['Waiting', snapshot.pending], ['Processing', snapshot.processing], ['Completed', snapshot.ready], ['Failed', snapshot.failed]] as const).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      </>}
    </section>
    <section aria-labelledby="queue-recovery-title">
      <p className="section-index">04 / Recovery</p><h2 id="queue-recovery-title">Recovery watch</h2>
      {snapshot ? <>
        <dl><div><dt>Oldest waiting job</dt><dd>{snapshot.oldestPendingSeconds === null ? 'No waiting jobs' : snapshot.oldestPendingSeconds < 60 ? 'Less than 1 min' : `${Math.floor(snapshot.oldestPendingSeconds / 60)} min`}</dd></div>
          <div><dt>Stale, eligible for recovery</dt><dd>{snapshot.recoverable}</dd></div><div><dt>Attempts exhausted</dt><dd>{snapshot.exhausted}</dd></div></dl>
        <p>Recovery counts are subsets of waiting and processing jobs, not additional jobs. An updated worker must be running to recover or settle them.</p>
      </> : <p>Recovery information appears when a queue snapshot is available.</p>}
    </section>
  </div>
}

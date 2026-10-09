import { useEffect, useId, useRef, useState } from 'react'
import './CubemapViewer.css'

// CSS uses +Y down and +Z toward the camera. These transforms invert the
// native projector's +Y up / +Z front convention without flipping the images.
const rotations: Record<string, string> = {
  front: '', right: 'rotateY(-90deg)', back: 'rotateY(180deg)',
  left: 'rotateY(90deg)', top: 'rotateX(-90deg)', bottom: 'rotateX(90deg)',
}
const initial = { yaw: 0, pitch: 0, fov: 75 }
export function CubemapViewer({ faces }: { faces: { name: string; url: string }[] }) {
  const [view, setView] = useState(initial)
  const [height, setHeight] = useState(300)
  const [loaded, setLoaded] = useState<string[]>([])
  const [error, setError] = useState(false)
  const stage = useRef<HTMLDivElement>(null)
  const drag = useRef<{ id: number; x: number; y: number } | undefined>(undefined)
  const helpID = useId()
  const preparing = loaded.length !== 6 && !error
  useEffect(() => {
    if (!preparing) return
    const timeout = window.setTimeout(() => setError(true), 15_000)
    return () => window.clearTimeout(timeout)
  }, [preparing])
  useEffect(() => {
    const measure = () => { if (stage.current) setHeight(Math.max(1, stage.current.clientHeight)) }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure)
    if (stage.current) observer?.observe(stage.current)
    window.addEventListener('resize', measure)
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure) }
  }, [])
  function move(yaw = 0, pitch = 0, zoom = 0) {
    setView(previous => ({ yaw: ((previous.yaw + yaw) % 360 + 360) % 360,
      pitch: Math.max(-89, Math.min(89, previous.pitch + pitch)),
      fov: Math.max(40, Math.min(100, previous.fov + zoom)) }))
  }
  const perspective = height / (2 * Math.tan(view.fov * Math.PI / 360))
  return <div className="cubemap-viewer">
    <p id={helpID}>Drag left or right to look around. Use the arrow keys or buttons to look in any direction; + and − zoom. On touch screens, vertical swipes scroll the page.</p>
    <div ref={stage} className="cubemap-stage" role="region" aria-label="Interactive native panorama" aria-describedby={helpID} tabIndex={0}
      style={{ perspective: `${perspective}px` }}
      onKeyDown={event => {
        if (event.altKey || event.ctrlKey || event.metaKey) return
        const actions: Record<string, () => void> = { ArrowLeft: () => move(-15), ArrowRight: () => move(15), ArrowUp: () => move(0, 15), ArrowDown: () => move(0, -15), '+': () => move(0, 0, -5), '=': () => move(0, 0, -5), '-': () => move(0, 0, 5), Home: () => setView(initial) }
        if (actions[event.key]) { event.preventDefault(); actions[event.key]() }
      }}
      onPointerDown={event => {
        if (!event.isPrimary || event.button !== 0) return
        drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={event => {
        const previous = drag.current
        if (!previous || previous.id !== event.pointerId) return
        move((previous.x - event.clientX) * .2, event.pointerType === 'touch' ? 0 : (event.clientY - previous.y) * .2)
        drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
      }}
      onPointerUp={() => { drag.current = undefined }} onPointerCancel={() => { drag.current = undefined }} onLostPointerCapture={() => { drag.current = undefined }}>
      <div className="cubemap-cube" aria-hidden="true" style={{ visibility: loaded.length === 6 && !error ? 'visible' : 'hidden', transform: `translate(-50%, -50%) translateZ(${perspective}px) rotateX(${view.pitch}deg) rotateY(${view.yaw}deg)` }}>
        {faces.map(face => <img className="cubemap-face" data-face={face.name} key={face.name} src={face.url} alt="" draggable={false}
          style={{ transform: `${rotations[face.name]} translateZ(-500px)` }}
          onLoad={() => setLoaded(previous => previous.includes(face.name) ? previous : [...previous, face.name])} onError={() => setError(true)} />)}
      </div>
      {error ? <p className="cubemap-message" role="alert">Could not display this panorama. Switch to Inspect faces or reload the bundle.</p> : loaded.length !== 6 && <p className="cubemap-message" role="status">Preparing interactive view…</p>}
    </div>
    <div className="cubemap-controls" role="group" aria-label="Panorama controls">
      <button type="button" onClick={() => move(-15)}>Look left</button><button type="button" onClick={() => move(15)}>Look right</button>
      <button type="button" onClick={() => move(0, 15)} disabled={view.pitch === 89}>Look up</button><button type="button" onClick={() => move(0, -15)} disabled={view.pitch === -89}>Look down</button>
      <button type="button" onClick={() => move(0, 0, -5)} disabled={view.fov === 40}>Zoom in</button><button type="button" onClick={() => move(0, 0, 5)} disabled={view.fov === 100}>Zoom out</button>
      <button type="button" onClick={() => setView(initial)}>Reset view</button>
    </div>
    <p className="cubemap-position">Heading {Math.round(view.yaw)}° · Tilt {Math.round(view.pitch)}° · Field of view {view.fov}°</p>
  </div>
}

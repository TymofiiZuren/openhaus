import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { fetchProperties, type Property } from './api/properties'
import { createConciergeReply, type ConciergeReply } from './propertyConcierge'
import { openHausGuideEvent } from './OpenHausGuideButton'
import './App.css'

const euros = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

export function UniversalGuide() {
  const [open, setOpen] = useState(() => new URLSearchParams(window.location.search).get('guide') === 'open')
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [properties, setProperties] = useState<Property[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [submittedMessage, setSubmittedMessage] = useState('')
  const [reply, setReply] = useState<ConciergeReply | null>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const catalogueRequested = useRef(false)
  const [position, setPosition] = useState<CSSProperties>({ visibility: 'hidden' })

  useEffect(() => {
    const show = (event: Event) => {
      const source = event instanceof CustomEvent && event.detail instanceof HTMLElement ? event.detail : null
      returnFocus.current = source ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null)
      setAnchor(source)
      setOpen(true)
    }
    window.addEventListener(openHausGuideEvent, show)
    return () => window.removeEventListener(openHausGuideEvent, show)
  }, [])

  useEffect(() => {
    if (!open || catalogueRequested.current) return
    catalogueRequested.current = true
    const controller = new AbortController()
    let settled = false
    setStatus('loading')
    fetchProperties(controller.signal)
      .then(items => { settled = true; setProperties(items); setStatus('ready') })
      .catch(error => {
        settled = true
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          catalogueRequested.current = false
          setStatus('error')
        }
      })
    return () => { if (!settled) catalogueRequested.current = false; controller.abort() }
  }, [open])

  useLayoutEffect(() => {
    if (!open) return
    const update = () => {
      if (window.innerWidth <= 700) {
        setPosition({ right: 0, bottom: 0, left: 0, width: '100%', maxHeight: 'calc(88dvh - env(safe-area-inset-bottom))' })
        return
      }
      const source = anchor ?? document.querySelector<HTMLElement>('.openhaus-guide-trigger')
      if (!source) return
      const rect = source.getBoundingClientRect()
      const edge = 18
      const width = Math.min(480, window.innerWidth - edge * 2)
      const left = Math.max(edge, Math.min(rect.right - width, window.innerWidth - width - edge))
      const top = rect.bottom + 10
      setPosition({ top, left, width, maxHeight: Math.max(320, window.innerHeight - top - edge) })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true) }
  }, [anchor, open])

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusTask = window.setTimeout(() => input.current?.focus(), 0)
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); return }
      if (event.key !== 'Tab' || !dialog.current) return
      const controls = [...dialog.current.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled])')]
      const first = controls[0]
      const last = controls.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', keydown)
    return () => {
      window.clearTimeout(focusTask)
      document.removeEventListener('keydown', keydown)
      document.body.style.overflow = previousOverflow
      returnFocus.current?.focus({ preventScroll: true })
    }
  }, [open])

  if (!open) return null
  const ask = (brief: string) => {
    const value = brief.trim()
    if (!value || status !== 'ready') return
    setSubmittedMessage(value); setMessage(''); setReply(createConciergeReply(value, properties))
  }
  const suggestions = ['Homes in Cork under €800k', '4 bedroom homes', 'Detached homes with a 360 tour']

  return <div className="guide-popover-layer" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false) }}>
    <div ref={dialog} className="guide-popover" style={position} role="dialog" aria-modal="true" aria-labelledby="universal-guide-title">
      <section className="property-concierge" id="openhaus-guide-dialog">
        <header><div><p className="section-index">Property intelligence · anywhere</p><h2 id="universal-guide-title">OpenHaus guide</h2><p className="concierge-availability"><span aria-hidden="true" />{status === 'ready' ? `Catalogue ready · ${properties.length} homes indexed` : status === 'error' ? 'Catalogue temporarily unavailable' : 'Connecting to catalogue'}</p></div><button type="button" className="overlay-close" aria-label="Close OpenHaus guide" onClick={() => setOpen(false)}>×</button></header>
        <div className="concierge-introduction"><p>Describe the home you want. I’ll search the live catalogue without taking you away from this page.</p><div className="concierge-suggestions" aria-label="Suggested searches">{suggestions.map(suggestion => <button type="button" key={suggestion} disabled={status !== 'ready'} onClick={() => ask(suggestion)}>{suggestion}</button>)}</div></div>
        <form onSubmit={event => { event.preventDefault(); ask(message) }}><label htmlFor="universal-guide-message">What are you looking for?</label><div><input ref={input} id="universal-guide-message" value={message} onChange={event => setMessage(event.target.value)} placeholder="For example: 3 bedrooms under €800k in Cork" autoComplete="off" /><button type="submit" disabled={!message.trim() || status !== 'ready'}>Find matching homes</button></div></form>
        {status === 'error' && <p className="client-feedback" role="alert">The property catalogue could not be reached. Your current page is unaffected.</p>}
        {reply && <div className="concierge-thread" aria-live="polite"><div className="concierge-message is-user"><span>You</span><p>{submittedMessage}</p></div><div className="concierge-message is-guide"><span>OpenHaus</span><div className="concierge-reply"><p>{reply.summary}</p>{reply.matches.length > 0 && <ul>{reply.matches.slice(0, 3).map(property => <li key={property.id}><a href={`/properties/${property.id}`}><span>{property.city} · {property.bedrooms} bedrooms</span><strong>{property.title}</strong><small>{euros.format(property.priceCents / 100)}</small></a></li>)}</ul>}<a className="concierge-apply" href="/#homes">Open the full catalogue <span aria-hidden="true">→</span></a></div></div></div>}
        <footer><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 3.5 7.5v5c0 4.8 3.1 7.5 8.5 8.5 5.4-1 8.5-3.7 8.5-8.5v-5L12 3Z"/><path d="m8.5 12 2.2 2.2 4.8-5"/></svg><p><strong>Available everywhere.</strong> Searches stay in this browser and use the current OpenHaus catalogue.</p></footer>
      </section>
    </div>
  </div>
}

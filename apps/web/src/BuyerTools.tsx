import { useState } from 'react'
import type { Property } from './api/properties'
import './BuyerTools.css'

const euros = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

export function ShortlistInsights({ properties, status, onRetry }: {
  properties: Property[]; status: 'loading' | 'ready' | 'error'; onRetry: () => void
}) {
  const [county, setCounty] = useState('')
  const [sort, setSort] = useState('price')
  if (status === 'loading') return <p role="status">Loading saved homes…</p>
  if (status === 'error') return <div className="buyer-tool"><p role="alert">Saved homes are temporarily unavailable.</p><button onClick={onRetry}>Retry saved homes</button></div>
  if (!properties.length) return <div className="buyer-tool"><p>Save a few homes to start comparing your shortlist.</p><a href="/#explore">Find homes to save</a></div>
  const homes = properties.filter(home => !county || home.county === county)
    .sort((a, b) => (sort === 'bedrooms' ? b.bedrooms - a.bedrooms : a.priceCents - b.priceCents) || a.title.localeCompare(b.title))
  const prices = homes.map(home => home.priceCents).sort((a, b) => a - b)
  const middle = Math.floor(prices.length / 2)
  const median = prices.length ? (prices[middle] + prices[Math.floor((prices.length - 1) / 2)]) / 2 : undefined
  return <section className="buyer-tool" aria-label="Shortlist analysis">
    <p>Understand the homes you saved. These are current asking prices in your shortlist, not market valuations or price history.</p>
    <div className="buyer-tool-controls">
      <label>County<select value={county} onChange={event => setCounty(event.target.value)}><option value="">All counties</option>{[...new Set(properties.map(home => home.county))].sort().map(name => <option key={name}>{name}</option>)}</select></label>
      <label>Sort homes<select value={sort} onChange={event => setSort(event.target.value)}><option value="price">Lowest asking price</option><option value="bedrooms">Most bedrooms</option></select></label>
    </div>
    <dl className="buyer-tool-stats"><div><dt>Homes in view</dt><dd>{homes.length}</dd></div><div><dt>Median asking price</dt><dd>{median === undefined ? '—' : euros.format(median / 100)}</dd></div><div><dt>Counties in view</dt><dd>{new Set(homes.map(home => home.county)).size}</dd></div></dl>
    <ul className="buyer-tool-homes">{homes.map(home => <li key={home.id}><div><a href={`/properties/${encodeURIComponent(home.id)}`}>{home.title}</a><p>Co. {home.county} · {home.bedrooms} bedrooms</p></div><strong>{euros.format(home.priceCents / 100)}</strong></li>)}</ul>
  </section>
}

const viewingGroups = [
  { title: 'Before you go', items: ['Confirm the address and viewing time', 'List your must-haves and questions', 'Review the listing photos and floor plan'] },
  { title: 'During the visit', items: ['Check room sizes against your furniture needs', 'Notice daylight, storage and outside noise', 'Ask about heating and recent maintenance'] },
  { title: 'After the visit', items: ['Record what you liked and what needs clarification', 'Compare the home with the rest of your shortlist', 'Send follow-up questions to the listing agent'] },
]

const checklistKey = 'openhaus:viewing-checklist:v1'
const checklistItems = viewingGroups.flatMap(group => group.items)

function loadChecklist(): { checked: string[]; error: string } {
  try {
    const raw = localStorage.getItem(checklistKey)
    if (!raw) return { checked: [], error: '' }
    const saved: unknown = JSON.parse(raw)
    if (!Array.isArray(saved) || saved.length > checklistItems.length || saved.some(item => typeof item !== 'string' || !checklistItems.includes(item))) throw new Error('Invalid checklist')
    return { checked: [...new Set(saved)], error: '' }
  } catch { return { checked: [], error: 'Saved progress could not be loaded. You can still use the checklist and try saving again.' } }
}

export function ViewingChecklist() {
  const [initial] = useState(loadChecklist)
  const [checked, setChecked] = useState<string[]>(initial.checked)
  const [error, setError] = useState(initial.error)
  const [message, setMessage] = useState(initial.checked.length ? 'Restored from this browser.' : 'Not saved yet.')
  function save() {
    try {
      localStorage.setItem(checklistKey, JSON.stringify(checked))
      setError(''); setMessage('Saved on this browser.')
    } catch { setError('Progress could not be saved. Your checks are still on this page. Try saving again or check your browser storage settings.') }
  }
  function reset() {
    try {
      localStorage.removeItem(checklistKey)
      setChecked([]); setError(''); setMessage('Checklist reset. Saved progress removed.')
    } catch { setError('Saved progress could not be removed. Nothing was reset. Try again or use your browser site-data settings.') }
  }
  const total = viewingGroups.reduce((sum, group) => sum + group.items.length, 0)
  return <section className="buyer-tool" aria-label="Viewing preparation">
    <p>A practical companion for your next visit. This does not book a viewing. Save your progress before leaving; later changes are not saved automatically.</p>
    <p>One checklist is shared by this browser profile, not tied to a home or account. Anyone using this browser can see saved checks. <a href="/privacy">Manage browser data</a>.</p>
    <div className="buyer-tool-progress"><p role="status">{checked.length} of {total} completed · {message}</p><progress aria-label="Viewing checklist completion" value={checked.length} max={total} /></div>
    {error && <p role="alert">{error}</p>}
    <div className="buyer-tool-controls"><button type="button" onClick={save}>Save on this browser</button><button type="button" onClick={reset}>Reset checklist</button></div>
    {viewingGroups.map(group => <fieldset key={group.title}><legend>{group.title}</legend>{group.items.map(item => <label className="buyer-tool-check" key={item}><input type="checkbox" checked={checked.includes(item)} onChange={() => { setChecked(current => current.includes(item) ? current.filter(value => value !== item) : [...current, item]); setMessage('Unsaved changes.'); setError('') }} /><span>{item}</span></label>)}</fieldset>)}
  </section>
}

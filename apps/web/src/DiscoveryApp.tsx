import { useEffect, useMemo, useState } from 'react'
import { fetchProperties, type Property } from './api/properties'
import { aggregateAreas, rankProperties, type MatchPreferences, type PropertyMatch } from './propertyMatching'
import { SiteHeader } from './SiteHeader'
import './DiscoveryApp.css'

type DiscoveryPage = 'match' | 'areas'
const euros = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const compactEuros = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1 })

function initialPreferences(): MatchPreferences {
  const query = new URLSearchParams(window.location.search)
  const price = Number(query.get('budget'))
  const bedrooms = Number(query.get('bedrooms'))
  const weight = (key: string, fallback: number) => {
    const value = Number(query.get(key))
    return Number.isInteger(value) && value >= 1 && value <= 5 ? value : fallback
  }
  return {
    maxPriceCents: Number.isFinite(price) && price >= 250000 && price <= 2000000 ? price * 100 : 75000000,
    minimumBedrooms: Number.isFinite(bedrooms) && bedrooms >= 1 && bedrooms <= 6 ? bedrooms : 3,
    county: query.get('county') || 'Any',
    budgetWeight: weight('budgetWeight', 4),
    spaceWeight: weight('spaceWeight', 3),
    mediaWeight: weight('mediaWeight', 2),
  }
}

function titleCase(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase())
}

function ScoreRing({ score }: { score: number }) {
  return <div className="match-score" role="img" aria-label={`${score}% match`}>
    <svg viewBox="0 0 42 42" aria-hidden="true">
      <circle className="match-score-track" cx="21" cy="21" r="16" pathLength="100" />
      <circle className="match-score-value" cx="21" cy="21" r="16" pathLength="100" strokeDasharray={`${score} 100`} />
    </svg>
    <strong>{score}</strong><span>%</span>
  </div>
}

function Signal({ label, value }: { label: string; value: number }) {
  return <div className="match-signal"><span>{label}</span><div aria-hidden="true"><i style={{ width: `${value}%` }} /></div><strong>{value}</strong></div>
}

function MatchCard({ result, index }: { result: PropertyMatch; index: number }) {
  const { property, score, signals, reasons } = result
  const cover = property.media.find(item => item.kind === 'image')?.url ?? '/media/placeholders/architectural-home.svg?v=3'
  return <article className="match-card">
    <div className="match-card-rank"><span>{String(index + 1).padStart(2, '0')}</span><ScoreRing score={score} /></div>
    <a className="match-card-image" href={`/properties/${property.id}`} aria-label={`Open ${property.title}`}><img src={cover} alt="" loading="lazy" /></a>
    <div className="match-card-copy">
      <p>{property.city} / Co. {property.county}</p>
      <h2><a href={`/properties/${property.id}`}>{property.title}</a></h2>
      <div className="match-card-facts"><span>{euros.format(property.priceCents / 100)}</span><span>{property.bedrooms} bedrooms</span><span>{titleCase(property.propertyType)}</span></div>
      <ul>{reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
    </div>
    <div className="match-card-signals" aria-label={`Match signals for ${property.title}`}>
      <Signal label="Budget" value={signals.budget} />
      <Signal label="Space" value={signals.space} />
      <Signal label="Media" value={signals.media} />
      <Signal label="Place" value={signals.location} />
    </div>
  </article>
}

function MatchLab({ properties }: { properties: Property[] }) {
  const [preferences, setPreferences] = useState(initialPreferences)
  const counties = useMemo(() => [...new Set(properties.map(property => property.county))].sort((a, b) => a.localeCompare(b, 'en-IE')), [properties])
  const selectedCounty = preferences.county === 'Any' || counties.includes(preferences.county) ? preferences.county : 'Any'
  const ranked = useMemo(() => rankProperties(properties, { ...preferences, county: selectedCounty }), [properties, preferences, selectedCounty])

  function updatePreferences(change: Partial<MatchPreferences>) {
    const next = { ...preferences, ...change }
    setPreferences(next)
    const query = new URLSearchParams()
    if (next.county !== 'Any') query.set('county', next.county)
    query.set('budget', String(Math.round(next.maxPriceCents / 100)))
    query.set('bedrooms', String(next.minimumBedrooms))
    query.set('budgetWeight', String(next.budgetWeight))
    query.set('spaceWeight', String(next.spaceWeight))
    query.set('mediaWeight', String(next.mediaWeight))
    window.history.replaceState({}, '', `${window.location.pathname}?${query}`)
  }

  return <>
    <header className="discovery-hero">
      <div><p className="discovery-kicker">OpenHaus / Match Lab</p><h1>Turn preference into signal.</h1><p>Shape a brief and watch every home re-rank immediately. Nothing leaves this browser, and every result explains itself.</p></div>
      <div className="match-shortlist-art" aria-hidden="true">
        <div className="match-shortlist-caption">Your priorities. In order.</div>
        <div className="match-shortlist-stack">
          {[0, 1, 2].map(index => <div className="match-shortlist-sheet" key={index}>
            <svg viewBox="0 0 160 100" fill="none"><path d="M24 80V43L62 17L101 43V80M62 17V80M15 80H145M101 43L124 28L145 43V80M38 80V55H51V80M76 47H89V61H76Z" /></svg>
            <div className="match-shortlist-signals"><span>Budget<i /></span><span>Space<i /></span><span>Place<i /></span></div>
          </div>)}
        </div>
        <p>A clearer shortlist.</p>
      </div>
    </header>
    <div className="match-workspace">
      <aside className="match-controls" aria-label="Match priorities">
        <header><p>Signal controls</p><span>01 / Live model</span></header>
        <label>Location focus<select value={selectedCounty} onChange={event => updatePreferences({ county: event.target.value })}><option>Any</option>{counties.map(county => <option key={county}>{county}</option>)}</select></label>
        <label>Working budget <output>{compactEuros.format(preferences.maxPriceCents / 100)}</output><input type="range" min="25000000" max="200000000" step="2500000" value={preferences.maxPriceCents} onChange={event => updatePreferences({ maxPriceCents: Number(event.target.value) })} /></label>
        <label>Minimum bedrooms <output>{preferences.minimumBedrooms}+</output><input type="range" min="1" max="6" value={preferences.minimumBedrooms} onChange={event => updatePreferences({ minimumBedrooms: Number(event.target.value) })} /></label>
        <fieldset><legend>What should lead?</legend>
          <label>Budget fit <output>{preferences.budgetWeight}</output><input aria-label="Budget fit importance" type="range" min="1" max="5" value={preferences.budgetWeight} onChange={event => updatePreferences({ budgetWeight: Number(event.target.value) })} /></label>
          <label>Living space <output>{preferences.spaceWeight}</output><input aria-label="Living space importance" type="range" min="1" max="5" value={preferences.spaceWeight} onChange={event => updatePreferences({ spaceWeight: Number(event.target.value) })} /></label>
          <label>Media depth <output>{preferences.mediaWeight}</output><input aria-label="Media depth importance" type="range" min="1" max="5" value={preferences.mediaWeight} onChange={event => updatePreferences({ mediaWeight: Number(event.target.value) })} /></label>
        </fieldset>
        <div className="match-method"><span>Private</span><span>Deterministic</span><span>Explainable</span><p>The score uses price, bedrooms, location and available listing media. It does not infer personal characteristics or predict investment returns.</p></div>
      </aside>
      <section className="match-results" aria-label="Ranked home matches">
        <header><div><p>Ranked now</p><h2 aria-live="polite">{ranked.length} homes recalculated</h2></div><a href="/areas">Open area index <span aria-hidden="true">→</span></a></header>
        {ranked.length === 0 ? <div className="discovery-empty"><h2>No homes are available to rank.</h2><a href="/#homes">Return to the catalogue</a></div> : <>{ranked.slice(0, 8).map((result, index) => <MatchCard key={result.property.id} result={result} index={index} />)}{ranked.length > 8 && <div className="match-more"><span>Top 8 shown from {ranked.length} calculated homes</span><a href="/#homes">Browse the full catalogue <span aria-hidden="true">→</span></a></div>}</>}
      </section>
    </div>
  </>
}

function AreaIndexPage({ properties }: { properties: Property[] }) {
  const areas = useMemo(() => aggregateAreas(properties), [properties])
  const total = properties.length
  const nationalMedian = areas.length ? Math.round(areas.reduce((sum, area) => sum + area.medianPriceCents * area.inventory, 0) / total) : 0
  return <>
    <header className="discovery-hero area-hero">
      <div><p className="discovery-kicker">OpenHaus / Area Index</p><h1>The live shape of the market.</h1><p>A catalogue-derived view of supply, typical asking price and media completeness—designed to show what the data knows and what it does not.</p></div>
      <dl><div><dt>Live homes</dt><dd>{total}</dd></div><div><dt>Counties represented</dt><dd>{areas.length}</dd></div><div><dt>Weighted asking price</dt><dd>{nationalMedian ? compactEuros.format(nationalMedian / 100) : '—'}</dd></div></dl>
    </header>
    <section className="area-index" aria-label="Area index">
      <header><p>Signal board</p><span>Derived from the current OpenHaus catalogue</span></header>
      {areas.map((area, index) => <article key={area.county} className="area-row">
        <span className="area-rank">{String(index + 1).padStart(2, '0')}</span>
        <div className="area-name"><p>County</p><h2>{area.county}</h2><a href={`/?county=${encodeURIComponent(area.county)}#explore`}>Explore live homes <span aria-hidden="true">↗</span></a></div>
        <dl><div><dt>Supply</dt><dd>{area.inventory} live {area.inventory === 1 ? 'home' : 'homes'}</dd></div><div><dt>Median ask</dt><dd>{euros.format(area.medianPriceCents / 100)}</dd></div><div><dt>Typical space</dt><dd>{area.averageBedrooms} bedrooms</dd></div><div><dt>Leading type</dt><dd>{titleCase(area.leadingType)}</dd></div></dl>
        <div className="area-readiness"><span>Media-ready listings</span><strong>{area.mediaReadiness}%</strong><div aria-hidden="true"><i style={{ width: `${area.mediaReadiness}%` }} /></div></div>
      </article>)}
      {areas.length === 0 && <div className="discovery-empty"><h2>The area index is waiting for catalogue data.</h2><a href="/">Return home</a></div>}
    </section>
  </>
}

export function DiscoveryApp({ page }: { page: DiscoveryPage }) {
  const [properties, setProperties] = useState<Property[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    fetchProperties(controller.signal).then(items => { if (!controller.signal.aborted) { setProperties(items); setStatus('ready') } }).catch(() => { if (!controller.signal.aborted) setStatus('error') })
    return () => controller.abort()
  }, [attempt])
  useEffect(() => {
    const previous = document.title
    document.title = `${page === 'match' ? 'Match Lab' : 'Area Index'} — OpenHaus`
    return () => { document.title = previous }
  }, [page])

  return <div className="site-shell discovery-shell">
    <a className="skip-link" href="#discovery-content">Skip to discovery tools</a>
    <SiteHeader pathname={`/${page}`} />
    <main id="discovery-content" className="discovery-main">
      {status === 'loading' && <div className="discovery-status" role="status"><span>Calculating catalogue signals</span><i /></div>}
      {status === 'error' && <div className="discovery-status" role="alert"><h1>Discovery data is unavailable.</h1><p>Your settings have not been sent or stored.</p><button type="button" onClick={() => { setStatus('loading'); setAttempt(value => value + 1) }}>Try again</button></div>}
      {status === 'ready' && (page === 'match' ? <MatchLab properties={properties} /> : <AreaIndexPage properties={properties} />)}
    </main>
    <footer className="discovery-footer"><a href="/">OpenHaus</a><p>Decision tools, grounded in visible listing facts.</p><nav aria-label="Discovery navigation"><a href="/match">Match Lab</a><a href="/areas">Area Index</a><a href="/privacy">Privacy</a></nav></footer>
  </div>
}

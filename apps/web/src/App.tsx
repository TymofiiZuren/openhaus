import { lazy, memo, Suspense, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import './App.css'
import { SiteHeader } from './SiteHeader'
import { ClientSignInPrompt } from './ClientSignInPrompt'
import { fetchClientSavedProperties, removeClientSavedProperty, saveClientProperty } from './api/clientSavedProperties'
import { fetchClientPropertyNote, saveClientPropertyNote } from './api/clientPropertyNotes'
import { createClientSavedSearch } from './api/clientSavedSearches'
import { fetchProperties, type Property } from './api/properties'
import { createPropertySearchIndex } from './propertySearch'
import { isShowcaseProperty } from './showcaseProperties'
import { createConciergeReply, type ConciergeCriteria, type ConciergeReply } from './propertyConcierge'
import { findSellingAgent } from './sellingAgents'
const PropertyMap = lazy(() => import('./PropertyMap').then((module) => ({ default: module.PropertyMap })))
const SpatialMediaViewer = lazy(() => import('./SpatialMediaViewer').then((module) => ({ default: module.SpatialMediaViewer })))
type AreaTools = typeof import('./administrativeAreas')

type CatalogueState =
  | { status: 'loading'; properties: Property[] }
  | { status: 'success'; properties: Property[] }
  | { status: 'error'; properties: Property[] }

const euros = new Intl.NumberFormat('en-IE', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
})

const shortlistKey = 'openhaus:comparison:v1'
const propertyTypes = new Set(['all', 'detached', 'semi_detached', 'terraced', 'apartment'])
function initialSearchNumber(name: string, allowed: number[]): number {
  const value = Number(new URLSearchParams(window.location.search).get(name) ?? 0)
  return allowed.includes(value) ? value : 0
}
function readShortlist(): string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(shortlistKey) ?? '[]')
    return Array.isArray(saved) ? [...new Set(saved.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 128))].slice(0, 4) : []
  } catch { return [] }
}

function HomepageHero({ query, propertyCount, onQueryChange, onAskOpenHaus }: { query: string; propertyCount?: number; onQueryChange: (query: string) => void; onAskOpenHaus: () => void }) {
  return <section className="home-hero" aria-label="Find your next home">
    <div className="home-hero-layout">
      <div className="home-hero-copy">
        <p className="eyebrow">OpenHaus / Property discovery</p>
        <h1 id="home-hero-title"><span>Find the address.</span>{' '}<span>See the whole picture.</span></h1>
        <p>A faster way to search Irish homes, compare the facts and inspect every available photograph, plan and tour.</p>
        <form className="home-hero-search" role="search" onSubmit={(event) => { event.preventDefault(); document.getElementById('explore')?.scrollIntoView() }}>
          <label className="visually-hidden" htmlFor="home-hero-search">Search homes from the opening feature</label>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>
          <input id="home-hero-search" type="search" value={query} placeholder="Address, county or local area" onChange={(event) => onQueryChange(event.target.value)} />
          <button type="submit">Search homes</button>
        </form>
        <nav className="home-hero-actions" aria-label="Opening shortcuts"><button type="button" onClick={onAskOpenHaus}>Ask OpenHaus</button><a href="/match">Open Match Lab</a><a href="/areas">Compare areas</a></nav>
      </div>
    </div>
    <aside className="home-hero-desk" aria-label="Live property desk">
      <header><span>OpenHaus / Live</span><strong>IRL</strong></header>
      <div className="home-hero-desk-heading"><p>Property intelligence</p><span>STATUS</span></div>
      <dl>
        <div><dt>Homes available</dt><dd>{propertyCount === undefined ? 'Loading' : propertyCount}</dd><span>LIVE</span></div>
        <div><dt>Search coverage</dt><dd>All Ireland</dd><span>26 counties</span></div>
        <div><dt>Listing detail</dt><dd>Media + plans</dd><span>CONNECTED</span></div>
        <div><dt>Buyer tools</dt><dd>Rank + compare</dd><span>READY</span></div>
      </dl>
      <a href="/match">Build your match model <span aria-hidden="true">→</span></a>
    </aside>
    <dl className="home-hero-facts">
      <div><dt>01 / Search</dt><dd>Address and area</dd></div>
      <div><dt>02 / Inspect</dt><dd>Photography and plans</dd></div>
      <div><dt>03 / Decide</dt><dd>Explainable match signals</dd></div>
    </dl>
  </section>
}

function App() {
  const [state, setState] = useState<CatalogueState>({ status: 'loading', properties: [] })
  const [requestKey, setRequestKey] = useState(0)
  const [selectedCounty, setSelectedCounty] = useState<string | null>(() => new URLSearchParams(window.location.search).get('county'))
  const [selectedArea, setSelectedArea] = useState<string | undefined>(() => new URLSearchParams(window.location.search).get('area') ?? undefined)
  const [propertyQuery, setPropertyQuery] = useState(() => (new URLSearchParams(window.location.search).get('query') ?? '').slice(0, 160))
  const [minimumBedrooms, setMinimumBedrooms] = useState(() => initialSearchNumber('beds', [0, 2, 3, 4]))
  const [propertyType, setPropertyType] = useState(() => { const value = new URLSearchParams(window.location.search).get('type') ?? 'all'; return propertyTypes.has(value) ? value : 'all' })
  const [maximumPrice, setMaximumPrice] = useState(() => initialSearchNumber('maxPrice', [0, 650000, 800000, 1000000]))
  const [spatialToursOnly, setSpatialToursOnly] = useState(() => new URLSearchParams(window.location.search).get('tour') === 'true')
  const [sortOrder, setSortOrder] = useState('recent')
  const [saveSearchOpen, setSaveSearchOpen] = useState(false)
  const [shortlistedPropertyIDs, setShortlistedPropertyIDs] = useState<string[]>(readShortlist)
  const [compareOpen, setCompareOpen] = useState(false)
  const [conciergeOpen, setConciergeOpen] = useState(() => new URLSearchParams(window.location.search).get('guide') === 'open')
  const [conciergeAnchor, setConciergeAnchor] = useState<HTMLElement | null>(null)
  const [areaAttempt, setAreaAttempt] = useState(0)
  const [areaLoad, setAreaLoad] = useState<{ county: string | null; attempt: number; tools?: AreaTools; failed?: boolean }>()
  const currentAreaLoad = areaLoad?.county === selectedCounty && areaLoad.attempt === areaAttempt ? areaLoad : undefined
  const areaTools = currentAreaLoad?.tools
  const [mapReady, setMapReady] = useState(() => window.location.hash === '#explore' || typeof IntersectionObserver === 'undefined')
  const mapEntry = useRef<HTMLDivElement>(null)
  const deferredPropertyQuery = useDeferredValue(propertyQuery)

  useEffect(() => {
    let frame = 0
    const restoreMapAnchor = () => {
      if (window.location.hash !== '#explore' || !mapEntry.current) return
      setMapReady(true)
      frame = requestAnimationFrame(() => mapEntry.current?.scrollIntoView?.({ block: 'start', behavior: 'instant' }))
    }
    restoreMapAnchor()
    window.addEventListener('hashchange', restoreMapAnchor)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('hashchange', restoreMapAnchor)
    }
  }, [state.status])

  useEffect(() => {
    try { localStorage.setItem(shortlistKey, JSON.stringify(shortlistedPropertyIDs)) } catch { /* Comparison remains usable without storage. */ }
  }, [shortlistedPropertyIDs])

  useEffect(() => {
    const controller = new AbortController()
    fetchProperties(controller.signal)
      .then((properties) => setState({ status: 'success', properties }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setState({ status: 'error', properties: [] })
      })
    return () => controller.abort()
  }, [requestKey])

  useEffect(() => {
    if (!mapReady && !selectedArea) return
    let active = true
    import('./administrativeAreas')
      .then(async module => { await module.loadAreasForCounty(selectedCounty); return module })
      .then(tools => { if (active) setAreaLoad({ county: selectedCounty, attempt: areaAttempt, tools }) })
      .catch(() => { if (active) setAreaLoad({ county: selectedCounty, attempt: areaAttempt, failed: true }) })
    return () => { active = false }
  }, [mapReady, selectedCounty, selectedArea, areaAttempt])

  useEffect(() => {
    if (mapReady || state.status !== 'success' || state.properties.length === 0 || !mapEntry.current) return
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      setMapReady(true)
      observer.disconnect()
    }, { rootMargin: '120px 0px' })
    observer.observe(mapEntry.current)
    return () => observer.disconnect()
  }, [mapReady, state])

  const retry = useCallback(() => {
    setState({ status: 'loading', properties: [] })
    setRequestKey((key) => key + 1)
  }, [])

  const selectCounty = useCallback((county: string | null) => {
    setSelectedCounty(county)
    setSelectedArea(undefined)
    const url = new URL(window.location.href)
    if (county) url.searchParams.set('county', county)
    else url.searchParams.delete('county')
    url.searchParams.delete('area')
    window.history.pushState({}, '', url)
  }, [])

  const selectArea = useCallback((area?: string) => {
    setSelectedArea(area)
    const url = new URL(window.location.href)
    if (area) url.searchParams.set('area', area)
    else url.searchParams.delete('area')
    window.history.pushState({}, '', url)
  }, [])

  useEffect(() => {
    const restoreCounty = () => {
      const parameters = new URLSearchParams(window.location.search)
      setSelectedCounty(parameters.get('county'))
      setSelectedArea(parameters.get('area') ?? undefined)
    }
    window.addEventListener('popstate', restoreCounty)
    return () => window.removeEventListener('popstate', restoreCounty)
  }, [])

  useEffect(() => {
    if (state.status !== 'success' || !selectedCounty) return
    const available = state.properties.some((property) => property.county.localeCompare(selectedCounty, undefined, { sensitivity: 'base' }) === 0)
    if (available) return
    const url = new URL(window.location.href)
    url.searchParams.delete('county')
    window.history.replaceState({}, '', url)
  }, [selectedCounty, state])

  const effectiveSelectedCounty = selectedCounty && state.properties.some((property) => property.county.localeCompare(selectedCounty, undefined, { sensitivity: 'base' }) === 0)
    ? selectedCounty
    : null
  const effectiveSelectedArea = selectedArea && effectiveSelectedCounty && areaTools?.areasForCounty(effectiveSelectedCounty).some((area) => area.name.localeCompare(selectedArea, undefined, { sensitivity: 'base' }) === 0)
    ? selectedArea
    : undefined

  useEffect(() => {
    if (state.status !== 'success' || !areaTools || !selectedArea || effectiveSelectedArea) return
    const url = new URL(window.location.href)
    url.searchParams.delete('area')
    window.history.replaceState({}, '', url)
  }, [areaTools, effectiveSelectedArea, selectedArea, state.status])
  const propertySearchIndex = useMemo(() => createPropertySearchIndex(state.properties), [state.properties])
  const matchingPropertyIDs = useMemo(() => propertySearchIndex.search(deferredPropertyQuery), [deferredPropertyQuery, propertySearchIndex])
  const filteredProperties = useMemo(() => state.properties.filter((property) => {
    return matchingPropertyIDs.has(property.id)
      && (!minimumBedrooms || property.bedrooms >= minimumBedrooms)
      && (propertyType === 'all' || property.propertyType === propertyType)
      && (!maximumPrice || property.priceCents <= maximumPrice * 100)
      && (!spatialToursOnly || property.media.some((item) => item.kind === 'panorama'))
  }), [matchingPropertyIDs, maximumPrice, minimumBedrooms, propertyType, spatialToursOnly, state.properties])
  const visibleProperties = useMemo(() => {
    const countyProperties = effectiveSelectedCounty
      ? filteredProperties.filter((property) => property.county.localeCompare(effectiveSelectedCounty, undefined, { sensitivity: 'base' }) === 0)
      : filteredProperties
    const locationProperties = effectiveSelectedCounty && effectiveSelectedArea && areaTools
      ? countyProperties.filter((property) => areaTools.areaForCoordinate(effectiveSelectedCounty, { lat: property.latitude, lng: property.longitude })?.name === effectiveSelectedArea)
      : countyProperties
    return [...locationProperties].sort((left, right) => {
      if (sortOrder === 'price-low') return left.priceCents - right.priceCents
      if (sortOrder === 'price-high') return right.priceCents - left.priceCents
      return 0
    })
  }, [areaTools, effectiveSelectedArea, effectiveSelectedCounty, filteredProperties, sortOrder])
  const featuredProperty = state.status === 'success' ? state.properties[0] : undefined
  const featuredImage = featuredProperty?.media.find((item) => item.kind === 'image')
  const featuredFloorPlan = featuredProperty?.media.find((item) => item.kind === 'floor_plan')
  const requestedMapPropertyID = new URLSearchParams(window.location.search).get('property') ?? undefined
  const requestedTourPropertyID = propertyTourIDFromPath(window.location.pathname)
  const requestedPropertyID = propertyIDFromPath(window.location.pathname)
  const shortlistedProperties = state.properties.filter((property) => shortlistedPropertyIDs.includes(property.id))
  const toggleShortlist = useCallback((propertyID: string) => setShortlistedPropertyIDs((current) => current.includes(propertyID) ? current.filter((id) => id !== propertyID) : current.length < 4 ? [...current, propertyID] : current), [])

  const applyConciergeCriteria = useCallback((criteria: ConciergeCriteria) => {
    const county = criteria.location && state.properties.find((property) => property.county.localeCompare(criteria.location!, undefined, { sensitivity: 'base' }) === 0)?.county
    if (county) {
      selectCounty(county)
      setPropertyQuery('')
    } else {
      if (criteria.location) {
        const matchingProperty = state.properties.find((property) => property.city.localeCompare(criteria.location!, undefined, { sensitivity: 'base' }) === 0)
        selectCounty(matchingProperty?.county ?? null)
      }
      setPropertyQuery(criteria.location ?? '')
    }
    setMinimumBedrooms(criteria.minimumBedrooms)
    setMaximumPrice(criteria.maximumPrice)
    setPropertyType(criteria.propertyType)
    setSpatialToursOnly(criteria.spatialToursOnly)
    setConciergeOpen(false)
    requestAnimationFrame(() => document.getElementById('homes')?.scrollIntoView?.({ block: 'start' }))
  }, [selectCounty, state.properties])

  if (requestedTourPropertyID) {
    return <PropertyTourPage property={state.properties.find((property) => property.id === requestedTourPropertyID)} status={state.status} onRetry={retry} />
  }

  if (requestedPropertyID) {
    return <PropertyDetailPage property={state.properties.find((property) => property.id === requestedPropertyID)} status={state.status} onRetry={retry} />
  }

  return (
    <div className="site-shell">
      <a className="skip-link" href="#explore">Skip to property search</a>
      <SiteHeader onOpenGuide={(anchor) => { setConciergeAnchor(anchor); setConciergeOpen(true) }} guideOpen={conciergeOpen} />
      <main>
      <HomepageHero query={propertyQuery} propertyCount={state.status === 'success' ? state.properties.length : undefined} onQueryChange={setPropertyQuery} onAskOpenHaus={() => setConciergeOpen(true)} />
        <div id="explore" className="map-first" ref={mapEntry}>
          {state.status === 'success' && state.properties.length > 0 && (mapReady ? (
            <>
            {!areaTools && <div className="map-module-loading" role={currentAreaLoad?.failed ? 'alert' : 'status'}>
              {currentAreaLoad?.failed ? <>Local map detail could not load. <button type="button" onClick={() => setAreaAttempt(value => value + 1)}>Retry map detail</button></> : 'Preparing local map detail…'}
            </div>}
            <div hidden={!areaTools}>
            <Suspense fallback={<div className="map-module-loading" role="status">Preparing the property map…</div>}>
            <PropertyMap
              key={requestedMapPropertyID ?? 'property-map'}
              properties={filteredProperties}
              selectedCounty={areaTools ? effectiveSelectedCounty : null}
              selectedArea={effectiveSelectedArea}
              propertyQuery={propertyQuery}
              minimumBedrooms={minimumBedrooms}
              propertyType={propertyType}
              maximumPrice={maximumPrice}
              spatialToursOnly={spatialToursOnly}
              initialSelectedPropertyID={requestedMapPropertyID}
              onPropertyQueryChange={setPropertyQuery}
              onMinimumBedroomsChange={setMinimumBedrooms}
              onPropertyTypeChange={setPropertyType}
              onMaximumPriceChange={setMaximumPrice}
              onSpatialToursOnlyChange={setSpatialToursOnly}
              onCountyChange={selectCounty}
              onAreaChange={selectArea}
            />
            </Suspense>
            </div>
            </>
          ) : <div className="map-module-loading" role="status">The map workspace will load as you approach it.</div>)}
        </div>
        <section className="catalogue" id="homes" aria-label="Homes for sale">
          <div className="catalogue-heading">
            <div><p className="eyebrow">Properties for sale</p><h2>{effectiveSelectedCounty ? `Homes in ${effectiveSelectedCounty}` : 'Recently added homes'}</h2><span className="signature-note" aria-hidden="true">Curated for you</span></div>
            <p className="catalogue-introduction">A live catalogue of homes with location, spatial media and decision context kept together.</p>
            {state.status === 'success' && (
              <div className="catalogue-actions"><button type="button" onClick={() => setSaveSearchOpen(true)}>Save search</button><label>Sort by <select aria-label="Sort properties" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)}><option value="recent">Most recent</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option></select></label><p aria-live="polite">{visibleProperties.length} {visibleProperties.length === 1 ? 'home' : 'homes'}</p></div>
            )}
          </div>
          {state.status === 'loading' && <LoadingState />}
          {state.status === 'error' && <ErrorState onRetry={retry} />}
          {state.status === 'success' && state.properties.length === 0 && (
            <div className="message-panel">
              <p className="message-title">No homes are listed yet.</p>
              <p>New properties will appear here as soon as they are published.</p>
            </div>
          )}
          {state.status === 'success' && state.properties.length > 0 && visibleProperties.length === 0 && (
            <div className="message-panel">
              <p className="message-title">No homes in this area yet.</p>
              <p>Try another local area or return to all homes across Ireland.</p>
              <button type="button" onClick={() => selectCounty(null)}>Show all homes</button>
            </div>
          )}
          {state.status === 'success' && selectedArea && !areaTools && <p role="status">Loading the selected area's homes…</p>}
          {state.status === 'success' && (!selectedArea || areaTools) && visibleProperties.length > 0 && (
            <div className="property-grid">
              {visibleProperties.map((property, index) => (
                <PropertyCard key={property.id} property={property} eagerMedia={index === 0} shortlisted={shortlistedPropertyIDs.includes(property.id)} comparisonFull={shortlistedPropertyIDs.length >= 4} onToggleShortlist={toggleShortlist} />
              ))}
            </div>
          )}
        </section>
        {featuredProperty?.media.some((item) => item.kind === 'panorama') && <ImmersiveServiceFeature property={featuredProperty} />}
        <section className="property-story" id="why-openhaus" aria-labelledby="property-story-title">
          <div className="property-story-copy">
            <p className="eyebrow">Why OpenHaus</p>
            <h2 id="property-story-title">Everything you need before you book a viewing.</h2><span className="signature-note" aria-hidden="true">The complete picture</span>
            <p>Compare the location, layout and complete media story in one place, with no hidden address hunting or disconnected tabs.</p>
            <ul>
              <li><span>01</span><div><strong>Explore the location</strong><p>Move from Ireland to a county and local area without losing context.</p></div></li>
              <li><span>02</span><div><strong>Tour the entire home</strong><p>Browse photography, floor plans and video from the same listing.</p></div></li>
              <li><span>03</span><div><strong>Shortlist with confidence</strong><p>See the price, property facts and setting before arranging a visit.</p></div></li>
            </ul>
          </div>
          <div className="property-story-media">
            {featuredFloorPlan
              ? <img src={featuredFloorPlan.url} alt={featuredFloorPlan.altText} loading="lazy" />
              : <img src="/media/placeholders/sample-floor-plan.png" alt="Illustrative ground-floor plan for a sample home" loading="lazy" />}
            {featuredImage && <img src={featuredImage.url} alt="" loading="lazy" />}
            <span>Complete property context</span>
          </div>
        </section>
      </main>
      {saveSearchOpen && <SaveSearchDialog
        matchingHomes={visibleProperties.length}
        location={effectiveSelectedArea ?? effectiveSelectedCounty ?? 'All Ireland'}
        county={effectiveSelectedCounty ?? ''}
        area={effectiveSelectedArea ?? ''}
        minimumBedrooms={minimumBedrooms}
        propertyType={propertyType}
        maximumPrice={maximumPrice}
        query={propertyQuery}
        spatialOnly={spatialToursOnly}
        onClose={() => setSaveSearchOpen(false)}
      />}
      {shortlistedProperties.length > 0 && <ComparisonTray properties={shortlistedProperties} onCompare={() => setCompareOpen(true)} onRemove={(propertyID) => toggleShortlist(propertyID)} onClear={() => setShortlistedPropertyIDs([])} />}
      {compareOpen && <ComparisonDialog properties={shortlistedProperties} onRemove={(propertyID) => toggleShortlist(propertyID)} onClose={() => setCompareOpen(false)} />}
      {conciergeOpen && <PropertyConcierge anchor={conciergeAnchor} properties={state.properties} onApply={applyConciergeCriteria} onClose={() => setConciergeOpen(false)} />}
      <footer className="site-footer">
        <div><a className="footer-monogram" href="/" aria-label="OpenHaus home"><span>OpenHaus</span><small>/ 01</small></a><span className="footer-signature" aria-hidden="true">Yours, always</span><p>Find home with the full picture.</p></div>
        <nav aria-label="Footer navigation"><a href="#explore">Explore Ireland</a><a href="#homes">Homes for sale</a><a href="/match">Match Lab</a><a href="/areas">Area Index</a><a href="/services">Services</a><a href="/buyers">For buyers</a><a href="/sellers">For sellers</a><a href="/agents">Selling agents</a><a href="/about">About OpenHaus</a><a href="/roadmap">Roadmap</a><a href="/contact">Contact</a><a href="/help">Help</a><a href="/accessibility">Accessibility</a><a href="/terms">Terms</a><a href="/privacy">Privacy information</a></nav>
        <p>Independent portfolio project · Ireland</p>
      </footer>
    </div>
  )
}

function SaveSearchDialog({ matchingHomes, location, county, area, minimumBedrooms, propertyType, maximumPrice, query, spatialOnly, onClose }: { matchingHomes: number; location: string; county: string; area: string; minimumBedrooms: number; propertyType: string; maximumPrice: number; query: string; spatialOnly: boolean; onClose: () => void }) {
  const frequencyRef = useRef<HTMLSelectElement>(null)
  const [frequency, setFrequency] = useState<'instant' | 'daily' | 'weekly'>('daily')
  const [status, setStatus] = useState<'idle' | 'busy' | 'saved' | 'anonymous' | 'error'>('idle')

  useEffect(() => {
    frequencyRef.current?.focus()
  }, [])

  const criteria = [location, minimumBedrooms ? `${minimumBedrooms}+ beds` : 'Any beds', propertyType === 'all' ? 'All property types' : propertyType, maximumPrice ? `Up to ${euros.format(maximumPrice)}` : 'Any price']

  return <Overlay labelID="save-search-title" onClose={onClose}>
    <section className="save-search-dialog">
      <header><div><p className="section-index">Buyer workspace · alert 01</p><h2 id="save-search-title">Save this search</h2></div><button type="button" className="overlay-close" aria-label="Close saved search" onClick={onClose}>×</button></header>
      <div className="save-search-summary"><strong>{matchingHomes} matching {matchingHomes === 1 ? 'home' : 'homes'}</strong><p>We’ll use this decision brief as the basis for future property alerts.</p><ul>{criteria.map((item) => <li key={item}>{item}</li>)}</ul></div>
      <form onSubmit={(event) => { event.preventDefault(); setStatus('busy'); void createClientSavedSearch({ location, county, area, query, minimumBedrooms, propertyType, maximumPrice: maximumPrice ? maximumPrice * 100 : 0, spatialOnly, frequency }).then(() => setStatus('saved')).catch((reason: unknown) => setStatus(reason instanceof Error && reason.message === 'authentication_required' ? 'anonymous' : 'error')) }}>
        <label>Alert frequency<select ref={frequencyRef} value={frequency} onChange={(event) => setFrequency(event.target.value as typeof frequency)} disabled={status === 'busy'}><option value="instant">As soon as a home is added</option><option value="daily">Daily digest</option><option value="weekly">Weekly briefing</option></select></label>
        <button type="submit" disabled={status === 'busy'}>{status === 'busy' ? 'Saving…' : 'Save to my account'} <span aria-hidden="true">→</span></button>
      </form>
      {status === 'saved' && <p className="save-search-confirmation" role="status"><strong>Search saved to your account.</strong> Delivery will begin when property alerts are enabled.</p>}
      {status === 'anonymous' && <p className="save-search-confirmation" role="status"><strong>Sign in to save this search.</strong> <a href="/client/login">Open your buyer account</a>; your current filters will stay on this page.</p>}
      {status === 'error' && <p className="save-search-confirmation" role="alert"><strong>The search could not be saved.</strong> Please try again.</p>}
    </section>
  </Overlay>
}

function Overlay({ labelID, onClose, children }: { labelID: string; onClose: () => void; children: ReactNode }) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])
  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { onCloseRef.current(); return }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const controls = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
      if (controls.length === 0) return
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      previouslyFocused?.focus({ preventScroll: true })
    }
  }, [])
  return <div className="overlay-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={labelID}>{children}</div></div>
}

function GuidePopover({ anchor, labelID, onClose, children }: { anchor: HTMLElement | null; labelID: string; onClose: () => void; children: ReactNode }) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const returnFocus = useRef<HTMLElement | null>(anchor ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null))
  const [position, setPosition] = useState<CSSProperties>({ visibility: 'hidden' })
  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  useLayoutEffect(() => {
    const updatePosition = () => {
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
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [anchor])

  useEffect(() => {
    const focusTarget = returnFocus.current
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { onCloseRef.current(); return }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const controls = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),[tabindex]:not([tabindex="-1"])')]
      if (controls.length === 0) return
      const first = controls[0]
      const last = controls.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      focusTarget?.focus({ preventScroll: true })
    }
  }, [])

  return <div className="guide-popover-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <div ref={dialogRef} className="guide-popover" style={position} role="dialog" aria-modal="true" aria-labelledby={labelID}>{children}</div>
  </div>
}

function PropertyConcierge({ anchor, properties, onApply, onClose }: { anchor: HTMLElement | null; properties: Property[]; onApply: (criteria: ConciergeCriteria) => void; onClose: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState('')
  const [submittedMessage, setSubmittedMessage] = useState('')
  const [reply, setReply] = useState<ConciergeReply | null>(null)
  const suggestions = ['Homes in Cork under €800k', '4 bedroom homes', 'Detached homes with a 360 tour']

  useEffect(() => {
    const focusTask = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(focusTask)
  }, [])

  const ask = (brief: string) => {
    const submittedBrief = brief.trim()
    if (!submittedBrief) return
    setSubmittedMessage(submittedBrief)
    setMessage('')
    setReply(createConciergeReply(submittedBrief, properties))
  }

  return <GuidePopover anchor={anchor} labelID="concierge-title" onClose={onClose}>
    <section className="property-concierge" id="openhaus-guide-dialog">
      <header>
        <div><p className="section-index">Property intelligence · catalogue 01</p><h2 id="concierge-title">OpenHaus guide</h2><p className="concierge-availability"><span aria-hidden="true" />Catalogue ready · {properties.length} {properties.length === 1 ? 'home' : 'homes'} indexed</p></div>
        <button type="button" className="overlay-close" aria-label="Close OpenHaus guide" onClick={onClose}>×</button>
      </header>
      <div className="concierge-introduction">
        <p>Describe the home you want in one sentence. I’ll translate it into precise catalogue filters and show only real OpenHaus listings.</p>
        <div className="concierge-suggestions" aria-label="Suggested searches">
          {suggestions.map((suggestion) => <button type="button" key={suggestion} onClick={() => ask(suggestion)}>{suggestion}</button>)}
        </div>
      </div>
      <form onSubmit={(event) => { event.preventDefault(); ask(message) }}>
        <label htmlFor="concierge-message">What are you looking for?</label>
        <div><input ref={inputRef} id="concierge-message" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="For example: 3 bedrooms under €800k in Cork" autoComplete="off" /><button type="submit" disabled={!message.trim()}>Find matching homes</button></div>
      </form>
      {reply && <div className="concierge-thread" aria-live="polite">
        <div className="concierge-message is-user"><span>You</span><p>{submittedMessage}</p></div>
        <div className="concierge-message is-guide"><span>OpenHaus</span><div className="concierge-reply">
          <p>{reply.summary}</p>
          {reply.matches.length > 0 && <ul>{reply.matches.slice(0, 3).map((property) => <li key={property.id}><a href={`/properties/${property.id}`}><span>{property.city} · {property.bedrooms} bedrooms</span><strong>{property.title}</strong><small>{euros.format(property.priceCents / 100)}</small></a></li>)}</ul>}
          {reply.canApply && <button type="button" className="concierge-apply" onClick={() => onApply(reply.criteria)}>Apply to catalogue <span aria-hidden="true">→</span></button>}
        </div></div>
      </div>}
      <footer><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 3.5 7.5v5c0 4.8 3.1 7.5 8.5 8.5 5.4-1 8.5-3.7 8.5-8.5v-5L12 3Z"/><path d="m8.5 12 2.2 2.2 4.8-5"/></svg><p><strong>Private by default.</strong> Searches stay in this browser and use the current catalogue only. No personal or financial advice.</p></footer>
    </section>
  </GuidePopover>
}

function ComparisonTray({ properties, onCompare, onRemove, onClear }: { properties: Property[]; onCompare: () => void; onRemove: (propertyID: string) => void; onClear: () => void }) {
  return <aside className="comparison-tray" role="region" aria-label="Property comparison">
    <div><span>Buyer workspace</span><strong>{properties.length} {properties.length === 1 ? 'home selected' : 'homes selected'}</strong></div>
    <ul>{properties.map((property) => <li key={property.id}><span>{property.title}</span><button type="button" aria-label={`Remove ${property.title} from comparison`} onClick={() => onRemove(property.id)}>×</button></li>)}</ul>
    <div className="comparison-tray-actions"><button type="button" onClick={onClear}>Clear</button><button type="button" disabled={properties.length < 2} onClick={onCompare}>Compare homes</button></div>
  </aside>
}

function ComparisonDialog({ properties, onRemove, onClose }: { properties: Property[]; onRemove: (propertyID: string) => void; onClose: () => void }) {
  return <Overlay labelID="comparison-title" onClose={onClose}>
    <section className="comparison-dialog">
      <header><div><p className="section-index">Buyer workspace · comparison</p><h2 id="comparison-title">Compare selected homes</h2></div><button type="button" className="overlay-close" aria-label="Close comparison" onClick={onClose}>×</button></header>
      <div className="comparison-grid">{properties.map((property) => {
        const image = property.media.find((item) => item.kind === 'image')
        return <article key={property.id}><div className="comparison-image">{image ? <img src={image.url} alt="" /> : <img src="/media/placeholders/architectural-home.svg?v=3" alt="" />}<button type="button" aria-label={`Remove ${property.title} from comparison`} onClick={() => onRemove(property.id)}>×</button></div><p>{property.city} · Co. {property.county}</p><h3>{property.title}</h3><dl><div><dt>Asking price</dt><dd>{euros.format(property.priceCents / 100)}</dd></div><div><dt>Bedrooms</dt><dd>{property.bedrooms}</dd></div><div><dt>Home</dt><dd>{titleCase(property.propertyType)}</dd></div><div><dt>Media</dt><dd>{property.media.length} items</dd></div></dl><a href={`/properties/${property.id}`}>View property <span aria-hidden="true">→</span></a></article>
      })}</div>
    </section>
  </Overlay>
}

const PropertyCard = memo(function PropertyCard({ property, eagerMedia = false, shortlisted = false, comparisonFull = false, onToggleShortlist }: { property: Property; eagerMedia?: boolean; shortlisted?: boolean; comparisonFull?: boolean; onToggleShortlist?: (propertyID: string) => void }) {
  const listingCode = `OH-${property.county.slice(0, 3).toUpperCase()}-${property.id.slice(0, 4).toUpperCase()}`
  const sellingAgent = findSellingAgent(property.county)
  return (
    <article className="property-card" id={`property-${property.id}`}>
      <PropertyGallery property={property} eager={eagerMedia} />
      <div className="property-body">
        <div className="property-card-status"><span>{listingCode}</span><strong><i aria-hidden="true" />Live listing</strong></div>
        <div className="property-card-topline">
          <div className="property-location"><span>{property.city}</span><span aria-hidden="true">/</span><span>Co. {property.county}</span></div>
        </div>
        <h3>{property.title}</h3>
        <p className="address">{property.addressLine1}</p>
        <strong className="property-price">{euros.format(property.priceCents / 100)}</strong>
        <div className="property-card-actions">{property.media.some((item) => item.kind === 'panorama') && <a className="spatial-card-badge" href={`/properties/${property.id}/tour`}>Spatial tour</a>}<button type="button" aria-pressed={shortlisted} aria-label={`${shortlisted ? 'Remove' : 'Add'} ${property.title} ${shortlisted ? 'from' : 'to'} comparison`} disabled={!shortlisted && comparisonFull} onClick={() => onToggleShortlist?.(property.id)}><span aria-hidden="true">{shortlisted ? '✓' : '+'}</span>{shortlisted ? 'Selected' : comparisonFull ? 'Tray full' : 'Compare'}</button></div>
        <div className="property-details">
          <span data-label="Space">{property.bedrooms} bedrooms</span>
          <span data-label="Type">{titleCase(property.propertyType)}</span>
          <span data-label="Coverage">{property.media.length} media items</span>
          <a href={`/properties/${property.id}`} aria-label={`View details for ${property.title}`}>View home <span aria-hidden="true">→</span></a>
        </div>
        <a className="property-agent-link" href={`/agents/${sellingAgent.slug}`}>Represented by {sellingAgent.name} <span aria-hidden="true">→</span></a>
      </div>
    </article>
  )
})

export function PropertyDetailPage({ property, status, onRetry }: { property?: Property; status: CatalogueState['status']; onRetry: () => void }) {
  const [viewingOpen, setViewingOpen] = useState(false)
  const chapterIDs = useMemo(() => property?.media.some(item => item.kind === 'panorama' && item.url.startsWith('https://')) ? ['overview', 'tour', 'intelligence'] : ['overview', 'intelligence'], [property])
  const [activeChapter, setActiveChapter] = useState(() => chapterIDs.includes(window.location.hash.slice(1)) ? window.location.hash.slice(1) : 'overview')
  const requestedChapter = useRef<string | null>(null)

  function selectChapter(event: ReactMouseEvent<HTMLAnchorElement>, chapter: string) {
    event.preventDefault()
    requestedChapter.current = chapter
    setActiveChapter(chapter)
    window.history.pushState({}, '', `#${chapter}`)
    document.getElementById(chapter)?.scrollIntoView?.({
      behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    })
  }

  useEffect(() => {
    const restoreChapter = () => {
      const chapter = window.location.hash.slice(1)
      requestedChapter.current = null
      setActiveChapter(chapterIDs.includes(chapter) ? chapter : 'overview')
    }
    const releaseRequestedChapter = () => { requestedChapter.current = null }
    const releaseRequestedChapterFromKey = (event: KeyboardEvent) => {
      if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)) releaseRequestedChapter()
    }
    restoreChapter()
    window.addEventListener('hashchange', restoreChapter)
    window.addEventListener('popstate', restoreChapter)
    window.addEventListener('scrollend', releaseRequestedChapter)
    window.addEventListener('wheel', releaseRequestedChapter, { passive: true })
    window.addEventListener('touchstart', releaseRequestedChapter, { passive: true })
    window.addEventListener('keydown', releaseRequestedChapterFromKey)

    if (typeof IntersectionObserver === 'undefined') {
      return () => {
        window.removeEventListener('hashchange', restoreChapter)
        window.removeEventListener('popstate', restoreChapter)
        window.removeEventListener('scrollend', releaseRequestedChapter)
        window.removeEventListener('wheel', releaseRequestedChapter)
        window.removeEventListener('touchstart', releaseRequestedChapter)
        window.removeEventListener('keydown', releaseRequestedChapterFromKey)
      }
    }

    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter(entry => entry.isIntersecting)
      if (visible.length === 0) return
      if (requestedChapter.current) {
        const requested = visible.find(entry => entry.target.id === requestedChapter.current)
        if (!requested) return
        setActiveChapter(requested.target.id)
        return
      }
      visible.sort((a, b) => Math.abs(a.boundingClientRect.top) - Math.abs(b.boundingClientRect.top))
      setActiveChapter(visible[0].target.id)
    }, { rootMargin: `-${(Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--public-header-height')) || 82) + 76}px 0px -58%`, threshold: [0, 0.1] })

    chapterIDs.forEach((id) => {
      const section = document.getElementById(id)
      if (section) observer.observe(section)
    })
    return () => {
      observer.disconnect()
      window.removeEventListener('hashchange', restoreChapter)
      window.removeEventListener('popstate', restoreChapter)
      window.removeEventListener('scrollend', releaseRequestedChapter)
      window.removeEventListener('wheel', releaseRequestedChapter)
      window.removeEventListener('touchstart', releaseRequestedChapter)
      window.removeEventListener('keydown', releaseRequestedChapterFromKey)
    }
  }, [chapterIDs])

  return (
    <div className="site-shell">
      <a className="skip-link" href="#property-detail">Skip to property details</a>
      <SiteHeader />
      <main id="property-detail" className="property-page" aria-label="Property details">
        {status === 'loading' && <LoadingState />}
        {status === 'error' && <ErrorState onRetry={onRetry} />}
        {status === 'success' && !property && <div className="property-page-message"><p className="eyebrow">Property unavailable</p><h1>This home could not be found.</h1><a href="/">Return to property search</a></div>}
        {status === 'success' && property && <>
          <div className="property-page-nav"><a href="/" aria-label="Back to property search"><span aria-hidden="true">←</span> Back to property search</a><span>{property.city} · Co. {property.county}</span></div>
          <nav className="property-chapters" aria-label="Property sections">
            <a href="#overview" aria-current={activeChapter === 'overview' ? 'location' : undefined} onClick={(event) => selectChapter(event, 'overview')}>Overview & media</a>
            {property.media.some(item => item.kind === 'panorama' && item.url.startsWith('https://')) && <a href="#tour" aria-current={activeChapter === 'tour' ? 'location' : undefined} onClick={(event) => selectChapter(event, 'tour')}>360° tour</a>}
            <a href="#intelligence" aria-current={activeChapter === 'intelligence' ? 'location' : undefined} onClick={(event) => selectChapter(event, 'intelligence')}>Property insights</a>
            <a href={`/?county=${encodeURIComponent(property.county)}&property=${encodeURIComponent(property.id)}#explore`}>Show on map</a>
            <button type="button" onClick={() => setViewingOpen(true)}>Request viewing</button>
          </nav>
          <article className="property-page-layout" id="overview">
            <div className="property-page-hero" id="media"><PropertyGallery property={property} eager /></div>
            <div className="property-page-summary">
              <div className="property-page-identity"><p className="eyebrow">{isShowcaseProperty(property.id) ? 'Fictional showcase · not for sale' : 'Property for sale'}</p><h1>{property.title}</h1><p className="property-page-address">{property.addressLine1}, Co. {property.county}</p></div>
              <strong className="property-page-price"><span>Asking price</span>{euros.format(property.priceCents / 100)}</strong>
              <ClientPropertySaveAction property={property} />
              {property.media.some(item => item.kind === 'panorama' && item.url.startsWith('https://')) && <a className="property-summary-tour" href={`/properties/${property.id}/tour`}>Open full-window 360° tour <span aria-hidden="true">↗</span></a>}
              <dl><div><dt>Home</dt><dd>{titleCase(property.propertyType)}</dd></div><div><dt>Bedrooms</dt><dd>{property.bedrooms}</dd></div><div><dt>Property media</dt><dd>{property.media.length} items</dd></div></dl>
              <SellingAgentCard property={property} onRequestViewing={() => setViewingOpen(true)} />
            </div>
          </article>
          <PropertySpatialTour property={property} />
          <PropertyDecisionPanel property={property} />
          {viewingOpen && <ViewingRequestDialog property={property} onClose={() => setViewingOpen(false)} />}
        </>}
      </main>
    </div>
  )
}

function SellingAgentCard({ property, onRequestViewing }: { property: Property; onRequestViewing: () => void }) {
  const agent = findSellingAgent(property.county)
  return <aside className="property-contact-card selling-agent-card" aria-label="Selling agent">
    <div className="selling-agent-heading"><span className="selling-agent-monogram" aria-hidden="true">{agent.initials}</span><div><p className="eyebrow">Selling agent</p><h2>{agent.name}</h2><p>{agent.role} · {agent.agency}</p></div></div>
    <p className="selling-agent-disclosure"><i aria-hidden="true" />Demonstration profile</p>
    <p>{agent.summary}</p>
    <div className="selling-agent-actions"><a href={`/agents/${agent.slug}`} aria-label={`View ${agent.name}’s profile`}>View profile <span aria-hidden="true">→</span></a><button className="viewing-link" type="button" onClick={onRequestViewing}>Arrange a viewing <span aria-hidden="true">→</span></button></div>
  </aside>
}

function ClientPropertySaveAction({ property }: { property: Property }) {
  const [state, setState] = useState<'loading' | 'anonymous' | 'ready' | 'unavailable'>('loading')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const response = await fetch('/api/v1/client/session', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal })
        if (controller.signal.aborted) return
        if (response.status === 401 || response.status === 404) { setState('anonymous'); return }
        if (!response.ok) { setState('unavailable'); return }
        const properties = await fetchClientSavedProperties(controller.signal)
        if (!controller.signal.aborted) { setSaved(properties.some(item => item.id === property.id)); setState('ready') }
      } catch { if (!controller.signal.aborted) setState('unavailable') }
    }
    void load()
    return () => controller.abort()
  }, [property.id])

  async function toggle() {
    if (busy) return
    setBusy(true); setFeedback('')
    try {
      if (saved) await removeClientSavedProperty(property.id)
      else await saveClientProperty(property.id)
      setSaved(current => !current)
      setFeedback(saved ? 'Removed from your account.' : 'Saved to your account.')
    } catch { setFeedback('We could not update this saved home. Please try again.') }
    finally { setBusy(false) }
  }

  if (state === 'anonymous') return <div className="property-save-action"><a href="/client/login">Sign in to save this home</a></div>
  if (state !== 'ready') return null
  return <div className="property-save-action">
    <button type="button" aria-pressed={saved} aria-label={`${saved ? 'Remove' : 'Save'} ${property.title}`} disabled={busy} onClick={() => void toggle()}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4.75h12v15l-6-3.8-6 3.8v-15Z" /></svg>
      {busy ? 'Updating…' : saved ? 'Saved to account' : 'Save this home'}
    </button>
    {feedback && <span role={feedback.startsWith('We could not') ? 'alert' : 'status'}>{feedback}</span>}
  </div>
}

function ImmersiveServiceFeature({ property }: { property: Property }) {
  const poster = property.media.find((item) => item.kind === 'image')
  return <section className="immersive-service-feature" aria-label="Immersive property viewing">
    <div className="immersive-service-visual">
      {poster && <img src={poster.url} alt="" loading="lazy" />}
      <span className="immersive-orbit" aria-hidden="true"><i>360°</i></span>
    </div>
    <div className="immersive-service-copy">
      <p className="section-index">OpenHaus spatial viewing · service 02</p>
      <h2>Step inside before you travel.</h2>
      <p>Move through participating homes room by room, in a full-window tour linked directly to the listing, plans and viewing request.</p>
      <dl><div><dt>Context</dt><dd>Kept with the property</dd></div><div><dt>Viewing</dt><dd>Desktop, mobile and headset</dd></div></dl>
      <a href={`/properties/${property.id}/tour`} aria-label={`Open the 360° tour for ${property.title}`}>Experience a 360° viewing <span aria-hidden="true">→</span></a>
    </div>
  </section>
}

function PropertyTourPage({ property, status, onRetry }: { property?: Property; status: CatalogueState['status']; onRetry: () => void }) {
  const panorama = property?.media.find((item) => item.kind === 'panorama')
  const tourURL = panorama?.url.startsWith('https://') ? panorama.url : undefined
  const poster = property?.media.find((item) => item.kind === 'image')?.url
  const tourStageRef = useRef<HTMLElement>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [fullscreenError, setFullscreenError] = useState(false)
  const [viewingOpen, setViewingOpen] = useState(false)

  useEffect(() => {
    const updateFullscreen = () => setFullscreen(document.fullscreenElement === tourStageRef.current)
    document.addEventListener('fullscreenchange', updateFullscreen)
    return () => document.removeEventListener('fullscreenchange', updateFullscreen)
  }, [])

  const toggleFullscreen = async () => {
    setFullscreenError(false)
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else if (tourStageRef.current?.requestFullscreen) await tourStageRef.current.requestFullscreen()
      else setFullscreenError(true)
    } catch { setFullscreenError(true) }
  }

  return <div className="site-shell tour-site-shell">
    <a className="skip-link" href="#full-property-tour">Skip to 360° tour</a>
    <SiteHeader />
    <main id="full-property-tour" className="property-tour-page" aria-label={property ? `${property.title} 360° tour` : 'Property 360° tour'}>
      {status === 'loading' && <LoadingState />}
      {status === 'error' && <ErrorState onRetry={onRetry} />}
      {status === 'success' && !property && <div className="property-tour-message"><p className="eyebrow">Tour unavailable</p><h1>This home could not be found.</h1><a href="/">Return to property search</a></div>}
      {status === 'success' && property && <>
        <header className="property-tour-header">
          <a href={`/properties/${property.id}`} aria-label={`Back to ${property.title}`}><span aria-hidden="true">←</span> Back to property</a>
          <div><p className="section-index">Immersive viewing · 360°</p><h1>{property.title}</h1><p>{property.city} · Co. {property.county}</p></div>
          <a className="property-tour-details-link" href={`/properties/${property.id}`} aria-label="View property details">Property details <span aria-hidden="true">→</span></a>
        </header>
        <section className="property-tour-stage" aria-label="Interactive panorama" ref={tourStageRef}>
          <aside className="property-tour-tools" aria-label="Tour workspace controls">
            <div className="property-tour-brief">
              <p className="section-index">Digital viewing room · live</p>
              <h2>Explore at your pace.</h2>
              <p>Move through the home room by room, then return to the listing whenever you are ready.</p>
            </div>
            <dl className="property-tour-facts">
              <div><dt>Home</dt><dd>{titleCase(property.propertyType)}</dd></div>
              <div><dt>Bedrooms</dt><dd>{property.bedrooms}</dd></div>
              <div><dt>Asking price</dt><dd>{euros.format(property.priceCents / 100)}</dd></div>
            </dl>
            <div className="property-tour-actions">
              <a href={`/?county=${encodeURIComponent(property.county)}&property=${encodeURIComponent(property.id)}#explore`}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z"/><circle cx="12" cy="10" r="2"/></svg><span>View location on map</span><b aria-hidden="true">↗</b></a>
              <button type="button" aria-pressed={fullscreen} aria-label={fullscreen ? 'Exit browser fullscreen' : 'Open tour in browser fullscreen'} onClick={toggleFullscreen}>
                <svg viewBox="0 0 24 24" aria-hidden="true">{fullscreen ? <path d="M9 4v5H4m16 0h-5V4M4 15h5v5m6 0v-5h5" /> : <path d="M9 4H4v5m16 0V4h-5M4 15v5h5m6 0h5v-5" />}</svg>
                <span>{fullscreen ? 'Exit full screen' : 'Full screen'}</span><b aria-hidden="true">↗</b>
              </button>
              <button className="property-tour-viewing-action" type="button" onClick={() => setViewingOpen(true)}><span>Arrange a viewing</span><b aria-hidden="true">→</b></button>
            </div>
            <footer><i aria-hidden="true" /><span>Secure provider connection</span></footer>
          </aside>
          <div className="property-tour-canvas">
            {fullscreenError && <p className="property-tour-fullscreen-error" role="status">Browser fullscreen is unavailable. Use the fullscreen control inside the tour instead.</p>}
            {tourURL
              ? <Suspense fallback={<div className="property-tour-loading" role="status">Preparing the 360° tour…</div>}><SpatialMediaViewer source={{ provider: 'embed', embedUrl: tourURL, title: `${property.title} 360° tour`, posterUrl: poster }} /></Suspense>
              : <div className="property-tour-unavailable"><span>360°</span><strong>Tour coming soon</strong><p>The listing team is preparing the immersive walkthrough.</p><a href={`/properties/${property.id}`}>View photography and plans</a></div>}
          </div>
        </section>
        {viewingOpen && <ViewingRequestDialog property={property} onClose={() => setViewingOpen(false)} />}
      </>}
    </main>
  </div>
}

function PropertySpatialTour({ property }: { property: Property }) {
  if (isShowcaseProperty(property.id)) return <section className="property-spatial-tour" id="tour" aria-labelledby="property-tour-title"><header><p className="section-index">Fictional media study</p><h2 id="property-tour-title">Concept imagery, clearly labelled.</h2><p>These independently generated interior and exterior images illustrate a design idea, not a verified property layout. The gallery video is a still-image sequence, not recorded footage. No 360° tour or measured floor plan is available for this fictional home.</p><a href="/media-lab">Inspect the media algorithms →</a></header></section>
  const panorama = property.media.find((item) => item.kind === 'panorama')
  const tourURL = panorama?.url.startsWith('https://') ? panorama.url : undefined
  const poster = property.media.find((item) => item.kind === 'image')?.url
  return <section className="property-spatial-tour" id="tour" aria-labelledby="property-tour-title">
    <header><p className="section-index">Immersive viewing · 360°</p><h2 id="property-tour-title">Walk through every room.</h2><p>Explore the layout at your own pace, then return to the measured plans, property facts and viewing notes without leaving this home.</p></header>
    {tourURL
      ? <Suspense fallback={<div className="property-tour-loading" role="status">Preparing the 360° tour…</div>}><SpatialMediaViewer source={{ provider: 'embed', embedUrl: tourURL, title: `${property.title} 360° tour`, posterUrl: poster }} /></Suspense>
      : <div className="property-tour-unavailable"><span>360°</span><strong>Tour coming soon</strong><p>The listing team is preparing the immersive walkthrough. Photography and plans remain available above.</p></div>}
    {tourURL && <a className="property-tour-full-link" href={`/properties/${property.id}/tour`}>Open full 360° tour <span aria-hidden="true">↗</span></a>}
    <footer><span>Hosted securely by the tour provider</span><span>Fullscreen and motion viewing supported</span><span>Third-party content loads only with permission</span></footer>
  </section>
}

function ViewingRequestDialog({ property, onClose }: { property: Property; onClose: () => void }) {
  const nameRef = useRef<HTMLInputElement>(null)
  const [confirmed, setConfirmed] = useState(false)
  useEffect(() => { nameRef.current?.focus() }, [])

  const slots = ['Thursday · 17:30', 'Saturday · 11:00', 'Saturday · 14:30']
  return <Overlay labelID="viewing-request-title" onClose={onClose}>
    <section className="viewing-request-dialog">
      <header><div><p className="section-index">Private viewing · request</p><h2 id="viewing-request-title">Request a viewing for {property.title}</h2><p>{property.addressLine1}, {property.city}</p></div><button type="button" className="overlay-close" aria-label="Close viewing request" onClick={onClose}>×</button></header>
      {!confirmed ? <form onSubmit={(event) => { event.preventDefault(); setConfirmed(true) }}>
        <fieldset><legend>Preferred sample time</legend><div className="viewing-slots">{slots.map((slot, index) => <label key={slot}><input type="radio" name="viewing-slot" value={slot} defaultChecked={index === 0} /><span>{slot}</span></label>)}</div></fieldset>
        <div className="viewing-contact-fields"><label>Your name<input ref={nameRef} required autoComplete="name" /></label><label>Email address<input type="email" required autoComplete="email" /></label><label>Phone number <small>Optional</small><input type="tel" autoComplete="tel" /></label></div>
        <label>Questions for the listing team <small>Optional</small><textarea rows={4} placeholder="Access needs, room questions or another suitable time…" /></label>
        <p className="viewing-disclaimer">This demonstration records no personal information. Live availability and secure delivery will connect to the staff workspace.</p>
        <button className="viewing-submit" type="submit">Send viewing request <span aria-hidden="true">→</span></button>
      </form> : <div className="viewing-confirmation" role="status"><span aria-hidden="true">✓</span><p className="section-index">Request prepared</p><h3>Your sample viewing request is ready.</h3><p>In the production workflow, the listing team would confirm the time and keep the conversation attached to this property.</p><button type="button" onClick={onClose}>Return to the property</button></div>}
    </section>
  </Overlay>
}

function PropertyDecisionPanel({ property }: { property: Property }) {
  const askingPrice = property.priceCents / 100
  const deposit = askingPrice * .1
  const monthly = ((askingPrice - deposit) * .0047).toFixed(0)
  const storageKey = `openhaus:property-notes:${property.id}`
  const [notesOpen, setNotesOpen] = useState(false)
  const [notesError, setNotesError] = useState('')
  const [notesBusy, setNotesBusy] = useState(false)
  const [notesMode, setNotesMode] = useState<'checking' | 'account' | 'browser' | 'unavailable'>('checking')
  const [notesSource, setNotesSource] = useState<'browser' | 'account'>('browser')
  const [buyerNotes, setBuyerNotes] = useState<{ notes: string; questions: string[] }>(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey) ?? 'null')
      return { notes: typeof saved?.notes === 'string' ? saved.notes : '', questions: Array.isArray(saved?.questions) ? saved.questions.filter((question: unknown): question is string => typeof question === 'string') : [] }
    }
    catch { return { notes: '', questions: [] } }
  })
  useEffect(() => {
    const controller = new AbortController()
    fetchClientPropertyNote(property.id, controller.signal)
      .then(note => {
        if (controller.signal.aborted) return
        const accountHasNotes = note.notes.trim().length > 0 || note.questions.length > 0
        if (accountHasNotes) {
          setBuyerNotes({ notes: note.notes, questions: note.questions })
          setNotesSource('account')
        }
        setNotesMode('account')
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setNotesMode(error instanceof Error && error.message === 'authentication_required' ? 'browser' : 'unavailable')
      })
    return () => controller.abort()
  }, [property.id])
  const hasNotes = buyerNotes.notes.trim().length > 0 || buyerNotes.questions.length > 0
  const saveNotes = async (next: { notes: string; questions: string[] }) => {
    if (notesBusy || notesMode === 'checking') return
    setNotesBusy(true)
    if (notesMode === 'account') {
      try {
        const saved = await saveClientPropertyNote(property.id, next)
        try { window.localStorage.removeItem(storageKey) } catch { /* Account storage succeeded; stale browser cleanup is best effort. */ }
        setBuyerNotes({ notes: saved.notes, questions: saved.questions })
        setNotesSource('account')
        setNotesError('')
        setNotesOpen(false)
      } catch {
        setNotesError('Your account notes could not be saved. Keep this window open and try again.')
      } finally { setNotesBusy(false) }
      return
    }
    try { window.localStorage.setItem(storageKey, JSON.stringify(next)) }
    catch { setNotesError('Your notes could not be saved in this browser. Keep this window open, copy your notes, or enable browser storage and try again.'); setNotesBusy(false); return }
    setNotesError('')
    setBuyerNotes(next)
    setNotesOpen(false)
    setNotesBusy(false)
  }
  return <section className="property-decision-panel" id="intelligence" aria-labelledby="decision-title">
    <header><p className="section-index">Property intelligence</p><h2 id="decision-title">Understand the commitment.</h2><p>Illustrative figures help organise questions before professional financial, legal and survey advice.</p></header>
    <dl><div><dt>10% deposit</dt><dd>{euros.format(deposit)}</dd><small>Illustrative only</small></div><div><dt>Monthly estimate</dt><dd>{euros.format(Number(monthly))}</dd><small>Sample repayment</small></div><div><dt>Energy profile</dt><dd>B2</dd><small>Example BER</small></div><div><dt>Media coverage</dt><dd>{property.media.length}</dd><small>Available items</small></div></dl>
    <div className="decision-context" id="location"><div><span>Area context</span><strong>{property.city}, Co. {property.county}</strong><p>Transport, schools, broadband, planning and comparable sales can connect here as verified providers are added.</p></div><div id="viewing"><span>Buyer workspace</span><strong>Build your viewing file</strong><p>{hasNotes ? (notesMode === 'account' && notesSource === 'account' ? 'Notes synced to your account' : notesMode === 'account' ? 'Browser notes ready to save to your account' : 'Notes saved locally') : notesMode === 'checking' ? 'Checking your private notes…' : 'Keep private observations and questions attached to this property.'}</p><button type="button" onClick={() => setNotesOpen(true)}>{hasNotes ? 'Edit property notes' : 'Add property notes'} <span aria-hidden="true">→</span></button></div></div>
    {notesOpen && <PropertyNotesDialog property={property} value={buyerNotes} error={notesError} busy={notesBusy} mode={notesMode} onSave={saveNotes} onClose={() => { if (!notesBusy) { setNotesOpen(false); setNotesError('') } }} />}
  </section>
}

function PropertyNotesDialog({ property, value, error, busy, mode, onSave, onClose }: { property: Property; value: { notes: string; questions: string[] }; error?: string; busy: boolean; mode: 'checking' | 'account' | 'browser' | 'unavailable'; onSave: (value: { notes: string; questions: string[] }) => Promise<void>; onClose: () => void }) {
  const notesRef = useRef<HTMLTextAreaElement>(null)
  const [notes, setNotes] = useState(value.notes)
  const [questions, setQuestions] = useState(value.questions)
  const prompts = ['Ask about recent renovations', 'Confirm fixtures and fittings', 'Check broadband availability', 'Review management or service fees']
  useEffect(() => { notesRef.current?.focus() }, [])
  const toggleQuestion = (question: string) => setQuestions((current) => current.includes(question) ? current.filter((item) => item !== question) : [...current, question])

  return <Overlay labelID="property-notes-title" onClose={onClose}>
    <section className="property-notes-dialog">
      <header><div><p className="section-index">Buyer workspace · private</p><h2 id="property-notes-title">Notes for {property.title}</h2><p>{property.addressLine1}, {property.city}</p></div><button type="button" className="overlay-close" aria-label="Close property notes" onClick={onClose}>×</button></header>
      <form onSubmit={(event) => { event.preventDefault(); onSave({ notes, questions }) }}>
        <label>Private notes<textarea ref={notesRef} rows={6} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="What should you remember at the viewing?" /></label>
        <fieldset><legend>Questions for the viewing</legend><div className="property-question-list">{prompts.map((prompt) => <label key={prompt}><input type="checkbox" checked={questions.includes(prompt)} onChange={() => toggleQuestion(prompt)} /><span>{prompt}</span></label>)}</div></fieldset>
        <p>{mode === 'account' ? 'Private to your signed-in buyer account.' : mode === 'unavailable' ? 'Account sync is temporarily unavailable. This copy will stay only in this browser.' : 'Stored only in this browser. You do not need to sign in to save these notes.'}</p>
        {error && <p role="alert">{error}</p>}
        <div><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" disabled={busy || mode === 'checking'}>{busy ? 'Saving…' : mode === 'checking' ? 'Checking account…' : 'Save property notes'}</button></div>
      </form>
      {mode !== 'account' && <ClientSignInPrompt />}
    </section>
  </Overlay>
}

function PropertyGallery({ property, eager = false }: { property: Property; eager?: boolean }) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const thumbnailRail = useRef<HTMLDivElement>(null)
  const galleryMedia = useMemo(() => {
    const galleryItems = property.media.filter((item) => item.kind !== 'panorama')
    const media = galleryItems.length > 0
      ? [...galleryItems].sort((left, right) => left.position - right.position)
      : [{ url: '/media/placeholders/architectural-home.svg?v=3', kind: 'image' as const, altText: `Architectural study for ${property.title}`, position: 0 }]
    if (!media.some((item) => item.kind === 'floor_plan')) {
      media.push({ url: '/media/placeholders/sample-floor-plan.png', kind: 'floor_plan', altText: `Illustrative floor plan for ${property.title}`, position: media.length })
    }
    return media
  }, [property.media, property.title])
  const selected = galleryMedia[selectedIndex]
  const poster = galleryMedia.find((item) => item.kind === 'image')?.url
  const showPrevious = () => setSelectedIndex((index) => (index - 1 + galleryMedia.length) % galleryMedia.length)
  const showNext = () => setSelectedIndex((index) => (index + 1) % galleryMedia.length)

  useEffect(() => {
    if (!thumbnailRail.current) return
    const thumbnail = thumbnailRail.current.children.item(selectedIndex) as HTMLElement | null
    if (!thumbnail) return
    thumbnailRail.current.scrollLeft = Math.max(0, thumbnail.offsetLeft - (thumbnailRail.current.clientWidth - thumbnail.offsetWidth) / 2)
  }, [selectedIndex])

  if (!selected) {
    return (
      <div className="property-visual property-fallback">
        <img src="/media/placeholders/sample-floor-plan.png" alt="Illustrative sample floor plan; property photography coming soon" loading="lazy" />
        <span>Illustrative plan</span>
      </div>
    )
  }

  return (
    <div className="property-gallery">
      <div className={`gallery-stage ${selected.kind === 'floor_plan' ? 'gallery-stage-plan' : ''}`}>
        {selected.kind === 'video' ? (
          <video
            key={selected.url}
            className="gallery-image"
            controls
            preload="metadata"
            poster={poster}
            aria-label={selected.altText}
          >
            <source src={selected.url} type="video/mp4" />
            Your browser does not support embedded video.
          </video>
        ) : (
          <img
            key={selected.url}
            className="gallery-image"
            src={selected.url}
            alt={selected.altText}
            loading={eager && selectedIndex === 0 ? 'eager' : 'lazy'}
            fetchPriority={eager && selectedIndex === 0 ? 'high' : 'auto'}
          />
        )}
        <p className="gallery-count" aria-live="polite">
          {selectedIndex + 1} / {galleryMedia.length}
        </p>
        <p className="gallery-kind">{mediaLabel(selected.kind)}</p>
        {galleryMedia.length > 1 && <div className="gallery-navigation" aria-label="Property photographs">
          <button type="button" aria-label="Previous image" onClick={showPrevious}><svg viewBox="0 0 18 52" aria-hidden="true"><path d="M14 4 4 26l10 22"/></svg></button>
          <button type="button" aria-label="Next image" onClick={showNext}><svg viewBox="0 0 18 52" aria-hidden="true"><path d="m4 4 10 22L4 48"/></svg></button>
        </div>}
      </div>

      {galleryMedia.length > 1 && <div className="gallery-filmstrip" aria-label={`Media for ${property.title}`}>
        <button className="gallery-strip-button is-previous" type="button" aria-label="Earlier media thumbnails" onClick={showPrevious}><svg viewBox="0 0 18 52" aria-hidden="true"><path d="M14 4 4 26l10 22"/></svg></button>
        <div className="gallery-thumbnails" ref={thumbnailRail}>
          {galleryMedia.map((item, index) => (
            <button
              key={item.url}
              className="gallery-thumbnail"
              type="button"
              aria-label={`View ${item.altText}`}
              aria-pressed={index === selectedIndex}
              onClick={() => setSelectedIndex(index)}
            >
              <img src={item.kind === 'video' ? poster : item.url} alt="" loading="lazy" />
              {item.kind === 'floor_plan' && <span>Plan</span>}
              {item.kind === 'video' && <span>Video</span>}
            </button>
          ))}
        </div>
        <button className="gallery-strip-button is-next" type="button" aria-label="Later media thumbnails" onClick={showNext}><svg viewBox="0 0 18 52" aria-hidden="true"><path d="m4 4 10 22L4 48"/></svg></button>
      </div>}

    </div>
  )
}

function LoadingState() {
  return <div className="loading-state" role="status" aria-live="polite"><span className="spinner" aria-hidden="true" /><span>Loading homes…</span></div>
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="message-panel error-panel" role="alert">
      <p className="message-title">We could not load the homes.</p>
      <p>Check the connection and try once more.</p>
      <button type="button" onClick={onRetry}>Try again</button>
    </div>
  )
}

function titleCase(value: string) { return value.charAt(0).toUpperCase() + value.slice(1) }

function propertyIDFromPath(pathname: string) {
  return pathname.match(/^\/properties\/([^/]+)\/?$/)?.[1]
}

function propertyTourIDFromPath(pathname: string) {
  return pathname.match(/^\/properties\/([^/]+)\/tour\/?$/)?.[1]
}

function mediaLabel(kind: Property['media'][number]['kind']) {
  if (kind === 'floor_plan') return 'Floor plan'
  if (kind === 'panorama') return '360° view'
  if (kind === 'video') return 'Video tour'
  return 'Photograph'
}

export default App

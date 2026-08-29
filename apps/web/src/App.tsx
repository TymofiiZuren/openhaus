import { useCallback, useDeferredValue, useEffect, useState } from 'react'
import './App.css'
import { fetchProperties, type Property } from './api/properties'
import { areaForCoordinate } from './administrativeAreas'
import { PropertyMap } from './PropertyMap'

type CatalogueState =
  | { status: 'loading'; properties: Property[] }
  | { status: 'success'; properties: Property[] }
  | { status: 'error'; properties: Property[] }

const euros = new Intl.NumberFormat('en-IE', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
})

function App() {
  const [state, setState] = useState<CatalogueState>({ status: 'loading', properties: [] })
  const [requestKey, setRequestKey] = useState(0)
  const [selectedCounty, setSelectedCounty] = useState<string | null>(() => new URLSearchParams(window.location.search).get('county'))
  const [selectedArea, setSelectedArea] = useState<string>()
  const [propertyQuery, setPropertyQuery] = useState('')
  const [minimumBedrooms, setMinimumBedrooms] = useState(0)
  const [propertyType, setPropertyType] = useState('all')
  const [maximumPrice, setMaximumPrice] = useState(0)
  const [sortOrder, setSortOrder] = useState('recent')
  const deferredPropertyQuery = useDeferredValue(propertyQuery.trim().toLocaleLowerCase())

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
    window.history.pushState({}, '', url)
  }, [])

  useEffect(() => {
    const restoreCounty = () => {
      setSelectedCounty(new URLSearchParams(window.location.search).get('county'))
      setSelectedArea(undefined)
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
  const filteredProperties = state.properties.filter((property) => {
    const searchable = `${property.title} ${property.addressLine1} ${property.city} ${property.county}`.toLocaleLowerCase()
    return (!deferredPropertyQuery || searchable.includes(deferredPropertyQuery))
      && (!minimumBedrooms || property.bedrooms >= minimumBedrooms)
      && (propertyType === 'all' || property.propertyType === propertyType)
      && (!maximumPrice || property.priceCents <= maximumPrice * 100)
  })
  const countyProperties = effectiveSelectedCounty
    ? filteredProperties.filter((property) => property.county.localeCompare(effectiveSelectedCounty, undefined, { sensitivity: 'base' }) === 0)
    : filteredProperties
  const locationProperties = effectiveSelectedCounty && selectedArea
    ? countyProperties.filter((property) => areaForCoordinate(effectiveSelectedCounty, { lat: property.latitude, lng: property.longitude })?.name === selectedArea)
    : countyProperties
  const visibleProperties = [...locationProperties].sort((left, right) => {
    if (sortOrder === 'price-low') return left.priceCents - right.priceCents
    if (sortOrder === 'price-high') return right.priceCents - left.priceCents
    return 0
  })
  const featuredProperty = state.status === 'success' ? state.properties[0] : undefined
  const featuredImage = featuredProperty?.media.find((item) => item.kind === 'image')
  const featuredFloorPlan = featuredProperty?.media.find((item) => item.kind === 'floor_plan')
  const requestedPropertyID = propertyIDFromPath(window.location.pathname)

  if (requestedPropertyID) {
    return <PropertyDetailPage property={state.properties.find((property) => property.id === requestedPropertyID)} status={state.status} onRetry={retry} />
  }

  return (
    <div className="site-shell">
      <a className="skip-link" href="#explore">Skip to property search</a>
      <SiteHeader />
      <main>
        <div id="explore" className="map-first">
          {state.status === 'success' && state.properties.length > 0 && (
            <PropertyMap
              properties={filteredProperties}
              selectedCounty={effectiveSelectedCounty}
              selectedArea={selectedArea}
              propertyQuery={propertyQuery}
              minimumBedrooms={minimumBedrooms}
              propertyType={propertyType}
              maximumPrice={maximumPrice}
              onPropertyQueryChange={setPropertyQuery}
              onMinimumBedroomsChange={setMinimumBedrooms}
              onPropertyTypeChange={setPropertyType}
              onMaximumPriceChange={setMaximumPrice}
              onCountyChange={selectCounty}
              onAreaChange={setSelectedArea}
            />
          )}
        </div>
        <section className="catalogue" id="homes" aria-label="Homes for sale">
          <div className="catalogue-heading">
            <div><p className="eyebrow">Properties for sale</p><h2>{effectiveSelectedCounty ? `Homes in ${effectiveSelectedCounty}` : 'Recently added homes'}</h2></div>
            {state.status === 'success' && (
              <div className="catalogue-actions"><button type="button">Save search</button><label>Sort by <select aria-label="Sort properties" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)}><option value="recent">Most recent</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option></select></label><p aria-live="polite">{visibleProperties.length} {visibleProperties.length === 1 ? 'home' : 'homes'}</p></div>
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
          {state.status === 'success' && visibleProperties.length > 0 && (
            <div className="property-grid">
              {visibleProperties.map((property) => (
                <PropertyCard key={property.id} property={property} />
              ))}
            </div>
          )}
        </section>
        <section className="property-story" id="why-openhaus" aria-labelledby="property-story-title">
          <div className="property-story-copy">
            <p className="eyebrow">Why OpenHaus</p>
            <h2 id="property-story-title">Everything you need before you book a viewing.</h2>
            <p>Compare the location, layout and complete media story in one place, with no hidden address hunting or disconnected tabs.</p>
            <ul>
              <li><span>01</span><div><strong>Explore the location</strong><p>Move from Ireland to a county and local area without losing context.</p></div></li>
              <li><span>02</span><div><strong>Tour the entire home</strong><p>Browse photography, floor plans and video from the same listing.</p></div></li>
              <li><span>03</span><div><strong>Shortlist with confidence</strong><p>See the price, property facts and setting before arranging a visit.</p></div></li>
            </ul>
          </div>
          <div className="property-story-media">
            {featuredFloorPlan ? <img src={featuredFloorPlan.url} alt={featuredFloorPlan.altText} loading="lazy" /> : <div className="story-media-placeholder" />}
            {featuredImage && <img src={featuredImage.url} alt="" loading="lazy" />}
            <span>Complete property context</span>
          </div>
        </section>
      </main>
      <footer className="site-footer">
        <div><a className="wordmark footer-wordmark" href="/">OpenHaus</a><p>Find home with the full picture.</p></div>
        <nav aria-label="Footer navigation"><a href="#explore">Explore Ireland</a><a href="#homes">Homes for sale</a><a href="/manager/login">Manager workspace</a></nav>
        <p>Independent portfolio project · Ireland</p>
      </footer>
    </div>
  )
}

function PropertyCard({ property }: { property: Property }) {
  return (
    <article className="property-card" id={`property-${property.id}`}>
      <PropertyGallery property={property} />
      <div className="property-body">
        <div className="property-card-topline">
          <div className="property-location"><span>{property.city}</span><span aria-hidden="true">/</span><span>Co. {property.county}</span></div>
          <strong className="property-price">{euros.format(property.priceCents / 100)}</strong>
        </div>
        <h3>{property.title}</h3>
        <p className="address">{property.addressLine1}</p>
        <div className="property-details">
          <span>{property.bedrooms} bedrooms</span>
          <span>{titleCase(property.propertyType)}</span>
          <span>Photography · plans · video</span>
          <a href={`/properties/${property.id}`} aria-label={`View details for ${property.title}`}>View home <span aria-hidden="true">→</span></a>
        </div>
      </div>
    </article>
  )
}

function SiteHeader() {
  return (
    <header className="site-header">
      <a className="wordmark" href="/" aria-label="OpenHaus home">OpenHaus</a>
      <nav className="site-navigation" aria-label="Primary navigation">
        <a href="/#explore">Find a property</a>
        <a href="/manager/login">Market your property</a>
        <a href="/#why-openhaus">Why OpenHaus</a>
        <a href="/#homes">Property journal</a>
      </nav>
      <a className="manager-link" href="/manager/login">List a property</a>
    </header>
  )
}

function PropertyDetailPage({ property, status, onRetry }: { property?: Property; status: CatalogueState['status']; onRetry: () => void }) {
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
          <article className="property-page-layout">
            <div className="property-page-hero"><PropertyGallery property={property} /></div>
            <div className="property-page-summary">
              <div className="property-page-identity"><p className="eyebrow">Property for sale</p><h1>{property.title}</h1><p className="property-page-address">{property.addressLine1}, Co. {property.county}</p></div>
              <strong className="property-page-price"><span>Asking price</span>{euros.format(property.priceCents / 100)}</strong>
              <dl><div><dt>Home</dt><dd>{titleCase(property.propertyType)}</dd></div><div><dt>Bedrooms</dt><dd>{property.bedrooms}</dd></div><div><dt>Property media</dt><dd>{property.media.length} items</dd></div></dl>
              <aside className="property-contact-card" aria-label="Arrange a viewing"><p className="eyebrow">OpenHaus viewings</p><h2>See this home in person</h2><p>Request details or arrange a private viewing with the listing team.</p><a className="viewing-link" href={`mailto:viewings@openhaus.ie?subject=${encodeURIComponent(`Viewing request: ${property.title}`)}`}>Arrange a viewing <span aria-hidden="true">→</span></a></aside>
            </div>
            <div className="property-page-note"><strong>The complete picture</strong><p>Photography, floor plans and video are presented together so you can understand the home before arranging a visit.</p></div>
          </article>
        </>}
      </main>
    </div>
  )
}

function PropertyGallery({ property }: { property: Property }) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const selected = property.media[selectedIndex]
  const poster = property.media.find((item) => item.kind === 'image')?.url
  const showPrevious = () => setSelectedIndex((index) => (index - 1 + property.media.length) % property.media.length)
  const showNext = () => setSelectedIndex((index) => (index + 1) % property.media.length)

  if (!selected) {
    return (
      <div className="property-visual property-fallback">
        <svg viewBox="0 0 480 280" role="img" aria-label="No property photograph available">
          <path d="M42 226h396M93 226V117l147-73 147 73v109M141 226v-76h67v76M272 126h67v57h-67z" />
        </svg>
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
            fetchPriority={selectedIndex === 0 ? 'high' : 'auto'}
          />
        )}
        <p className="gallery-count" aria-live="polite">
          {selectedIndex + 1} / {property.media.length}
        </p>
        <p className="gallery-kind">{mediaLabel(selected.kind)}</p>
        {property.media.length > 1 && <div className="gallery-navigation" aria-label="Property photographs">
          <button type="button" aria-label="Previous image" onClick={showPrevious}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 5-7 7 7 7"/></svg></button>
          <button type="button" aria-label="Next image" onClick={showNext}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 5 7 7-7 7"/></svg></button>
        </div>}
      </div>

      <div className="gallery-thumbnails" aria-label={`Media for ${property.title}`}>
        {property.media.map((item, index) => (
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

function mediaLabel(kind: Property['media'][number]['kind']) {
  if (kind === 'floor_plan') return 'Floor plan'
  if (kind === 'panorama') return '360° view'
  if (kind === 'video') return 'Video tour'
  return 'Photograph'
}

export default App

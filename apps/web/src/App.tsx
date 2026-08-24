import { useCallback, useEffect, useState } from 'react'
import './App.css'
import { fetchProperties, type Property } from './api/properties'

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

  return (
    <div className="site-shell">
      <header className="site-header">
        <a className="wordmark" href="/" aria-label="OpenHaus home">OpenHaus</a>
        <span className="market-label">Homes across Ireland</span>
      </header>
      <main>
        <section className="intro" aria-labelledby="catalogue-title">
          <p className="eyebrow">Property, clearly presented</p>
          <h1 id="catalogue-title">Find a place that feels like yours.</h1>
          <p className="intro-copy">A considered collection of homes for sale across Ireland.</p>
        </section>
        <section className="catalogue" aria-label="Homes for sale">
          <div className="catalogue-heading">
            <h2>Latest homes</h2>
            {state.status === 'success' && (
              <p aria-live="polite">{state.properties.length} {state.properties.length === 1 ? 'home' : 'homes'}</p>
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
          {state.status === 'success' && state.properties.length > 0 && (
            <div className="property-grid">
              {state.properties.map((property) => (
                <PropertyCard key={property.id} property={property} />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

function PropertyCard({ property }: { property: Property }) {
  return (
    <article className="property-card">
      <PropertyGallery property={property} />
      <div className="property-body">
        <div className="property-location"><span>{property.city}</span><span aria-hidden="true">/</span><span>Co. {property.county}</span></div>
        <h3>{property.title}</h3>
        <p className="address">{property.addressLine1}</p>
        <div className="property-details">
          <strong>{euros.format(property.priceCents / 100)}</strong>
          <span>{property.bedrooms} bedrooms</span>
          <span>{titleCase(property.propertyType)}</span>
        </div>
      </div>
    </article>
  )
}

function PropertyGallery({ property }: { property: Property }) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const selected = property.media[selectedIndex]
  const poster = property.media.find((item) => item.kind === 'image')?.url

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

function mediaLabel(kind: Property['media'][number]['kind']) {
  if (kind === 'floor_plan') return 'Floor plan'
  if (kind === 'panorama') return '360° view'
  if (kind === 'video') return 'Video tour'
  return 'Photograph'
}

export default App

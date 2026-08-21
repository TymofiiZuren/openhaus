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
              {state.properties.map((property, index) => (
                <PropertyCard key={property.id} property={property} index={index} />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

function PropertyCard({ property, index }: { property: Property; index: number }) {
  return (
    <article className="property-card">
      <div className={`property-visual visual-${(index % 3) + 1}`} aria-hidden="true">
        <span>{String(index + 1).padStart(2, '0')}</span>
        <svg viewBox="0 0 480 280" role="presentation">
          <path d="M42 226h396M93 226V117l147-73 147 73v109M141 226v-76h67v76M272 126h67v57h-67z" />
        </svg>
      </div>
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

export default App

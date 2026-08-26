import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import './App.css'
import { uploadPropertyVideo, waitForMediaJob, type MediaJob } from './api/mediaJobs'
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

  const refresh = useCallback(() => setRequestKey((key) => key + 1), [])
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
  const countyProperties = effectiveSelectedCounty
    ? state.properties.filter((property) => property.county.localeCompare(effectiveSelectedCounty, undefined, { sensitivity: 'base' }) === 0)
    : state.properties
  const visibleProperties = effectiveSelectedCounty && selectedArea
    ? countyProperties.filter((property) => areaForCoordinate(effectiveSelectedCounty, { lat: property.latitude, lng: property.longitude })?.name === selectedArea)
    : countyProperties
  const featuredProperty = state.status === 'success' ? state.properties[0] : undefined
  const featuredImage = featuredProperty?.media.find((item) => item.kind === 'image')
  const featuredFloorPlan = featuredProperty?.media.find((item) => item.kind === 'floor_plan')
  return (
    <div className="site-shell">
      <a className="skip-link" href="#explore">Skip to property search</a>
      <header className="site-header">
        <a className="wordmark" href="/" aria-label="OpenHaus home">OpenHaus</a>
        <nav className="site-navigation" aria-label="Primary navigation">
          <a href="#homes">Buy</a>
          <a href="#explore">Search by map</a>
          <a href="#why-openhaus">How it works</a>
        </nav>
        <a className="manager-link" href="/manager/login">List a property</a>
      </header>
      <main>
        <div id="explore" className="map-first">
          {state.status === 'success' && state.properties.length > 0 && (
            <PropertyMap properties={state.properties} selectedCounty={effectiveSelectedCounty} selectedArea={selectedArea} onCountyChange={selectCounty} onAreaChange={setSelectedArea} />
          )}
        </div>
        <section className="catalogue" id="homes" aria-label="Homes for sale">
          <div className="catalogue-heading">
            <div><p className="eyebrow">Properties for sale</p><h2>{effectiveSelectedCounty ? `Homes in ${effectiveSelectedCounty}` : 'Recently added homes'}</h2></div>
            {state.status === 'success' && (
              <p aria-live="polite">{visibleProperties.length} {visibleProperties.length === 1 ? 'home' : 'homes'}</p>
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
                <PropertyCard key={property.id} property={property} onMediaReady={refresh} />
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

function PropertyCard({ property, onMediaReady }: { property: Property; onMediaReady: () => void }) {
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
          <a href={`#property-${property.id}`} aria-label={`View details for ${property.title}`}>View home <span aria-hidden="true">→</span></a>
        </div>
        {import.meta.env.DEV && <VideoUpload property={property} onReady={onMediaReady} />}
      </div>
    </article>
  )
}

type UploadState =
  | { status: 'idle' }
  | { status: 'uploading'; filename: string }
  | { status: 'processing'; filename: string; job: MediaJob }
  | { status: 'ready'; filename: string }
  | { status: 'error'; message: string }

const maxVideoBytes = 2 * 1024 * 1024 * 1024

function VideoUpload({ property, onReady }: { property: Property; onReady: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const [file, setFile] = useState<File>()
  const [state, setState] = useState<UploadState>({ status: 'idle' })
  const controller = useRef<AbortController | undefined>(undefined)

  useEffect(() => () => controller.current?.abort(), [])

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0]
    setFile(undefined)
    setState({ status: 'idle' })
    if (!selected) return
    const extensionAllowed = /\.(mp4|mov)$/i.test(selected.name)
    const typeAllowed = selected.type === 'video/mp4' || selected.type === 'video/quicktime'
    if (!extensionAllowed || (!typeAllowed && selected.type !== '')) {
      setState({ status: 'error', message: 'Choose an MP4 or MOV video.' })
      return
    }
    if (selected.size > maxVideoBytes) {
      setState({ status: 'error', message: 'Choose a video smaller than 2 GiB.' })
      return
    }
    setFile(selected)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!file || state.status === 'uploading' || state.status === 'processing') return
    controller.current?.abort()
    controller.current = new AbortController()
    const signal = controller.current.signal
    setState({ status: 'uploading', filename: file.name })
    try {
      const queued = await uploadPropertyVideo(property.id, file, signal)
      setState({ status: 'processing', filename: file.name, job: queued })
      const completed = await waitForMediaJob(
        queued.id,
        (job) => setState({ status: 'processing', filename: file.name, job }),
        signal,
      )
      if (completed.status === 'failed') {
        setState({ status: 'error', message: completed.errorMessage || 'Video processing failed. Try another file.' })
        return
      }
      setState({ status: 'ready', filename: file.name })
      onReady()
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setState({ status: 'error', message: 'The video could not be uploaded. Try again.' })
    }
  }

  const busy = state.status === 'uploading' || state.status === 'processing'
  return (
    <div className="listing-tools">
      <button
        className="listing-tools-toggle"
        type="button"
        aria-expanded={expanded}
        aria-controls={`video-upload-${property.id}`}
        aria-label={`Add a video tour for ${property.title}`}
        onClick={() => setExpanded((value) => !value)}
      >
        <span>Listing tools · Local demo</span>
        <span aria-hidden="true">{expanded ? '−' : '+'}</span>
      </button>
      {expanded && (
        <form id={`video-upload-${property.id}`} className="video-upload" onSubmit={submit}>
          <div>
            <p className="video-upload-title">Add a video tour</p>
            <p className="video-upload-help">MP4 or MOV, up to 2 GiB. OpenHaus prepares a web-ready copy.</p>
          </div>
          <label className="file-picker">
            <span>Choose an MP4 or MOV video</span>
            <input type="file" accept="video/mp4,video/quicktime,.mp4,.mov" disabled={busy} onChange={chooseFile} />
          </label>
          {file && state.status === 'idle' && <p className="selected-file">Selected: {file.name}</p>}
          <button className="upload-button" type="submit" disabled={!file || busy}>
            {state.status === 'uploading' ? 'Uploading…' : 'Upload video'}
          </button>
          {state.status === 'uploading' && <p className="upload-status" role="status">Uploading {state.filename}…</p>}
          {state.status === 'processing' && (
            <p className="upload-status" role="status">
              {state.job.status === 'pending' ? 'Video queued for processing…' : `Processing ${state.filename}…`}
            </p>
          )}
          {state.status === 'ready' && <p className="upload-status upload-success" role="status">Video tour ready.</p>}
          {state.status === 'error' && <p className="upload-status upload-error" role="alert">{state.message}</p>}
        </form>
      )}
    </div>
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

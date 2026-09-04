import { lazy, Suspense, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import './App.css'
import { PropertyDetailPage } from './App'
import { ManagerImages } from './ManagerImages'
import { ThemeControl } from './ThemeControl'
import { AuthFields } from './AuthFields'
import { clientSessionHintKey, SiteHeader, type HeaderClient } from './SiteHeader'
import { uploadPropertyVideo, waitForMediaJob, type MediaJob } from './api/mediaJobs'
import {
  fetchManagedProperties,
  createManagedProperty,
  loginManager,
  logoutManager,
  ManagerAuthenticationError,
  type ManagedProperty,
  type ManagedPropertyInput,
  updateManagedProperty,
  attachPropertyPanorama,
  removePropertyPanorama,
} from './api/manager'

type ManagerState =
  | { status: 'checking' }
  | { status: 'signed-out' }
  | { status: 'loading' }
  | { status: 'client-active'; client: HeaderClient }
  | { status: 'ready'; properties: ManagedProperty[] }
  | { status: 'error'; message: string }

const SpatialMediaViewer = lazy(() => import('./SpatialMediaViewer').then((module) => ({ default: module.SpatialMediaViewer })))

const euros = new Intl.NumberFormat('en-IE', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
})

function clearClientHint() {
  try { localStorage.removeItem(clientSessionHintKey) }
  catch { /* Server sessions remain authoritative when browser storage is unavailable. */ }
}

export function ManagerApp() {
  const [state, setState] = useState<ManagerState>({ status: 'checking' })

  async function loadProperties(signal?: AbortSignal) {
    try {
      const properties = await fetchManagedProperties(signal)
      setState({ status: 'ready', properties })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      if (error instanceof ManagerAuthenticationError) {
        setState({ status: 'signed-out' })
        return
      }
      setState({ status: 'error', message: 'The manager workspace could not be loaded.' })
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    async function loadWorkspace() {
      try {
        const response = await fetch('/api/v1/client/session', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal })
        if (response.ok) {
          const data = await response.clone().json()
          if (typeof data?.client?.id === 'string' && typeof data?.client?.email === 'string') {
            setState({ status: 'client-active', client: data.client })
            return
          }
        } else if (response.status === 401 || response.status === 404) {
          clearClientHint()
        }
        const properties = await fetchManagedProperties(controller.signal)
        setState({ status: 'ready', properties })
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        if (error instanceof ManagerAuthenticationError) {
          setState({ status: 'signed-out' })
          return
        }
        setState({ status: 'error', message: 'The manager workspace could not be loaded.' })
      }
    }
    void loadWorkspace()
    return () => controller.abort()
  }, [])

  async function signIn(email: string, password: string) {
    setState({ status: 'loading' })
    try {
      await loginManager(email, password)
      await loadProperties()
    } catch (error) {
      if (error instanceof ManagerAuthenticationError) {
        setState({ status: 'error', message: error.message })
        return
      }
      setState({ status: 'error', message: 'Sign in is unavailable. Please try again.' })
    }
  }

  async function signOut() {
    try {
      await logoutManager()
      setState({ status: 'signed-out' })
    } catch {
      setState({ status: 'error', message: 'Sign out failed. Please try again.' })
    }
  }

  const isSignedIn = state.status === 'ready'
  const previewID = window.location.pathname.match(/^\/manager\/preview\/([^/]+)$/)?.[1]
  if (state.status === 'client-active') return <div className="site-shell"><SiteHeader pathname={window.location.pathname} client={state.client} clientSessionStatus="authenticated" /><main className="manager-client-guard"><p className="eyebrow">Account boundary</p><h1>Your client account is active.</h1><p>Manager tools stay separate from buyer accounts. Sign out from your client account before opening the property workspace.</p><a href="/client/login">Return to your client account <span aria-hidden="true">→</span></a></main></div>
  if (previewID && state.status === 'ready') return <ManagerPublicationPreview property={state.properties.find((property) => property.id === previewID)} />
  return (
    <div className="manager-shell">
      <header className="site-header manager-header">
        <a className="wordmark" href="/" aria-label="OpenHaus home">OpenHaus<span aria-hidden="true">.</span></a>
        <span className="manager-workspace-label">Property workspace</span>
        <div className="header-actions"><ThemeControl />{isSignedIn && <button className="manager-text-button" type="button" onClick={signOut}>Sign out</button>}</div>
      </header>
      <main className="manager-main">
        {state.status === 'checking' && (
          <div className="manager-centred" role="status"><span className="spinner" />Loading manager workspace…</div>
        )}
        {(state.status === 'signed-out' || state.status === 'error' || state.status === 'loading') && (
          <ManagerLogin onSubmit={signIn} busy={state.status === 'loading'} error={state.status === 'error' ? state.message : undefined} />
        )}
        {state.status === 'ready' && <ManagerDashboard properties={state.properties} />}
      </main>
    </div>
  )
}

function ManagerPublicationPreview({ property }: { property?: ManagedProperty }) {
  const [width, setWidth] = useState(1440)
  const [revision, setRevision] = useState(0)
  if (!property) return <main className="manager-main"><h1>Listing unavailable</h1><p>This listing is not available in your workspace.</p><a href="/manager/login">Back to dashboard</a></main>
  if (new URLSearchParams(window.location.search).get('frame') === '1') {
    const previewProperty = { ...property, media: property.media.map((item) => ({ ...item, url: item.url.replace('/api/v1/property-images/', '/api/v1/manager/property-images/') })) }
    return <Suspense fallback={<p role="status">Preparing listing preview…</p>}><PropertyDetailPage property={previewProperty} status="success" onRetry={() => window.location.reload()} /></Suspense>
  }
  return <main className="manager-publication-preview">
    <header><div><a href="/manager/login">← Back to dashboard</a><p className="eyebrow">Private publication preview · {property.status}</p><h1>{property.title}</h1><p>Saved content only. This does not publish the listing. Buyer links inside the preview may leave this page; enquiries remain demonstrations.</p></div>
      <div className="manager-preview-controls" role="group" aria-label="Preview viewport">
        {([[1440, 'Desktop'], [768, 'Tablet'], [390, 'Mobile']] as const).map(([size, label]) => <button type="button" key={size} aria-pressed={width === size} onClick={() => setWidth(size)}>{label} · {size}px</button>)}
        <button type="button" onClick={() => setRevision((value) => value + 1)}>Refresh saved content</button>
      </div>
    </header>
    <p className="manager-preview-hint">Scroll horizontally on smaller screens to inspect the full selected width. These are viewport presets, not device emulation.</p>
    <div className="manager-preview-canvas"><iframe key={revision} title="Listing publication preview" src={`/manager/preview/${property.id}?frame=1`} style={{ width }} allow="fullscreen" /></div>
  </main>
}

function ManagerLogin({ onSubmit, error, busy }: { onSubmit: (email: string, password: string) => void; error?: string; busy?: boolean }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    onSubmit(email, password)
  }

  return (
    <div className="manager-entry">
    <aside className="manager-entry-intro" aria-label="Workspace introduction">
      <p className="section-index">OpenHaus / For property professionals</p>
      <h2>Every detail.<br /><em>One workspace.</em></h2>
      <p>Bring your listings, photography and immersive tours together, from first draft to publication.</p>
      <dl><div><dt>01</dt><dd>Manage your portfolio</dd></div><div><dt>02</dt><dd>Prepare photos, plans & 360° tours</dd></div><div><dt>03</dt><dd>Preview before publishing</dd></div></dl>
    </aside>
    <section className="manager-login" aria-labelledby="manager-login-title">
      <p className="eyebrow">Private workspace</p>
      <h1 id="manager-login-title">Manager sign in</h1>
      <p className="manager-login-copy">A focused workspace for reviewing listings, media and publication status.</p>
      <form onSubmit={submit} aria-busy={busy}>
        <AuthFields prefix="manager" email={email} password={password} onEmail={setEmail} onPassword={setPassword} disabled={busy} />
        {error && <p className="manager-form-error" role="alert">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <a href="/">Return to public listings</a>
    </section>
    </div>
  )
}

function ManagerDashboard({ properties }: { properties: ManagedProperty[] }) {
  const [items, setItems] = useState(properties)
  const [editing, setEditing] = useState<ManagedProperty | 'new'>()
  const [saveError, setSaveError] = useState<string>()
  const [stageFilter, setStageFilter] = useState('all')
  const [sort, setSort] = useState('default')
  const [compact, setCompact] = useState(false)
  const [expandedID, setExpandedID] = useState<string>()
  const [search, setSearch] = useState('')
  const query = search.trim().toLocaleLowerCase()
  const published = items.filter((property) => property.status === 'published').length
  const needsAttention = items.filter((property) => property.status === 'draft' && completeness(property) < 88).length
  const filteredItems = items.filter((property) =>
    (stageFilter === 'all' || workflowStageKey(property) === stageFilter) &&
    (!query || [property.title, property.addressLine1, property.city, property.county].some((value) => value.toLocaleLowerCase().includes(query))))
  const visibleIDs = new Set(filteredItems.map((property) => property.id))
  const orderedItems = [...items].sort((a, b) => {
    if (sort === 'price-low') return a.priceCents - b.priceCents
    if (sort === 'price-high') return b.priceCents - a.priceCents
    if (sort === 'title') return a.title.localeCompare(b.title, 'en', { sensitivity: 'base', numeric: true })
    if (sort === 'readiness') return completeness(a) - completeness(b)
    return 0
  })

  async function save(input: ManagedPropertyInput) {
    setSaveError(undefined)
    try {
      const saved = editing === 'new' ? await createManagedProperty(input) : await updateManagedProperty(editing!.id, input)
      setItems((current) => editing === 'new' ? [saved, ...current] : current.map((item) => item.id === saved.id ? saved : item))
      setEditing(undefined)
    } catch {
      setSaveError('The listing could not be saved. Please try again.')
    }
  }
  return (
    <section className="manager-dashboard" aria-labelledby="manager-properties-title">
      <div className="manager-dashboard-heading">
        <div><p className="eyebrow">Portfolio overview</p><h1 id="manager-properties-title">Your properties</h1><p>Create, review and publish every listing from one place.</p></div>
        <div className="manager-heading-actions"><div className="manager-summary" aria-label="Portfolio summary"><span><strong>{items.length}</strong> Total listings</span><span><strong>{needsAttention}</strong> Need attention</span><span><strong>{published}</strong> Published</span></div><button className="manager-primary-button" type="button" onClick={() => setEditing('new')}>Add property</button></div>
      </div>
      {editing && <ManagerPropertyForm property={editing === 'new' ? undefined : editing} onCancel={() => setEditing(undefined)} onSave={save} error={saveError} />}
      <div className="manager-view-switch" role="group" aria-label="Portfolio display"><button type="button" aria-pressed={compact} onClick={() => { setCompact(true); setExpandedID(undefined) }}>Compact view</button><button type="button" aria-pressed={!compact} onClick={() => setCompact(false)}>Editing view</button><span>Scan your portfolio or work on listing content.</span></div>
      {items.length > 0 && <div className="manager-pipeline-toolbar">
        <div><p className="section-index">Listing pipeline</p><strong>Move work forward by stage</strong></div>
        <label className="manager-search">Search your listings<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Title, address, town or county" /></label>
        <label>Sort listings<select value={sort} onChange={(event) => setSort(event.target.value)}><option value="default">Default order</option><option value="readiness">Least complete first</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option><option value="title">Title: A–Z</option></select></label>
        <label>Filter listings by stage<select value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}><option value="all">All stages</option><option value="draft-setup">Draft setup</option><option value="media-capture">Media capture</option><option value="ready-for-review">Ready for review</option><option value="live">Live</option><option value="archived">Archived</option></select></label>
      </div>}
      {items.length > 0 && <div className="manager-filter-summary"><p role="status" aria-live="polite">{filteredItems.length} of {items.length} listings</p>{(search || stageFilter !== 'all') && <button type="button" onClick={() => { setSearch(''); setStageFilter('all') }}>Reset filters</button>}</div>}
      {items.length > 0 && filteredItems.length === 0 && <div className="manager-empty manager-filter-empty"><h2>{query ? 'No listings match your search and stage.' : 'No listings match this stage.'}</h2><p>Try a title, street, town or county, or reset the filters above.</p></div>}
      {items.length === 0 ? (
        <div className="manager-empty"><h2>No properties yet</h2><p>Your first listing will appear here.</p></div>
      ) : (
        <div className="manager-property-list">
          {orderedItems.map((property) => (
            <article className={`manager-property-row${compact && expandedID !== property.id ? ' manager-property-compact' : ''}`} key={property.id} hidden={!visibleIDs.has(property.id)}>
              <div className="manager-property-overview">
                <p className="manager-panel-kicker">01 / Listing overview</p>
                <div className="manager-listing-identity">
                <div>
                <div className="manager-property-state"><span className={`manager-status manager-status-${property.status}`}>{titleCase(property.status)}</span><span className="manager-workflow-stage">{workflowStage(property)}</span></div>
                <h2>{property.title}</h2><p>{property.addressLine1}, {property.city}, Co. {property.county}</p>
                {!property.media.some((media) => media.kind === 'image' && !media.url.includes('/placeholders/')) && <span className="manager-photo-status">No photos added</span>}
                </div></div>
                <figure className="manager-cover-preview">
                  {property.media.filter(item => item.kind === 'image' && !item.url.includes('/placeholders/')).sort((a, b) => a.position - b.position)[0] ? <img src={property.media.filter(item => item.kind === 'image' && !item.url.includes('/placeholders/')).sort((a, b) => a.position - b.position)[0].url.replace('/api/v1/property-images/', '/api/v1/manager/property-images/')} alt={`Cover preview for ${property.title}`} loading="lazy" /> : <img className="manager-cover-concept" src="/media/placeholders/architectural-home.svg" alt="Architectural concept illustration — not a photograph of this property" loading="lazy" />}
                  <figcaption>{property.media.some(item => item.kind === 'image' && !item.url.includes('/placeholders/')) ? 'Listing cover preview' : <><span>Architectural concept · example only</span><small>Add your cover photo in the media library below.</small></>}</figcaption>
                </figure>
                {compact && <div className="manager-compact-actions"><span>{euros.format(property.priceCents / 100)} · {property.bedrooms} bedrooms</span><button type="button" aria-expanded={expandedID === property.id} aria-controls={`manager-tools-${property.id}`} aria-label={`${expandedID === property.id ? 'Collapse' : 'Manage'} ${property.title}`} onClick={() => setExpandedID(expandedID === property.id ? undefined : property.id)}>{expandedID === property.id ? 'Collapse tools' : 'Manage listing'} <span aria-hidden="true">↗</span></button></div>}
                <div className="manager-completeness">
                  <div><span>Listing readiness</span><strong>{completeness(property)}% complete</strong></div>
                  <progress aria-label={`${property.title} completeness`} max="100" value={completeness(property)}>{completeness(property)}%</progress>
                </div>
                <div hidden={compact && expandedID !== property.id}><ManagerReadinessChecklist property={property} onEdit={() => setEditing(property)} /></div>
              </div>
<div className="manager-property-meta" id={`manager-tools-${property.id}`} hidden={compact && expandedID !== property.id}><p className="manager-panel-kicker">02 / Details & immersive media</p><h3>Listing essentials</h3><dl><div><dt>Price</dt><dd>{euros.format(property.priceCents / 100)}</dd></div><div><dt>Bedrooms</dt><dd>{property.bedrooms}</dd></div><div><dt>Type</dt><dd>{titleCase(property.propertyType)}</dd></div></dl><div className="manager-row-actions"><a href={`/manager/preview/${property.id}`} target="_blank" rel="noreferrer">Preview listing</a><button type="button" aria-label={`Edit ${property.title}`} onClick={() => setEditing(property)}>Edit listing</button>{property.status === 'published' && <a href={`/properties/${property.id}`}>View public listing <span aria-hidden="true">→</span></a>}</div><ManagerPanoramaForm property={property} onAttached={(media) => setItems((current) => current.map((item) => item.id === property.id ? { ...item, media: [...item.media.filter((entry) => entry.kind !== 'panorama'), media] } : item))} onRemoved={() => setItems((current) => current.map((item) => item.id === property.id ? { ...item, media: item.media.filter((entry) => entry.kind !== 'panorama') } : item))} /><ManagerTourPreview property={property} /><ManagerVideoUpload property={property} onReady={(media) => setItems((current) => current.map((item) => item.id === property.id ? { ...item, media: [...item.media.filter((entry) => entry.kind !== 'video'), ...media] } : item))} /></div>
              <div className="manager-property-library" hidden={compact && expandedID !== property.id}><p className="manager-panel-kicker">03 / Media library</p>
                <ManagerImages onUpdated={(media) => setItems((current) => current.map((item) => item.id === property.id ? { ...item, media: item.media.map((entry) => entry.url === media.url ? { ...entry, altText: media.altText } : entry) } : item))} propertyID={property.id} media={property.media} onUploaded={(media) => setItems((current) => current.map((item) => item.id === property.id ? {...item,media:[...item.media,media]} : item))} onOrdered={(media) => setItems((current) => current.map((item) => item.id === property.id ? {...item,media} : item))}/>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function ManagerPanoramaForm({ property, onAttached, onRemoved }: { property: ManagedProperty; onAttached: (media: ManagedProperty['media'][number]) => void; onRemoved: () => void }) {
  const existing = property.media.find((item) => item.kind === 'panorama')
  const [shareURL, setShareURL] = useState(existing?.url ?? '')
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'removing' | 'removed' | 'error'>('idle')
  const [confirmingRemoval, setConfirmingRemoval] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault(); setState('saving')
    try {
      const media = await attachPropertyPanorama(property.id, shareURL, `360° tour of ${property.title}`)
      onAttached(media); setState('saved')
    } catch { setState('error') }
  }
  async function remove() {
    setState('removing')
    try {
      await removePropertyPanorama(property.id)
      setShareURL(''); setConfirmingRemoval(false); onRemoved(); setState('removed')
    } catch { setConfirmingRemoval(false); setState('error') }
  }
  return <form className="manager-panorama-form" onSubmit={submit}>
    <label><span>{existing ? 'Replace Kuula 360° tour' : 'Add Kuula 360° tour'}</span><input type="url" required value={shareURL} onChange={(event) => { setShareURL(event.target.value); setState('idle') }} placeholder="https://kuula.co/share/…" aria-describedby={`panorama-help-${property.id}`} /></label>
    <button type="submit" disabled={state === 'saving'}>{state === 'saving' ? 'Saving…' : existing ? 'Replace tour' : 'Attach tour'}</button>
    {existing && !confirmingRemoval && <button className="manager-panorama-remove" type="button" aria-label={`Remove 360° tour from ${property.title}`} onClick={() => setConfirmingRemoval(true)}>Remove tour</button>}
    {existing && confirmingRemoval && <div className="manager-panorama-confirm" role="group" aria-label="Confirm panorama removal"><strong>Remove this tour?</strong><span>The public listing will immediately show its photography and plans fallback.</span><div><button type="button" onClick={() => setConfirmingRemoval(false)}>Keep tour</button><button type="button" disabled={state === 'removing'} onClick={remove}>{state === 'removing' ? 'Removing…' : 'Confirm remove tour'}</button></div></div>}
    <small id={`panorama-help-${property.id}`}>Paste the embeddable Kuula /share/ link, not the /post/ page.</small>
    {state === 'saved' && <span role="status">360° tour attached.</span>}{state === 'removed' && <span role="status">360° tour removed.</span>}{state === 'error' && <span role="alert">The panorama update could not be completed.</span>}
  </form>
}

type UploadState = { status: 'idle' } | { status: 'busy'; job?: MediaJob } | { status: 'ready' } | { status: 'refreshing' } | { status: 'refresh-error' } | { status: 'error'; message: string }

function ManagerVideoUpload({ property, onReady }: { property: ManagedProperty; onReady: (media: ManagedProperty['media']) => void }) {
  const [file, setFile] = useState<File>()
  const [state, setState] = useState<UploadState>({ status: 'idle' })
  const controller = useRef<AbortController | undefined>(undefined)
  useEffect(() => () => controller.current?.abort(), [])

  async function refreshMedia() {
    setState({ status: 'refreshing' })
    try {
      const properties = await fetchManagedProperties(controller.current?.signal)
      const saved = properties.find((item) => item.id === property.id)
      const videos = saved?.media.filter((item) => item.kind === 'video')
      if (!videos?.length) throw new Error('Processed video not available')
      onReady(videos)
      setFile(undefined)
      setState({ status: 'ready' })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setState({ status: 'refresh-error' })
    }
  }

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0]
    setFile(undefined)
    setState({ status: 'idle' })
    if (!selected) return
    if (!/\.(mp4|mov)$/i.test(selected.name) || (selected.type && selected.type !== 'video/mp4' && selected.type !== 'video/quicktime')) {
      setState({ status: 'error', message: 'Choose an MP4 or MOV video.' })
      return
    }
    if (selected.size > 2 * 1024 * 1024 * 1024) {
      setState({ status: 'error', message: 'Choose a video smaller than 2 GiB.' })
      return
    }
    setFile(selected)
  }

  async function upload(event: FormEvent) {
    event.preventDefault()
    if (!file || state.status === 'busy') return
    controller.current?.abort()
    controller.current = new AbortController()
    try {
      setState({ status: 'busy' })
      const queued = await uploadPropertyVideo(property.id, file, controller.current.signal)
      setState({ status: 'busy', job: queued })
      const completed = await waitForMediaJob(queued.id, (job) => setState({ status: 'busy', job }), controller.current.signal)
      if (completed.status === 'ready') await refreshMedia()
      else setState({ status: 'error', message: completed.errorMessage || 'Video processing failed.' })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setState({ status: 'error', message: 'The video could not be uploaded. Try again.' })
    }
  }

  if (state.status === 'refreshing' || state.status === 'refresh-error') return <div className="manager-video-upload">
    {state.status === 'refreshing' ? <span role="status">Video processed. Updating listing readiness…</span> : <><span role="alert">Video processed, but listing readiness could not be refreshed. Retry without uploading again.</span><button type="button" onClick={refreshMedia}>Refresh listing media</button></>}
  </div>
  return <form className="manager-video-upload" onSubmit={upload}>
    <label className="manager-file-picker"><span>Video walkthrough</span><span className="manager-file-picker-control"><input aria-label={`Choose video for ${property.title}`} type="file" accept="video/mp4,video/quicktime,.mp4,.mov" onChange={chooseFile} disabled={state.status === 'busy'} /><span className="manager-file-picker-action" aria-hidden="true">{file ? 'Change video' : 'Select video'}</span><span className="manager-file-picker-name" aria-hidden="true">{file ? file.name : 'Browse your files'}</span></span><small>MP4 or MOV · up to 2 GiB. Select a file, then upload.</small></label>
    <button type="submit" disabled={!file || state.status === 'busy'}>{state.status === 'busy' ? 'Processing…' : 'Upload video'}</button>
    {state.status === 'busy' && <span role="status">{state.job?.status === 'processing' ? 'Preparing video…' : 'Video queued…'}</span>}
    {state.status === 'ready' && <span role="status">Video tour ready.</span>}
    {state.status === 'error' && <span role="alert">{state.message}</span>}
  </form>
}

const emptyProperty: ManagedPropertyInput = { title: '', addressLine1: '', city: '', county: '', priceCents: 0, bedrooms: 0, propertyType: 'detached', longitude: 0, latitude: 0, status: 'draft' }

function ManagerPropertyForm({ property, onCancel, onSave, error }: { property?: ManagedProperty; onCancel: () => void; onSave: (input: ManagedPropertyInput) => void; error?: string }) {
  const [input, setInput] = useState<ManagedPropertyInput>(property ? { title: property.title, addressLine1: property.addressLine1, city: property.city, county: property.county, priceCents: property.priceCents, bedrooms: property.bedrooms, propertyType: property.propertyType, longitude: property.longitude, latitude: property.latitude, status: property.status } : emptyProperty)
  function text(field: keyof ManagedPropertyInput) { return (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setInput((current) => ({ ...current, [field]: event.target.value })) }
  function number(field: keyof ManagedPropertyInput, multiplier = 1) { return (event: ChangeEvent<HTMLInputElement>) => setInput((current) => ({ ...current, [field]: Number(event.target.value) * multiplier })) }
  function submit(event: FormEvent) { event.preventDefault(); onSave(input) }
  return <section className="manager-editor" aria-labelledby="manager-editor-title">
    <div className="manager-editor-heading"><div><p className="eyebrow">Listing details</p><h2 id="manager-editor-title">{property ? 'Edit property' : 'Add a property'}</h2></div><button type="button" onClick={onCancel}>Cancel</button></div>
    <form onSubmit={submit}>
      <label className="manager-field-wide">Listing title<input required maxLength={160} value={input.title} onChange={text('title')} /></label>
      <label className="manager-field-wide">Address<input required maxLength={200} value={input.addressLine1} onChange={text('addressLine1')} /></label>
      <label>City<input required value={input.city} onChange={text('city')} /></label><label>County<input required value={input.county} onChange={text('county')} /></label>
      <label>Price in euro<input required min="1" type="number" value={input.priceCents ? input.priceCents / 100 : ''} onChange={number('priceCents', 100)} /></label>
      <label>Bedrooms<input required min="0" max="20" type="number" value={input.bedrooms || ''} onChange={number('bedrooms')} /></label>
      <label>Property type<select value={input.propertyType} onChange={text('propertyType')}><option value="detached">Detached</option><option value="semi_detached">Semi-detached</option><option value="terraced">Terraced</option><option value="apartment">Apartment</option></select></label>
      {property && <label>Publication status<select value={input.status} onChange={text('status')}><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></label>}
      <label>Longitude<input required min="-180" max="180" step="any" type="number" value={input.longitude || ''} onChange={number('longitude')} /></label><label>Latitude<input required min="-90" max="90" step="any" type="number" value={input.latitude || ''} onChange={number('latitude')} /></label>
      {error && <p className="manager-form-error manager-field-wide" role="alert">{error}</p>}
      <div className="manager-form-actions manager-field-wide"><button type="button" onClick={onCancel}>Cancel</button><button type="submit">{property ? 'Save changes' : 'Create draft'}</button></div>
    </form>
  </section>
}

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}

function readinessChecks(property: ManagedProperty) {
  return [
    { label: 'Title and address', complete: Boolean(property.title && property.addressLine1), guidance: 'Add the listing title and street address in property facts.' },
    { label: 'City and county', complete: Boolean(property.city && property.county), guidance: 'Set the location in property facts.' },
    { label: 'Asking price', complete: property.priceCents > 0, guidance: 'Set a positive asking price in property facts.' },
    { label: 'Bedrooms and property type', complete: property.bedrooms >= 0 && Boolean(property.propertyType), guidance: 'Review the bedroom count and property type.' },
    { label: 'Map coordinates', complete: Number.isFinite(property.longitude) && Number.isFinite(property.latitude) && (property.longitude !== 0 || property.latitude !== 0), guidance: 'Add the property coordinates in property facts.' },
    { label: 'Photography', complete: property.media.some((item) => item.kind === 'image'), guidance: 'Use Photos & floor plans below to upload photography and choose a cover.' },
    { label: 'Floor plan', complete: property.media.some((item) => item.kind === 'floor_plan'), guidance: 'Choose Floor plan in Photos & floor plans below to upload a measured drawing.' },
    { label: 'Video or 360° tour', complete: property.media.some((item) => item.kind === 'video' || item.kind === 'panorama'), guidance: 'Use the video upload or Kuula tour form on this listing.' },
  ]
}

function completeness(property: ManagedProperty) {
  const checks = readinessChecks(property)
  return Math.round(checks.filter((check) => check.complete).length / checks.length * 100)
}

function ManagerReadinessChecklist({ property, onEdit }: { property: ManagedProperty; onEdit: () => void }) {
  const checks = readinessChecks(property)
  const missing = checks.filter((check) => !check.complete).length
  return <details className="manager-readiness-checklist">
    <summary>Review checklist · {missing ? `${missing} missing` : 'All items present'}</summary>
    <p>Content presence only—not verification of accuracy or a publication approval.</p>
    <ul aria-label={`Readiness checks for ${property.title}`}>
      {checks.map((check) => <li key={check.label}>
        <div><strong>{check.label}</strong><span>{check.complete ? 'Complete' : 'Missing'}</span></div>
        {!check.complete && <p>{check.guidance}</p>}
      </li>)}
    </ul>
    <button type="button" onClick={onEdit}>Edit property facts</button>
  </details>
}

function ManagerTourPreview({ property }: { property: ManagedProperty }) {
  const [open, setOpen] = useState(false)
  const panorama = property.media.find((media) => media.kind === 'panorama')
  if (!panorama) return null
  return <section className="manager-tour-preview" aria-label={`Tour preview for ${property.title}`}>
    <button type="button" aria-expanded={open} aria-controls={`tour-preview-${property.id}`} onClick={() => setOpen((value) => !value)}>{open ? 'Close tour preview' : 'Preview saved 360° tour'}</button>
    {open && <div id={`tour-preview-${property.id}`}>
      <p>Manager preview only. Opening this viewer does not publish the listing.</p>
      <div className="manager-tour-preview-stage"><Suspense fallback={<p role="status">Preparing tour preview…</p>}>
        <SpatialMediaViewer key={panorama.url} source={{ provider: 'embed', embedUrl: panorama.url, title: `${property.title} manager preview`, posterUrl: property.media.find((media) => media.kind === 'image')?.url }} />
      </Suspense></div>
    </div>}
  </section>
}

function workflowStage(property: ManagedProperty) {
  if (property.status === 'archived') return 'Archived'
  if (property.status === 'published') return 'Live'
  const score = completeness(property)
  if (score >= 88) return 'Ready for review'
  if (score >= 50) return 'Media capture'
  return 'Draft setup'
}

function workflowStageKey(property: ManagedProperty) {
  return workflowStage(property).toLowerCase().replaceAll(' ', '-')
}

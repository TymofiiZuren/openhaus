import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import './App.css'
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
} from './api/manager'

type ManagerState =
  | { status: 'checking' }
  | { status: 'signed-out' }
  | { status: 'loading' }
  | { status: 'ready'; properties: ManagedProperty[] }
  | { status: 'error'; message: string }

const euros = new Intl.NumberFormat('en-IE', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
})

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
    fetchManagedProperties(controller.signal)
      .then((properties) => setState({ status: 'ready', properties }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        if (error instanceof ManagerAuthenticationError) {
          setState({ status: 'signed-out' })
          return
        }
        setState({ status: 'error', message: 'The manager workspace could not be loaded.' })
      })
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
  return (
    <div className="manager-shell">
      <header className="site-header manager-header">
        <a className="wordmark" href="/" aria-label="OpenHaus home">OpenHaus</a>
        {isSignedIn && <button className="manager-text-button" type="button" onClick={signOut}>Sign out</button>}
      </header>
      <main className="manager-main">
        {(state.status === 'checking' || state.status === 'loading') && (
          <div className="manager-centred" role="status"><span className="spinner" />Loading manager workspace…</div>
        )}
        {(state.status === 'signed-out' || state.status === 'error') && (
          <ManagerLogin onSubmit={signIn} error={state.status === 'error' ? state.message : undefined} />
        )}
        {state.status === 'ready' && <ManagerDashboard properties={state.properties} />}
      </main>
    </div>
  )
}

function ManagerLogin({ onSubmit, error }: { onSubmit: (email: string, password: string) => void; error?: string }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  function submit(event: FormEvent) {
    event.preventDefault()
    onSubmit(email, password)
  }

  return (
    <section className="manager-login" aria-labelledby="manager-login-title">
      <p className="eyebrow">Private workspace</p>
      <h1 id="manager-login-title">Manager sign in</h1>
      <p className="manager-login-copy">A focused workspace for reviewing listings, media and publication status.</p>
      <form onSubmit={submit}>
        <label>Email address<input name="email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>Password<input name="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {error && <p className="manager-form-error" role="alert">{error}</p>}
        <button type="submit">Sign in</button>
      </form>
      <a href="/">Return to public listings</a>
    </section>
  )
}

function ManagerDashboard({ properties }: { properties: ManagedProperty[] }) {
  const [items, setItems] = useState(properties)
  const [editing, setEditing] = useState<ManagedProperty | 'new'>()
  const [saveError, setSaveError] = useState<string>()
  const published = items.filter((property) => property.status === 'published').length

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
        <div className="manager-heading-actions"><div className="manager-summary" aria-label="Portfolio summary"><span><strong>{items.length}</strong> Total listings</span><span><strong>{published}</strong> Published</span></div><button className="manager-primary-button" type="button" onClick={() => setEditing('new')}>Add property</button></div>
      </div>
      {editing && <ManagerPropertyForm property={editing === 'new' ? undefined : editing} onCancel={() => setEditing(undefined)} onSave={save} error={saveError} />}
      {items.length === 0 ? (
        <div className="manager-empty"><h2>No properties yet</h2><p>Your first listing will appear here.</p></div>
      ) : (
        <div className="manager-property-list">
          {items.map((property) => (
            <article className="manager-property-row" key={property.id}>
              <div><span className={`manager-status manager-status-${property.status}`}>{titleCase(property.status)}</span><h2>{property.title}</h2><p>{property.addressLine1}, {property.city}, Co. {property.county}</p></div>
              <div className="manager-property-meta"><dl><div><dt>Price</dt><dd>{euros.format(property.priceCents / 100)}</dd></div><div><dt>Bedrooms</dt><dd>{property.bedrooms}</dd></div><div><dt>Type</dt><dd>{titleCase(property.propertyType)}</dd></div></dl><div className="manager-row-actions"><button type="button" aria-label={`Edit ${property.title}`} onClick={() => setEditing(property)}>Edit listing</button>{property.status === 'published' && <a href={`/properties/${property.id}`}>View public listing <span aria-hidden="true">→</span></a>}</div><ManagerVideoUpload property={property} /></div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

type UploadState = { status: 'idle' } | { status: 'busy'; job?: MediaJob } | { status: 'ready' } | { status: 'error'; message: string }

function ManagerVideoUpload({ property }: { property: ManagedProperty }) {
  const [file, setFile] = useState<File>()
  const [state, setState] = useState<UploadState>({ status: 'idle' })
  const controller = useRef<AbortController | undefined>(undefined)
  useEffect(() => () => controller.current?.abort(), [])

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
      setState(completed.status === 'ready' ? { status: 'ready' } : { status: 'error', message: completed.errorMessage || 'Video processing failed.' })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setState({ status: 'error', message: 'The video could not be uploaded. Try again.' })
    }
  }

  return <form className="manager-video-upload" onSubmit={upload}>
    <label><span>Add video tour</span><input aria-label={`Choose video for ${property.title}`} type="file" accept="video/mp4,video/quicktime,.mp4,.mov" onChange={chooseFile} disabled={state.status === 'busy'} /></label>
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

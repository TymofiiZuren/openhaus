import { useEffect, useState, type FormEvent } from 'react'
import './App.css'
import {
  fetchManagedProperties,
  loginManager,
  logoutManager,
  ManagerAuthenticationError,
  type ManagedProperty,
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
        <span className="manager-label">Manager workspace</span>
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
      <p className="manager-login-copy">Review and manage the homes entrusted to OpenHaus.</p>
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
  return (
    <section className="manager-dashboard" aria-labelledby="manager-properties-title">
      <div className="manager-dashboard-heading">
        <div><p className="eyebrow">Portfolio</p><h1 id="manager-properties-title">Your properties</h1></div>
        <p>{properties.length} {properties.length === 1 ? 'listing' : 'listings'}</p>
      </div>
      {properties.length === 0 ? (
        <div className="manager-empty"><h2>No properties yet</h2><p>Your first listing will appear here.</p></div>
      ) : (
        <div className="manager-property-list">
          {properties.map((property) => (
            <article className="manager-property-row" key={property.id}>
              <div><span className={`manager-status manager-status-${property.status}`}>{titleCase(property.status)}</span><h2>{property.title}</h2><p>{property.addressLine1}, {property.city}, Co. {property.county}</p></div>
              <dl><div><dt>Price</dt><dd>{euros.format(property.priceCents / 100)}</dd></div><div><dt>Bedrooms</dt><dd>{property.bedrooms}</dd></div><div><dt>Type</dt><dd>{titleCase(property.propertyType)}</dd></div></dl>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}

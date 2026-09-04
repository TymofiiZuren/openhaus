import { useEffect, useRef, useState, type FormEvent } from 'react'
import { clientSessionHintKey, SiteHeader, type ClientSessionStatus } from './SiteHeader'
import { AuthFields } from './AuthFields'
import { fetchClientSavedProperties, removeClientSavedProperty, saveClientProperty } from './api/clientSavedProperties'
import type { Property } from './api/properties'
import './App.css'
import './ClientApp.css'

type Client = { id: string; email: string }
const euros = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
async function readClient(response: Response): Promise<Client> {
  const data = await response.json()
  if (typeof data?.client?.id !== 'string' || typeof data?.client?.email !== 'string') throw new Error('Invalid account response')
  return data.client
}

export function ClientApp({ pathname = '/client' }: { pathname?: string }) {
  const register = pathname.replace(/\/$/, '') === '/client/register'
  const [status, setStatus] = useState<ClientSessionStatus>('loading')
  const [client, setClient] = useState<Client | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [savedProperties, setSavedProperties] = useState<Property[]>([])
  const [savedStatus, setSavedStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const feedback = useRef<HTMLParagraphElement>(null)
  useEffect(() => { if (error || message) feedback.current?.focus() }, [error, message])
  useEffect(() => {
    try {
      if (status === 'authenticated' && client) localStorage.setItem(clientSessionHintKey, 'active')
      else if (status === 'anonymous' || status === 'disabled') localStorage.removeItem(clientSessionHintKey)
    } catch { /* Account state still comes from the server when storage is unavailable. */ }
  }, [client, status])
  useEffect(() => {
    const previous = document.title
    document.title = 'Client account — OpenHaus'
    return () => { document.title = previous }
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    async function check() {
      try {
        const response = await fetch('/api/v1/client/session', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal })
        if (controller.signal.aborted) return
        if (response.status === 401) setStatus('anonymous')
        else if (response.status === 404) setStatus('disabled')
        else if (response.ok) {
          const account = await readClient(response)
          if (!controller.signal.aborted) { setClient(account); setStatus('authenticated') }
        } else setStatus('unavailable')
      } catch { if (!controller.signal.aborted) setStatus('unavailable') }
    }
    void check()
    return () => controller.abort()
  }, [attempt])

  useEffect(() => {
    if (status !== 'authenticated') return
    const controller = new AbortController()
    fetchClientSavedProperties(controller.signal)
      .then(items => { if (!controller.signal.aborted) { setSavedProperties(items); setSavedStatus('ready') } })
      .catch(() => { if (!controller.signal.aborted) setSavedStatus('error') })
    return () => controller.abort()
  }, [status])

  async function importBrowserShortlist() {
    setBusy(true); setError(''); setMessage('')
    try {
      const value: unknown = JSON.parse(localStorage.getItem('openhaus:comparison:v1') ?? '[]')
      const ids = Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string').slice(0, 4) : []
      if (ids.length === 0) { setMessage('Your browser comparison is empty. Add homes from the property catalogue first.'); return }
      await Promise.all(ids.map(saveClientProperty))
      setSavedProperties(await fetchClientSavedProperties())
      setSavedStatus('ready')
      setMessage(`${ids.length} ${ids.length === 1 ? 'home' : 'homes'} saved to your account.`)
    } catch { setError('Your browser shortlist could not be imported. Please try again.') }
    finally { setBusy(false) }
  }

  async function removeSaved(propertyID: string) {
    setBusy(true); setError(''); setMessage('')
    try {
      await removeClientSavedProperty(propertyID)
      setSavedProperties(current => current.filter(property => property.id !== propertyID))
      setMessage('Home removed from your saved properties.')
    } catch { setError('The saved home could not be removed. Please try again.') }
    finally { setBusy(false) }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setError(''); setMessage('')
    const bytes = new TextEncoder().encode(password).length
    if (bytes > 72 || (register && bytes < 12)) { setError('Use a password between 12 and 72 bytes. Accented characters may use more than one byte.'); return }
    setBusy(true)
    try {
      const response = await fetch(register ? '/api/v1/client/accounts' : '/api/v1/client/session', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim(), password }),
      })
      if (register && response.status === 202) {
        setPassword(''); setMessage('Registration processed. Sign in with your existing or newly created development account. Email ownership has not been verified.')
      } else if (!register && response.status === 200) {
        setClient(await readClient(response)); setPassword(''); setSavedStatus('loading'); setStatus('authenticated')
      } else if (response.status === 429) setError('Too many attempts. Wait 15 minutes before trying again.')
      else if (response.status === 401) setError('Email or password was not accepted. Check your details and try again.')
      else if (response.status === 400) setError('Check your email and password, then try again.')
      else setError('Account access is unavailable. Please try again later.')
    } catch { setError('Could not reach account services. Check your connection and try again.') }
    finally { setBusy(false) }
  }
  async function logout() {
    setBusy(true); setError(''); setMessage('')
    try {
      const response = await fetch('/api/v1/client/session', { method: 'DELETE', credentials: 'same-origin' })
      if (response.status !== 204) throw new Error('Logout failed')
      setClient(null); setStatus('anonymous'); setPassword(''); setSavedProperties([]); setSavedStatus('loading')
    } catch { setError('We could not confirm sign-out. Please try again before leaving this shared device.') }
    finally { setBusy(false) }
  }

  return <div className="site-shell">
    <a className="skip-link" href="#client-content">Skip to content</a>
    <SiteHeader pathname={pathname} client={client} clientSessionStatus={status} />
    <main className="client-main" id="client-content">
      <header className="client-intro"><p className="eyebrow">OpenHaus / {register ? 'Registration' : 'Sign in'}</p><h1>{status === 'authenticated' ? 'Your client account.' : register ? 'Make room for what’s next.' : 'Welcome back.'}</h1><a href="/#explore">Continue browsing without signing in</a></header>
      <section className="client-panel" aria-label="Client account" aria-busy={status === 'loading' || busy}>
        {status === 'loading' && <p role="status">Checking account availability…</p>}
        {status === 'disabled' && <><h2>Client accounts are not enabled.</h2><p>Sign-in is unavailable on this installation. Browsing, comparisons and property notes work without an account.</p><a href="/#explore">Return to the property map</a></>}
        {status === 'unavailable' && <><h2>Account services are unavailable.</h2><p>Check your connection and try again. Your saved browser notes are unaffected.</p><button onClick={() => { setStatus('loading'); setAttempt(value => value + 1) }}>Try again</button></>}
        {status === 'authenticated' && client && <><p className="eyebrow">Signed in</p><h2>{client.email}</h2><p>Your saved properties now follow this account. Private notes remain in this browser until the next account-data stage.</p><div className="client-account-actions"><button type="button" disabled={busy} onClick={() => void importBrowserShortlist()}>Import browser comparison</button><button type="button" disabled={busy} onClick={() => void logout()}>{busy ? 'Please wait…' : 'Sign out'}</button></div><div className="client-links"><a href="/#explore">Continue your property search</a><a href="/privacy">Manage browser data</a></div><section className="client-saved" aria-labelledby="saved-properties-title"><div><p className="eyebrow">Buyer workspace</p><h3 id="saved-properties-title">Saved properties</h3></div>{savedStatus === 'loading' && <p role="status">Loading saved properties…</p>}{savedStatus === 'error' && <p role="alert">Saved properties are temporarily unavailable.</p>}{savedStatus === 'ready' && savedProperties.length === 0 && <p>No account-saved homes yet. Save a home from its property page or import your browser comparison.</p>}{savedProperties.map(property => {
          const cover = property.media.find(item => item.kind === 'image')?.url ?? '/media/placeholders/architectural-home.svg'
          return <article key={property.id}><img src={cover} alt="" loading="lazy" /><div><span>{property.city} · Co. {property.county}</span><strong>{property.title}</strong><small>{euros.format(property.priceCents / 100)} · {property.bedrooms} bedrooms</small></div><div><a href={`/properties/${property.id}`}>View home</a><button type="button" disabled={busy} onClick={() => void removeSaved(property.id)}>Remove</button></div></article>
        })}</section></>}
        {status === 'anonymous' && <><h2>{register ? 'Create your account' : 'Sign in to OpenHaus'}</h2>
          <form onSubmit={event => void submit(event)}>
            <AuthFields prefix="client" email={email} password={password} onEmail={setEmail} onPassword={setPassword} disabled={busy} register={register} />
            <button disabled={busy} type="submit">{busy ? 'Please wait…' : register ? 'Create development account' : 'Sign in'}</button>
          </form><p className="client-notice">Development accounts only. Use a test address and a unique password. Email verification and password recovery are not available yet.</p><div className="client-links"><a href={register ? '/client/login' : '/client/register'}>{register ? 'Already have an account? Sign in' : 'Create a development account'}</a><a href="/manager/login">Staff sign-in</a></div></>}
        {(error || message) && <p ref={feedback} tabIndex={-1} className="client-feedback" role={error ? 'alert' : 'status'}>{error || message}</p>}
      </section>
    </main>
    <footer className="client-footer"><a href="/privacy">Privacy information</a><a href="/contact">Contact</a><span>Independent demonstration project</span></footer>
  </div>
}

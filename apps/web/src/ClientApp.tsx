import { useEffect, useRef, useState, type FormEvent } from 'react'
import { clientSessionHintKey, SiteHeader, type ClientSessionStatus } from './SiteHeader'
import { displayAccountIdentifier } from './accountIdentifier'
import { useWorkspaceAnchor } from './useWorkspaceAnchor'
import { AuthFields } from './AuthFields'
import { fetchClientSavedProperties, removeClientSavedProperty, saveClientProperty } from './api/clientSavedProperties'
import { fetchClientSavedSearches, removeClientSavedSearch, type ClientSavedSearch } from './api/clientSavedSearches'
import type { Property } from './api/properties'
import './App.css'
import './ClientApp.css'

type Client = { id: string; email: string }
const euros = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
function savedSearchHref(item: ClientSavedSearch): string {
  const query = new URLSearchParams()
  if (item.county) query.set('county', item.county)
  if (item.area) query.set('area', item.area)
  if (item.query) query.set('query', item.query)
  if (item.minimumBedrooms) query.set('beds', String(item.minimumBedrooms))
  if (item.propertyType !== 'all') query.set('type', item.propertyType)
  if (item.maximumPrice) query.set('maxPrice', String(item.maximumPrice / 100))
  if (item.spatialOnly) query.set('tour', 'true')
  return `/?${query.toString()}#homes`
}
async function readClient(response: Response): Promise<Client> {
  const data = await response.json()
  if (typeof data?.client?.id !== 'string' || typeof data?.client?.email !== 'string') throw new Error('Invalid account response')
  return data.client
}

export function ClientApp({ pathname = '/client' }: { pathname?: string }) {
  const register = pathname.replace(/\/$/, '') === '/client/register'
  const [status, setStatus] = useState<ClientSessionStatus>('loading')
  const [client, setClient] = useState<Client | null>(null)
  useWorkspaceAnchor(status === 'authenticated')
  const [attempt, setAttempt] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [savedProperties, setSavedProperties] = useState<Property[]>([])
  const [savedStatus, setSavedStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [savedSearches, setSavedSearches] = useState<ClientSavedSearch[]>([])
  const [searchesStatus, setSearchesStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [deletionPassword, setDeletionPassword] = useState('')
  const [deletionConfirmation, setDeletionConfirmation] = useState('')
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

  async function loadSavedSearches() {
    setSearchesStatus('loading'); setError(''); setMessage('')
    try { setSavedSearches(await fetchClientSavedSearches()); setSearchesStatus('ready') }
    catch { setSearchesStatus('error') }
  }

  async function deleteSavedSearch(searchID: string) {
    setBusy(true); setError(''); setMessage('')
    try { await removeClientSavedSearch(searchID); setSavedSearches(current => current.filter(item => item.id !== searchID)); setMessage('Saved search removed.') }
    catch { setError('The saved search could not be removed. Please try again.') }
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

  async function changePassword(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setError(''); setMessage('')
    const currentBytes = new TextEncoder().encode(currentPassword).length
    const newBytes = new TextEncoder().encode(newPassword).length
    if (newPassword !== passwordConfirmation) { setError('The new passwords do not match.'); return }
    if (currentBytes > 72 || newBytes < 12 || newBytes > 72) { setError('Use a new password between 12 and 72 bytes. Accented characters may use more than one byte.'); return }
    setBusy(true)
    try {
      const response = await fetch('/api/v1/client/password', {
        method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword, newPassword }),
      })
      if (response.status === 204) {
        setClient(null); setStatus('anonymous'); setSavedProperties([]); setSavedStatus('loading')
        setCurrentPassword(''); setNewPassword(''); setPasswordConfirmation('')
        setMessage('Password updated. Every client session was signed out; sign in again with your new password.')
      } else if (response.status === 401) setError('Your current password was not accepted. No changes were made.')
      else if (response.status === 400) setError('Use a new password between 12 and 72 bytes.')
      else setError('Password security is temporarily unavailable. Please try again later.')
    } catch { setError('Could not reach account services. Check your connection and try again.') }
    finally { setBusy(false) }
  }

  async function deleteAccount(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setError(''); setMessage('')
    const passwordBytes = new TextEncoder().encode(deletionPassword).length
    if (deletionConfirmation !== 'DELETE') { setError('Type DELETE exactly before permanently deleting your account.'); return }
    if (passwordBytes === 0 || passwordBytes > 72) { setError('Enter your current password before deleting your account.'); return }
    setBusy(true)
    try {
      const response = await fetch('/api/v1/client/account', {
        method: 'DELETE', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword: deletionPassword }),
      })
      if (response.status === 204) {
        setClient(null); setStatus('anonymous'); setSavedProperties([]); setSavedStatus('loading'); setSavedSearches([]); setSearchesStatus('idle')
        setDeletionPassword(''); setDeletionConfirmation('')
        setMessage('Your buyer account has been deleted. Its saved homes, searches, notes and sessions were removed with it.')
      } else if (response.status === 401) setError('Your current password was not accepted. The account was not deleted.')
      else if (response.status === 429) setError('Too many attempts. Wait 15 minutes before trying again.')
      else if (response.status === 400) setError('Enter your current password and confirmation again.')
      else setError('Account deletion is temporarily unavailable. No account data was changed.')
    } catch { setError('Could not reach account services. The account was not deleted.') }
    finally { setBusy(false) }
  }

  return <div className="site-shell">
    <a className="skip-link" href="#client-content">Skip to content</a>
    <SiteHeader pathname={pathname} client={client} clientSessionStatus={status} onClientSignOut={logout} />
    <main className={`client-main ${status === 'authenticated' ? 'client-main-authenticated' : ''}`} id="client-content">
      <header className="client-intro"><p className="eyebrow">OpenHaus / {register ? 'Registration' : 'Sign in'}</p><h1>{status === 'authenticated' ? 'Your client account.' : register ? 'Make room for what’s next.' : 'Welcome back.'}</h1><a href="/#explore">Continue browsing without signing in</a></header>
      <section className="client-panel" aria-label="Client account" aria-busy={status === 'loading' || busy}>
        {status === 'loading' && <p role="status">Checking account availability…</p>}
        {status === 'disabled' && <><h2>Client accounts are not enabled.</h2><p>Sign-in is unavailable on this installation. Browsing, comparisons and property notes work without an account.</p><a href="/#explore">Return to the property map</a></>}
        {status === 'unavailable' && <><h2>Account services are unavailable.</h2><p>Check your connection and try again. Your saved browser notes are unaffected.</p><button onClick={() => { setStatus('loading'); setAttempt(value => value + 1) }}>Try again</button></>}
        {status === 'authenticated' && client && <><section className="client-account-overview" aria-label="Account overview"><span className="client-profile-mark" aria-hidden="true">{client.email.slice(0, 1).toUpperCase()}</span><div className="client-profile-heading"><p className="eyebrow">Client profile</p><h2>{client.email}</h2><p>Your saved properties, searches and private notes stay connected to this account.</p></div><dl className="client-profile"><div><dt>Account identifier</dt><dd title={client.id}>{displayAccountIdentifier(client.id)}</dd></div><div><dt>Workspace</dt><dd>Buyer</dd></div></dl><div className="client-account-actions"><button type="button" disabled={busy} onClick={() => void importBrowserShortlist()}>Import browser comparison</button><button type="button" disabled={busy} onClick={() => void logout()}>{busy ? 'Please wait…' : 'Sign out'}</button></div></section><nav className="client-links" aria-label="Account shortcuts"><a href="/#explore">Continue your property search <span aria-hidden="true">→</span></a><a href="/api/v1/client/export" download>Download my account data <span aria-hidden="true">↓</span></a><a href="/privacy">Manage browser data <span aria-hidden="true">→</span></a></nav><div className="client-workspace-grid"><section className="client-searches" aria-labelledby="saved-searches-title"><div><p className="eyebrow">Property alerts</p><h3 id="saved-searches-title">Saved searches</h3></div>{searchesStatus === 'idle' && <button type="button" onClick={() => void loadSavedSearches()}>Load saved searches</button>}{searchesStatus === 'loading' && <p role="status">Loading saved searches…</p>}{searchesStatus === 'error' && <><p role="alert">Saved searches are temporarily unavailable.</p><button type="button" onClick={() => void loadSavedSearches()}>Try again</button></>}{searchesStatus === 'ready' && savedSearches.length === 0 && <p>No account-saved searches yet. Set filters in the catalogue and choose Save search.</p>}{savedSearches.map(item => <article key={item.id}><div><strong>{item.location}</strong><span>{item.minimumBedrooms ? `${item.minimumBedrooms}+ bedrooms` : 'Any bedrooms'} · {item.propertyType === 'all' ? 'All property types' : item.propertyType} · {item.frequency}</span></div><a href={savedSearchHref(item)}>View results</a><button type="button" disabled={busy} onClick={() => void deleteSavedSearch(item.id)}>Remove</button></article>)}</section><section className="client-saved" aria-labelledby="saved-properties-title"><div><p className="eyebrow">Buyer workspace</p><h3 id="saved-properties-title">Saved properties</h3></div>{savedStatus === 'loading' && <p role="status">Loading saved properties…</p>}{savedStatus === 'error' && <p role="alert">Saved properties are temporarily unavailable.</p>}{savedStatus === 'ready' && savedProperties.length === 0 && <p>No account-saved homes yet. Save a home from its property page or import your browser comparison.</p>}{savedProperties.map(property => {
          const cover = property.media.find(item => item.kind === 'image')?.url ?? '/media/placeholders/architectural-home.svg?v=3'
          return <article key={property.id}><img src={cover} alt="" loading="lazy" /><div><span>{property.city} · Co. {property.county}</span><strong>{property.title}</strong><small>{euros.format(property.priceCents / 100)} · {property.bedrooms} bedrooms</small></div><div><a href={`/properties/${property.id}`}>View home</a><button type="button" disabled={busy} onClick={() => void removeSaved(property.id)}>Remove</button></div></article>
        })}</section></div><section className="client-security" aria-labelledby="client-security-title"><div><p className="eyebrow">Account security</p><h3 id="client-security-title">Change password</h3><p>This signs your client account out on every device.</p></div><form onSubmit={event => void changePassword(event)}><label htmlFor="client-current-password">Current password</label><input id="client-current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} disabled={busy} required /><label htmlFor="client-new-password">New password</label><input id="client-new-password" type="password" autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} disabled={busy} minLength={12} maxLength={72} required /><label htmlFor="client-confirm-password">Confirm new password</label><input id="client-confirm-password" type="password" autoComplete="new-password" value={passwordConfirmation} onChange={event => setPasswordConfirmation(event.target.value)} disabled={busy} minLength={12} maxLength={72} required /><button type="submit" disabled={busy}>{busy ? 'Updating…' : 'Change password'}</button></form></section><section className="client-danger" aria-labelledby="client-danger-title"><div><p className="eyebrow">Permanent action</p><h3 id="client-danger-title">Delete buyer account</h3><p>This permanently removes your account, saved homes, saved searches, private notes and every active buyer session.</p></div><form onSubmit={event => void deleteAccount(event)}><label htmlFor="client-delete-password">Current password for account deletion</label><input id="client-delete-password" type="password" autoComplete="current-password" value={deletionPassword} onChange={event => setDeletionPassword(event.target.value)} disabled={busy} maxLength={72} required /><label htmlFor="client-delete-confirmation">Type DELETE to confirm</label><input id="client-delete-confirmation" type="text" autoComplete="off" value={deletionConfirmation} onChange={event => setDeletionConfirmation(event.target.value)} disabled={busy} required /><button type="submit" disabled={busy || deletionConfirmation !== 'DELETE'}>{busy ? 'Deleting…' : 'Delete my account permanently'}</button></form></section></>}
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

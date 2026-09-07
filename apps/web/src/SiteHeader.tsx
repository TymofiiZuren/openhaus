import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { ThemeControl } from './ThemeControl'
import { HeaderAccountLinks } from './HeaderAccountLinks'
import { openHausGuideEvent, OpenHausGuideButton } from './OpenHausGuideButton'
import './App.css'
import './SiteHeader.css'

const links = [['Find homes', '/#explore'], ['Match Lab', '/match'], ['Area Index', '/areas'], ['Services', '/services'], ['Agents', '/agents'], ['About', '/about'], ['Contact', '/contact'], ['Help', '/help'], ['Privacy', '/privacy']] as const

export type ClientSessionStatus = 'loading' | 'anonymous' | 'authenticated' | 'disabled' | 'unavailable'
export type HeaderClient = { id: string; email: string }
export const clientSessionHintKey = 'openhaus:client-session:v1'
export const managerSessionHintKey = 'openhaus:manager-session:v1'

function setSessionHint(key: string, active: boolean) {
  try {
    if (active) localStorage.setItem(key, 'active')
    else localStorage.removeItem(key)
  } catch { /* Secure cookies remain authoritative when browser storage is unavailable. */ }
}

type SiteHeaderProps = {
  pathname?: string
  client?: HeaderClient | null
  clientSessionStatus?: ClientSessionStatus
  onClientSignOut?: () => void | Promise<void>
  manager?: HeaderClient | null
  managerSessionStatus?: ClientSessionStatus
  onManagerSignOut?: () => void | Promise<void>
  onOpenGuide?: (anchor: HTMLElement) => void
  guideOpen?: boolean
}

export function SiteHeader({ pathname = window.location.pathname, client, clientSessionStatus, onClientSignOut, manager, managerSessionStatus, onManagerSignOut, onOpenGuide, guideOpen = false }: SiteHeaderProps) {
  const current = pathname.replace(/\/$/, '') || '/'
  const isCurrent = (href: string) => href === '/#explore'
    ? current === '/'
    : current === href || current.startsWith(`${href}/`)
  const [menuOpen, setMenuOpen] = useState(false)
  const [discoveredClient, setDiscoveredClient] = useState<HeaderClient | null>(null)
  const [discoveredStatus, setDiscoveredStatus] = useState<ClientSessionStatus>('loading')
  const [discoveredManager, setDiscoveredManager] = useState<HeaderClient | null>(null)
  const [managerPending, setManagerPending] = useState(() => clientSessionStatus === undefined)
  const menuId = useId()
  const menuTrigger = useRef<HTMLButtonElement>(null)
  const menuClose = useRef<HTMLButtonElement>(null)
  const menuPanel = useRef<HTMLElement>(null)
  const controlledSession = clientSessionStatus !== undefined
  const controlledManagerSession = managerSessionStatus !== undefined
  const sessionStatus = controlledSession ? clientSessionStatus : discoveredStatus
  const sessionClient = controlledSession ? client ?? null : discoveredClient
  const signedIn = sessionStatus === 'authenticated' && sessionClient !== null
  const managerIdentity = controlledManagerSession ? manager ?? null : discoveredManager
  const managerSignedIn = managerIdentity !== null && (!controlledManagerSession || managerSessionStatus === 'authenticated')
  const managerStatusPending = controlledManagerSession ? managerSessionStatus === 'loading' : managerPending
  const shouldDiscoverSession = !controlledSession
  const shouldDiscoverManager = !controlledManagerSession && !controlledSession && sessionStatus !== 'loading' && !signedIn

  useEffect(() => {
    if (!shouldDiscoverSession) return
    const controller = new AbortController()
    async function discoverClientSession() {
      try {
        const response = await fetch('/api/v1/client/session', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal })
        if (controller.signal.aborted) return
        if (response.status === 401) {
          setSessionHint(clientSessionHintKey, false)
          setDiscoveredStatus('anonymous')
        } else if (response.status === 404) {
          setSessionHint(clientSessionHintKey, false)
          setDiscoveredStatus('disabled')
        } else if (response.ok) {
          const data = await response.json()
          if (typeof data?.client?.id !== 'string' || typeof data?.client?.email !== 'string') {
            setDiscoveredStatus('unavailable')
            return
          }
          setSessionHint(clientSessionHintKey, true)
          setDiscoveredClient(data.client)
          setDiscoveredStatus('authenticated')
        } else setDiscoveredStatus('unavailable')
      } catch {
        if (!controller.signal.aborted) setDiscoveredStatus('unavailable')
      }
    }
    void discoverClientSession()
    return () => controller.abort()
  }, [shouldDiscoverSession])

  useEffect(() => {
    if (!shouldDiscoverManager) return
    const controller = new AbortController()
    async function discoverManagerSession() {
      try {
        const response = await fetch('/api/v1/manager/session', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal })
        if (controller.signal.aborted) return
        if (response.ok) {
          const data = await response.json()
          if (typeof data?.manager?.id === 'string' && typeof data?.manager?.email === 'string') {
            setSessionHint(managerSessionHintKey, true)
            setDiscoveredManager(data.manager)
          } else {
            setSessionHint(managerSessionHintKey, false)
            setDiscoveredManager(null)
          }
        }
        else if (response.status === 401) {
          setSessionHint(managerSessionHintKey, false)
          setDiscoveredManager(null)
        }
      } catch { /* The public catalogue remains available if manager status cannot be checked. */ }
      finally { if (!controller.signal.aborted) setManagerPending(false) }
    }
    void discoverManagerSession()
    return () => controller.abort()
  }, [shouldDiscoverManager])

  async function signOut() {
    try {
      if (signedIn) {
        if (onClientSignOut) await onClientSignOut()
        else {
          const response = await fetch('/api/v1/client/session', { method: 'DELETE', credentials: 'same-origin' })
          if (response.status === 204) {
            setSessionHint(clientSessionHintKey, false)
            setDiscoveredClient(null)
            setDiscoveredStatus('anonymous')
          }
        }
        return
      }
      if (!managerSignedIn) return
      if (onManagerSignOut) {
        await onManagerSignOut()
        return
      }
      const response = await fetch('/api/v1/manager/session', { method: 'DELETE', credentials: 'same-origin' })
      if (response.status === 204) {
        setSessionHint(managerSessionHintKey, false)
        setDiscoveredManager(null)
      }
    } catch { /* Keep the verified identity visible until the server confirms sign out. */ }
  }

  function closeMenu() {
    setMenuOpen(false)
    menuTrigger.current?.focus()
  }

  function openGuideFromMenu() {
    const anchor = menuTrigger.current
    setMenuOpen(false)
    if (onOpenGuide && anchor) onOpenGuide(anchor)
    else window.dispatchEvent(new CustomEvent(openHausGuideEvent, { detail: anchor }))
  }

  useEffect(() => {
    if (!menuOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    menuClose.current?.focus()
    return () => { document.body.style.overflow = previousOverflow }
  }, [menuOpen])

  function handleMenuKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeMenu()
      return
    }
    if (event.key !== 'Tab') return
    const focusable = Array.from(menuPanel.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? [])
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable.at(-1)
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return <><header className="public-header">
      <a className="public-header-brand" href="/" aria-label="OpenHaus home">OpenHaus<span aria-hidden="true">.</span></a>
      <nav className="public-header-navigation" aria-label="Primary navigation">
        {links.map(([label, href]) => <a key={href} href={href} aria-current={isCurrent(href) ? 'page' : undefined}>{label}</a>)}
      </nav>
      <div className="public-header-actions"><OpenHausGuideButton open={guideOpen} onOpen={onOpenGuide} /><ThemeControl /><HeaderAccountLinks signedIn={signedIn} managerSignedIn={!signedIn && managerSignedIn} identity={signedIn ? sessionClient : managerIdentity} pending={sessionStatus === 'loading' || managerStatusPending} onSignOut={signedIn || managerSignedIn ? signOut : undefined} /><button ref={menuTrigger} className="public-menu-trigger" type="button" aria-label="Open navigation" aria-expanded={menuOpen} aria-controls={menuId} onClick={() => setMenuOpen(true)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg></button></div>
    </header>
    {menuOpen && createPortal(<div className="public-drawer-layer" onKeyDown={handleMenuKeyDown}>
      <button className="public-menu-scrim" type="button" tabIndex={-1} aria-label="Close navigation backdrop" onClick={closeMenu} />
      <aside ref={menuPanel} className="public-side-menu" id={menuId} role="dialog" aria-modal="true" aria-labelledby={`${menuId}-title`}>
        <header><div><span>Navigation</span><h2 id={`${menuId}-title`}>Explore OpenHaus</h2></div><button ref={menuClose} type="button" aria-label="Close navigation" onClick={closeMenu}>×</button></header>
        <nav aria-label="Mobile navigation">{links.map(([label, href], index) => <a key={href} href={href} aria-current={isCurrent(href) ? 'page' : undefined}><span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>{label}</a>)}</nav>
        <div className="public-side-menu-account"><p>Your OpenHaus</p><button type="button" onClick={openGuideFromMenu}>OpenHaus guide</button><a href="/contact">Contact</a><a href="/privacy">Privacy information</a>{managerSignedIn ? <>
          <a href="/manager?action=new#manager-editor-title">Add property</a>
          <a href="/manager/analytics">Analytics overview</a><a href="/manager">Property portfolio</a><a href="/manager/profile">Account profile</a>
          <a href="/manager/analytics#coverage-title">Media readiness</a>
          <a href="/manager/profile#manager-security-title">Account security</a>
          <button type="button" onClick={() => void signOut()}>Log out</button>
        </> : <><a href="/client/login">{signedIn ? 'Client account' : 'Client sign in'}</a>{signedIn && <>
          <a href="/client#saved-properties-title">Saved homes</a>
          <a href="/client#saved-searches-title">Saved searches</a>
          <a href="/client#client-security-title">Account security</a>
          <button type="button" onClick={() => void signOut()}>Log out</button>
        </>}{!signedIn && <><a href="/manager/login">Manager sign in</a><a className="public-side-menu-listing" href="/manager/login">List a property</a></>}</>}</div>
      </aside>
    </div>, document.body)}
  </>
}

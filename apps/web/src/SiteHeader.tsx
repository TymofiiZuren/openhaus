import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { ThemeControl } from './ThemeControl'
import { HeaderAccountLinks } from './HeaderAccountLinks'
import './App.css'
import './SiteHeader.css'

const links = [['Find homes', '/#explore'], ['About', '/about'], ['Contact', '/contact'], ['Help', '/help'], ['Privacy', '/privacy']] as const

export function SiteHeader({ pathname = window.location.pathname }: { pathname?: string }) {
  const current = pathname.replace(/\/$/, '') || '/'
  const [menuOpen, setMenuOpen] = useState(false)
  const menuId = useId()
  const menuTrigger = useRef<HTMLButtonElement>(null)
  const menuClose = useRef<HTMLButtonElement>(null)
  const menuPanel = useRef<HTMLElement>(null)

  function closeMenu() {
    setMenuOpen(false)
    menuTrigger.current?.focus()
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
        {links.map(([label, href]) => <a key={href} href={href} aria-current={current === href ? 'page' : undefined}>{label}</a>)}
      </nav>
      <div className="public-header-actions"><ThemeControl /><HeaderAccountLinks /><button ref={menuTrigger} className="public-menu-trigger" type="button" aria-label="Open navigation" aria-expanded={menuOpen} aria-controls={menuId} onClick={() => setMenuOpen(true)}><span aria-hidden="true" /><span aria-hidden="true" /></button></div>
    </header>
    {menuOpen && createPortal(<div className="public-drawer-layer" onKeyDown={handleMenuKeyDown}>
      <button className="public-menu-scrim" type="button" tabIndex={-1} aria-label="Close navigation backdrop" onClick={closeMenu} />
      <aside ref={menuPanel} className="public-side-menu" id={menuId} role="dialog" aria-modal="true" aria-labelledby={`${menuId}-title`}>
        <header><div><span>Navigation</span><h2 id={`${menuId}-title`}>Explore OpenHaus</h2></div><button ref={menuClose} type="button" aria-label="Close navigation" onClick={closeMenu}>×</button></header>
        <nav aria-label="Mobile navigation">{links.map(([label, href], index) => <a key={href} href={href} aria-current={current === href ? 'page' : undefined}><span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>{label}</a>)}</nav>
        <div className="public-side-menu-account"><p>Your OpenHaus</p><a href="/client/login">Client sign in</a><a href="/manager/login">Manager sign in</a><a className="public-side-menu-listing" href="/manager/login">List a property</a></div>
      </aside>
    </div>, document.body)}
  </>
}

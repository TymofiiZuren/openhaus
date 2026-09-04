import { useEffect, useId, useRef } from 'react'
import { useHoverDropdown } from './useHoverDropdown'
import './HeaderAccountLinks.css'

export function HeaderAccountLinks({ signedIn = false, pending = false }: { signedIn?: boolean; pending?: boolean }) {
  const { open, setOpen, onPointerEnter, onPointerLeave, onTriggerClick } = useHoverDropdown()
  const root = useRef<HTMLDivElement>(null)
  const accountTrigger = useRef<HTMLButtonElement>(null)
  const id = useId()
  useEffect(() => {
    if (!open) return
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [open, setOpen])
  const triggerLabel = signedIn ? 'My account' : pending ? 'Account' : 'Sign in'
  const triggerName = signedIn ? 'Account options' : pending ? 'Account status' : 'Sign in options'
  const menuName = signedIn ? 'Account options' : 'Sign-in options'
  return <div className="header-account-links" ref={root} onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
  }} onKeyDown={event => {
    if (event.key === 'Escape' && open) { event.stopPropagation(); accountTrigger.current?.focus(); setOpen(false) }
  }}>
    <button ref={accountTrigger} type="button" aria-label={triggerName} aria-expanded={open} aria-controls={`${id}-account`} onClick={onTriggerClick}>{triggerLabel}</button>
    {open && <nav className="header-account-menu" id={`${id}-account`} aria-label={menuName}>
      <div className="header-account-menu-intro">
        <span className="header-account-avatar" aria-hidden="true">OH</span>
        <span><small>{signedIn ? 'Signed in' : 'Account access'}</small><strong>{signedIn ? 'Your OpenHaus' : 'Choose a workspace'}</strong></span>
      </div>
      <div className="header-account-menu-links">
        <a href="/client/login" aria-label={signedIn ? 'Client account' : 'Client sign in'}><span><strong>{signedIn ? 'Client account' : 'Client sign in'}</strong><small>{signedIn ? 'Saved homes, comparisons and notes' : 'Continue your property search'}</small></span><span aria-hidden="true">→</span></a>
        {!signedIn && <a href="/manager/login" aria-label="Manager sign in / List a property"><span><strong>Manager sign in / List a property</strong><small>Publish and manage listings</small></span><span aria-hidden="true">→</span></a>}
      </div>
    </nav>}
  </div>
}

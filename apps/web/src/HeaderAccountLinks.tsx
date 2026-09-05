import { useEffect, useId, useRef } from 'react'
import { useHoverDropdown } from './useHoverDropdown'
import './HeaderAccountLinks.css'

type AccountIdentity = { id: string; email: string }

export function HeaderAccountLinks({ signedIn = false, managerSignedIn = false, identity, pending = false, onSignOut }: { signedIn?: boolean; managerSignedIn?: boolean; identity?: AccountIdentity | null; pending?: boolean; onSignOut?: () => void }) {
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
  const triggerLabel = managerSignedIn ? 'Manager' : signedIn ? 'My account' : pending ? 'Account' : 'Sign in'
  const triggerName = managerSignedIn ? 'Manager account options' : signedIn ? 'Account options' : pending ? 'Account status' : 'Sign in options'
  const menuName = managerSignedIn ? 'Manager account options' : signedIn ? 'Account options' : 'Sign-in options'
  return <div className="header-account-links" ref={root} onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
  }} onKeyDown={event => {
    if (event.key === 'Escape' && open) { event.stopPropagation(); accountTrigger.current?.focus(); setOpen(false) }
  }}>
    <button ref={accountTrigger} type="button" aria-label={triggerName} aria-expanded={open} aria-controls={`${id}-account`} onClick={onTriggerClick}>{triggerLabel}</button>
    {open && <nav className="header-account-menu" id={`${id}-account`} aria-label={menuName}>
      <div className="header-account-menu-intro">
        <span className="header-account-avatar" aria-hidden="true">OH</span>
        <span><small>{managerSignedIn || signedIn ? (identity?.email ?? 'Signed in') : 'Account access'}</small><strong>{managerSignedIn ? 'Manager workspace' : signedIn ? 'Your OpenHaus' : 'Choose a workspace'}</strong></span>
      </div>
      <div className="header-account-menu-links">
        {managerSignedIn ? <>
          <a href="/manager/analytics" aria-label="Analytics overview"><span><strong>Analytics overview</strong><small>Portfolio health and media coverage</small></span><span aria-hidden="true">→</span></a>
          <a href="/manager" aria-label="Property portfolio"><span><strong>Property portfolio</strong><small>Review and manage every listing</small></span><span aria-hidden="true">→</span></a>
          <a href="/manager/profile" aria-label="Account profile"><span><strong>Account profile</strong><small>Identity and session information</small></span><span aria-hidden="true">→</span></a>
          <a href="/" aria-label="Public site"><span><strong>Public site</strong><small>See the buyer experience</small></span><span aria-hidden="true">→</span></a>
        </> : <>
          <a href="/client/login" aria-label={signedIn ? 'Client account' : 'Client sign in'}><span><strong>{signedIn ? 'Client account' : 'Client sign in'}</strong><small>{signedIn ? 'Saved homes, comparisons and notes' : 'Continue your property search'}</small></span><span aria-hidden="true">→</span></a>
          {!signedIn && <a href="/manager/login" aria-label="Manager sign in / List a property"><span><strong>Manager sign in / List a property</strong><small>Publish and manage listings</small></span><span aria-hidden="true">→</span></a>}
        </>}
      </div>
    </nav>}
    {(signedIn || managerSignedIn) && onSignOut && <button className="header-sign-out" type="button" onClick={onSignOut}>Log out</button>}
  </div>
}

import { useEffect, useId, useRef, useState } from 'react'
import { useHoverDropdown } from './useHoverDropdown'
import './HeaderAccountLinks.css'

type AccountIdentity = { id: string; email: string }

export function HeaderAccountLinks({ signedIn = false, managerSignedIn = false, identity, pending = false, onSignOut }: { signedIn?: boolean; managerSignedIn?: boolean; identity?: AccountIdentity | null; pending?: boolean; onSignOut?: () => void | Promise<void> }) {
  const { open, setOpen, onPointerEnter, onPointerLeave, onTriggerClick } = useHoverDropdown()
  const root = useRef<HTMLDivElement>(null)
  const accountTrigger = useRef<HTMLButtonElement>(null)
  const id = useId()
  const [signingOut, setSigningOut] = useState(false)
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
  async function signOut() {
    if (!onSignOut || signingOut) return
    setSigningOut(true)
    try { await onSignOut() }
    finally { setSigningOut(false) }
  }
  return <div className="header-account-links" onKeyDown={event => {
    if (event.key === 'Escape' && open) { event.stopPropagation(); accountTrigger.current?.focus(); setOpen(false) }
  }}>
    <div className="header-account-control" ref={root} onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave} onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
    }}>
      <button className="header-account-trigger" ref={accountTrigger} type="button" aria-label={triggerName} aria-expanded={open} aria-controls={`${id}-account`} onClick={onTriggerClick}>{triggerLabel}</button>
      {open && <nav className="header-account-menu" id={`${id}-account`} aria-label={menuName}>
        <div className="header-account-menu-intro">
          <span className="header-account-avatar" aria-hidden="true">OH</span>
          <span><small>{managerSignedIn || signedIn ? (identity?.email ?? 'Signed in') : 'Account access'}</small><strong>{managerSignedIn ? 'Manager workspace' : signedIn ? 'Your OpenHaus' : 'Choose a workspace'}</strong></span>
        </div>
        <div className="header-account-menu-links">
          {managerSignedIn ? <>
            <a href="/manager?action=new#manager-editor-title" aria-label="Add property"><span><strong>Add property</strong><small>Start a new listing draft</small></span><span aria-hidden="true">+</span></a>
            <a href="/manager/analytics" aria-label="Analytics overview"><span><strong>Analytics overview</strong><small>Portfolio health and media coverage</small></span><span aria-hidden="true">→</span></a>
            <a href="/manager" aria-label="Property portfolio"><span><strong>Property portfolio</strong><small>Review and manage every listing</small></span><span aria-hidden="true">→</span></a>
            <a href="/manager/profile" aria-label="Account profile"><span><strong>Account profile</strong><small>Identity and session information</small></span><span aria-hidden="true">→</span></a>
            <a href="/manager/analytics#coverage-title" aria-label="Media readiness"><span><strong>Media readiness</strong><small>Review photography and tour coverage</small></span><span aria-hidden="true">→</span></a>
            <a href="/manager/profile#manager-security-title" aria-label="Account security"><span><strong>Account security</strong><small>Password and active sessions</small></span><span aria-hidden="true">→</span></a>
          </> : <>
            <a href="/client/login" aria-label={signedIn ? 'Client account' : 'Client sign in'}><span><strong>{signedIn ? 'Client account' : 'Client sign in'}</strong><small>{signedIn ? 'Saved homes, comparisons and notes' : 'Continue your property search'}</small></span><span aria-hidden="true">→</span></a>
            {signedIn && <>
              <a href="/client#saved-properties-title" aria-label="Saved homes"><span><strong>Saved homes</strong><small>Return to your personal shortlist</small></span><span aria-hidden="true">→</span></a>
              <a href="/client#saved-searches-title" aria-label="Saved searches"><span><strong>Saved searches</strong><small>Revisit your saved search criteria</small></span><span aria-hidden="true">→</span></a>
              <a href="/match" aria-label="Match Lab"><span><strong>Match Lab</strong><small>Rank homes around your priorities</small></span><span aria-hidden="true">→</span></a>
              <a href="/client#client-security-title" aria-label="Account security"><span><strong>Account security</strong><small>Manage your password</small></span><span aria-hidden="true">→</span></a>
            </>}
            {!signedIn && <a href="/manager/login" aria-label="Manager sign in / List a property"><span><strong>Manager sign in / List a property</strong><small>Publish and manage listings</small></span><span aria-hidden="true">→</span></a>}
          </>}
        </div>
      </nav>}
    </div>
    {(signedIn || managerSignedIn) && onSignOut && <button className="header-sign-out" type="button" disabled={signingOut} onPointerEnter={() => setOpen(false)} onFocus={() => setOpen(false)} onClick={() => void signOut()}>{signingOut ? 'Logging out…' : 'Log out'}</button>}
  </div>
}

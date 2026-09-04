import { useEffect, useId, useRef } from 'react'
import { useHoverDropdown } from './useHoverDropdown'
import './HeaderAccountLinks.css'

export function HeaderAccountLinks() {
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
  return <div className="header-account-links" ref={root} onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
  }} onKeyDown={event => {
    if (event.key === 'Escape' && open) { event.stopPropagation(); accountTrigger.current?.focus(); setOpen(false) }
  }}>
    <button ref={accountTrigger} type="button" aria-label="Sign in options" aria-expanded={open} aria-controls={`${id}-account`} onClick={onTriggerClick}>Sign in</button>
    {open && <nav className="header-account-menu" id={`${id}-account`} aria-label="Sign-in options">
      <a href="/client/login">Client sign in</a><a href="/manager/login">Manager sign in / List a property</a>
    </nav>}
  </div>
}

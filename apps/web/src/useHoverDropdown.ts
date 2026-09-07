import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react'

const dropdownOpenEvent = 'openhaus:navigation-dropdown-open'

// Share pointer behavior while each control owns its focus and dismissal rules.
export function useHoverDropdown() {
  const [open, setOpen] = useState(false)
  const dropdownID = useRef(Symbol('navigation-dropdown'))
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const openedByHover = useRef(false)
  const cancelClose = () => clearTimeout(closeTimer.current)
  const claimNavigationLayer = () => window.dispatchEvent(new CustomEvent(dropdownOpenEvent, { detail: dropdownID.current }))
  useEffect(() => {
    const closeForPeer = (event: Event) => {
      if ((event as CustomEvent<symbol>).detail === dropdownID.current) return
      cancelClose()
      openedByHover.current = false
      setOpen(false)
    }
    window.addEventListener(dropdownOpenEvent, closeForPeer)
    return () => {
      clearTimeout(closeTimer.current)
      window.removeEventListener(dropdownOpenEvent, closeForPeer)
    }
  }, [])

  return {
    open, setOpen,
    onPointerEnter(event: PointerEvent<HTMLDivElement>) {
      if (event.pointerType !== 'mouse') return
      cancelClose()
      claimNavigationLayer()
      openedByHover.current = !open
      setOpen(true)
    },
    onPointerLeave(event: PointerEvent<HTMLDivElement>) {
      if (event.pointerType !== 'mouse') return
      const container = event.currentTarget
      cancelClose()
      closeTimer.current = setTimeout(() => {
        if (!container.contains(document.activeElement)) setOpen(false)
      }, 200)
    },
    onTriggerClick(event: MouseEvent<HTMLButtonElement>) {
      cancelClose()
      // The initial mouse click must not undo the preceding hover-open.
      if (event.detail > 0 && openedByHover.current) setOpen(true)
      else if (open) setOpen(false)
      else {
        claimNavigationLayer()
        setOpen(true)
      }
      openedByHover.current = false
    },
  }
}

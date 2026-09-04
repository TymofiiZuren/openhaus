import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react'

// Share pointer behavior while each control owns its focus and dismissal rules.
export function useHoverDropdown() {
  const [open, setOpen] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const openedByHover = useRef(false)
  const cancelClose = () => clearTimeout(closeTimer.current)
  useEffect(() => () => clearTimeout(closeTimer.current), [])

  return {
    open, setOpen,
    onPointerEnter(event: PointerEvent<HTMLDivElement>) {
      if (event.pointerType !== 'mouse') return
      cancelClose()
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
      else setOpen(value => !value)
      openedByHover.current = false
    },
  }
}

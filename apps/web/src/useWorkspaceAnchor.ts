import { useEffect } from 'react'

// Account content is mounted after authentication, after native anchor scrolling.
export function useWorkspaceAnchor(ready: boolean) {
  useEffect(() => {
    if (!ready) return
    let frame = 0
    const scroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const target = document.getElementById(window.location.hash.slice(1))
        if (target?.closest('.client-main, .manager-main')) target.scrollIntoView?.({ block: 'start', behavior: 'instant' })
      })
    }
    scroll()
    window.addEventListener('hashchange', scroll)
    return () => { cancelAnimationFrame(frame); window.removeEventListener('hashchange', scroll) }
  }, [ready])
}

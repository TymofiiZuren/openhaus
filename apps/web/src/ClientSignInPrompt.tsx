import { useEffect, useState } from 'react'
import './ClientSignInPrompt.css'

export function ClientSignInPrompt() {
  const [state, setState] = useState<'hidden' | 'anonymous' | 'signed-in'>('hidden')
  useEffect(() => {
    const controller = new AbortController()
    async function check() {
      try {
        const response = await fetch('/api/v1/client/session', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal })
        if (controller.signal.aborted) return
        if (response.status === 401) setState('anonymous')
        else if (response.status === 200) {
          const data = await response.json()
          if (!controller.signal.aborted && typeof data?.client?.id === 'string' && typeof data?.client?.email === 'string') setState('signed-in')
        }
      } catch { /* Browsing and local notes do not depend on account availability. */ }
    }
    void check()
    return () => controller.abort()
  }, [])
  if (state === 'hidden') return null
  return <aside className="client-sign-in-prompt" aria-label="Optional sign-in">
    <p>{state === 'anonymous' ? 'Already have a development account?' : 'You’re signed in.'} Notes remain in this browser and are not synced to an account.</p>
    <a href={state === 'anonymous' ? '/client/login' : '/client'} target="_blank" rel="noreferrer">{state === 'anonymous' ? 'Sign in' : 'Manage sign-in'}</a><small>Opens a new tab so your unfinished notes stay here.</small>
  </aside>
}

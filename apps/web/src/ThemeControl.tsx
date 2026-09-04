import { useEffect, useId, useRef, useState } from 'react'

type Appearance = 'system' | 'light' | 'dark'
const preferenceKey = 'openhaus-appearance'

function readAppearance(): Appearance {
  try {
    const saved = localStorage.getItem(preferenceKey)
    if (saved === 'light' || saved === 'dark') return saved
  } catch { /* Storage is optional; the control still works in this tab. */ }
  return 'system'
}

export function ThemeControl() {
  const [appearance, setAppearance] = useState<Appearance>(readAppearance)
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  useEffect(() => {
    if (!open) return
    const dismiss = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [open])
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    const apply = () => {
      document.documentElement.dataset.theme = appearance === 'system' ? (media?.matches ? 'dark' : 'light') : appearance
    }
    apply()
    media?.addEventListener('change', apply)
    return () => media?.removeEventListener('change', apply)
  }, [appearance])
  useEffect(() => {
    const sync = (event: StorageEvent) => { if (event.key === preferenceKey || event.key === null) setAppearance(readAppearance()) }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])
  const label = appearance[0].toUpperCase() + appearance.slice(1)
  return <div className="theme-picker" ref={container} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
  }} onKeyDown={event => {
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      setOpen(false)
      trigger.current?.focus()
    }
  }}><button ref={trigger} type="button" className="theme-switch" aria-label={`Theme: ${label}. Choose appearance`} aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(value => !value)}><svg key={appearance} aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    {appearance === 'dark' ? <path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z" /> : appearance === 'light' ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></> : <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8m-4-4v4" /></>}
  </svg><span>{label}</span></button>
    {open && <div id={panelId} className="theme-options" role="group" aria-label="Appearance">
      <p>Set the mood</p>
      {(['light', 'dark', 'system'] as const).map(option => <button key={option} type="button" aria-pressed={appearance === option} onClick={() => {
        setAppearance(option)
        try { localStorage.setItem(preferenceKey, option) } catch { /* Storage is optional. */ }
        setOpen(false)
        trigger.current?.focus()
      }}><span>{option === 'system' ? 'System' : option === 'light' ? 'Light' : 'Dark'}</span>{' '}<span className="theme-option-detail">{option === 'system' ? 'Follow device' : option === 'light' ? 'Warm daylight' : 'After hours'}</span><span className="theme-option-check" aria-hidden="true">{appearance === option ? '✓' : ''}</span></button>)}
    </div>}
  </div>
}

import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { ThemeControl } from './ThemeControl'

afterEach(() => { localStorage.clear(); delete document.documentElement.dataset.theme; Reflect.deleteProperty(document, 'startViewTransition'); vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('changes themes without animation when reduced motion is requested', async () => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduced-motion'), addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  const transition = vi.fn()
  Object.defineProperty(document, 'startViewTransition', { configurable: true, value: transition })
  render(<ThemeControl />)
  await userEvent.click(screen.getByRole('button', { name: /Theme: Dark/ }))
  await userEvent.click(screen.getByRole('button', { name: /Light White interface/ }))
  expect(document.documentElement).toHaveAttribute('data-theme', 'light')
  expect(transition).not.toHaveBeenCalled()
})

it('keeps the browser chrome color in sync with the selected theme', async () => {
  const themeColor = document.createElement('meta')
  themeColor.name = 'theme-color'
  document.head.append(themeColor)
  const view = render(<ThemeControl />)

  expect(themeColor).toHaveAttribute('content', '#000000')
  await userEvent.click(screen.getByRole('button', { name: /Theme: Dark/ }))
  await userEvent.click(screen.getByRole('button', { name: /Light White interface/ }))
  expect(themeColor).toHaveAttribute('content', '#ffffff')

  view.unmount()
  themeColor.remove()
})

it('applies theme changes without waiting for a browser transition', async () => {
  const transition = vi.fn((update: () => void) => {
    update()
    return { finished: Promise.resolve(), ready: Promise.resolve(), skipTransition: vi.fn() }
  })
  Object.defineProperty(document, 'startViewTransition', { configurable: true, value: transition })
  render(<ThemeControl />)
  expect(transition).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: /Theme: Dark/ }))
  await userEvent.click(screen.getByRole('button', { name: /Light White interface/ }))
  expect(transition).not.toHaveBeenCalled()
  expect(document.documentElement).toHaveAttribute('data-theme', 'light')
  Reflect.deleteProperty(document, 'startViewTransition')
})

it('applies the latest theme immediately during rapid changes', async () => {
  const themeColor = document.createElement('meta')
  themeColor.name = 'theme-color'
  document.head.append(themeColor)
  const pendingUpdates: Array<() => void> = []
  Object.defineProperty(document, 'startViewTransition', { configurable: true, value: vi.fn((update: () => void) => {
    pendingUpdates.push(update)
    return { finished: new Promise(() => {}), ready: Promise.resolve(), skipTransition: vi.fn() }
  }) })
  render(<ThemeControl />)

  await userEvent.click(screen.getByRole('button', { name: /Theme: Dark/ }))
  await userEvent.click(screen.getByRole('button', { name: /Light White interface/ }))

  expect(document.documentElement).toHaveAttribute('data-theme', 'light')
  expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute('content', '#ffffff')
  expect(pendingUpdates).toHaveLength(0)
  themeColor.remove()
})

it('applies and remembers dark mode across remounts', async () => {
  const user = userEvent.setup()
  const view = render(<ThemeControl />)
  await user.click(screen.getByRole('button', { name: /Theme: Dark/ }))
  await user.click(screen.getByRole('button', { name: /Dark Black interface/ }))
  expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
  expect(localStorage.getItem('openhaus-appearance')).toBe('dark')
  view.unmount()
  render(<ThemeControl />)
  expect(screen.getByRole('button', { name: /Theme: Dark/ })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /Theme: Dark/ }))
  await user.click(screen.getByRole('button', { name: /Light White interface/ }))
  expect(document.documentElement).toHaveAttribute('data-theme', 'light')
})

it('follows system changes only while system mode is selected', async () => {
  let changed = () => {}
  const media = { matches: true, addEventListener: vi.fn((_, callback) => { changed = callback }), removeEventListener: vi.fn() }
  vi.stubGlobal('matchMedia', () => media)
  localStorage.setItem('openhaus-appearance', 'system')
  const user = userEvent.setup()
  const view = render(<ThemeControl />)
  expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
  media.matches = false
  act(() => changed())
  expect(document.documentElement).toHaveAttribute('data-theme', 'light')
  await user.click(screen.getByRole('button', { name: /Theme: System/ }))
  await user.click(screen.getByRole('button', { name: /Dark Black interface/ }))
  act(() => changed())
  expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
  view.unmount()
  expect(media.removeEventListener).toHaveBeenCalled()
  vi.unstubAllGlobals()
})

it('stays usable when preference storage is blocked', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
  render(<ThemeControl />)
  await userEvent.click(screen.getByRole('button', { name: /Theme: Dark/ }))
  await userEvent.click(screen.getByRole('button', { name: /Light White interface/ }))
  expect(document.documentElement).toHaveAttribute('data-theme', 'light')
})

it('synchronizes another tab and ignores invalid saved values', () => {
  localStorage.setItem('openhaus-appearance', 'invalid')
  render(<ThemeControl />)
  expect(screen.getByRole('button', { name: /Theme: Dark/ })).toBeInTheDocument()
  localStorage.setItem('openhaus-appearance', 'dark')
  act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'openhaus-appearance' })))
  expect(screen.getByRole('button', { name: /Theme: Dark/ })).toBeInTheDocument()
  expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
})

it('supports keyboard dismissal, selection and outside clicks', async () => {
  const user = userEvent.setup()
  render(<><ThemeControl /><button>Outside</button></>)
  const trigger = screen.getByRole('button', { name: /Theme: Dark/ })
  expect(trigger).toHaveTextContent(/^Dark$/)
  expect(trigger.querySelector('.theme-chevron')).toBeNull()
  await user.click(trigger)
  expect(trigger).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByRole('button', { name: /Dark Black interface/ })).toHaveAttribute('aria-pressed', 'true')
  await user.tab()
  expect(screen.getByRole('button', { name: /Light White interface/ })).toHaveFocus()
  await user.keyboard('{Escape}')
  expect(trigger).toHaveFocus()
  expect(screen.queryByRole('group', { name: 'Appearance' })).not.toBeInTheDocument()
  await user.keyboard('{Enter}')
  await user.tab()
  await user.keyboard('{Enter}')
  expect(document.documentElement).toHaveAttribute('data-theme', 'light')
  expect(trigger).toHaveFocus()
  await user.click(trigger)
  await user.click(screen.getByRole('button', { name: 'Outside' }))
  expect(trigger).toHaveAttribute('aria-expanded', 'false')
})

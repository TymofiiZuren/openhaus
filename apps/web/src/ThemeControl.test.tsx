import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { ThemeControl } from './ThemeControl'

afterEach(() => { localStorage.clear(); delete document.documentElement.dataset.theme; vi.restoreAllMocks() })

it('applies and remembers dark mode across remounts', async () => {
  const user = userEvent.setup()
  const view = render(<ThemeControl />)
  await user.click(screen.getByRole('button', { name: /Theme: System/ }))
  await user.click(screen.getByRole('button', { name: /Dark After hours/ }))
  expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
  expect(localStorage.getItem('openhaus-appearance')).toBe('dark')
  view.unmount()
  render(<ThemeControl />)
  expect(screen.getByRole('button', { name: /Theme: Dark/ })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /Theme: Dark/ }))
  await user.click(screen.getByRole('button', { name: /Light Warm daylight/ }))
  expect(document.documentElement).toHaveAttribute('data-theme', 'light')
})

it('follows system changes only while system mode is selected', async () => {
  let changed = () => {}
  const media = { matches: true, addEventListener: vi.fn((_, callback) => { changed = callback }), removeEventListener: vi.fn() }
  vi.stubGlobal('matchMedia', () => media)
  const user = userEvent.setup()
  const view = render(<ThemeControl />)
  expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
  media.matches = false
  act(() => changed())
  expect(document.documentElement).toHaveAttribute('data-theme', 'light')
  await user.click(screen.getByRole('button', { name: /Theme: System/ }))
  await user.click(screen.getByRole('button', { name: /Dark After hours/ }))
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
  await userEvent.click(screen.getByRole('button', { name: /Theme: System/ }))
  await userEvent.click(screen.getByRole('button', { name: /Dark After hours/ }))
  expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
})

it('synchronizes another tab and ignores invalid saved values', () => {
  localStorage.setItem('openhaus-appearance', 'invalid')
  render(<ThemeControl />)
  expect(screen.getByRole('button', { name: /Theme: System/ })).toBeInTheDocument()
  localStorage.setItem('openhaus-appearance', 'dark')
  act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'openhaus-appearance' })))
  expect(screen.getByRole('button', { name: /Theme: Dark/ })).toBeInTheDocument()
  expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
})

it('supports keyboard dismissal, selection and outside clicks', async () => {
  const user = userEvent.setup()
  render(<><ThemeControl /><button>Outside</button></>)
  const trigger = screen.getByRole('button', { name: /Theme: System/ })
  expect(trigger).toHaveTextContent(/^System$/)
  expect(trigger.querySelector('.theme-chevron')).toBeNull()
  await user.click(trigger)
  expect(trigger).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByRole('button', { name: /System Follow device/ })).toHaveAttribute('aria-pressed', 'true')
  await user.tab()
  expect(screen.getByRole('button', { name: /Light Warm daylight/ })).toHaveFocus()
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

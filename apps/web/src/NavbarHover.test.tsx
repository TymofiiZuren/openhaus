import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'
import { HeaderAccountLinks } from './HeaderAccountLinks'
import { ThemeControl } from './ThemeControl'

it.each([
  [HeaderAccountLinks, 'Sign in options', 'navigation', 'Sign-in options'],
  [ThemeControl, /Choose appearance/, 'group', 'Appearance'],
] as const)('opens the navbar dropdown on hover and lets the pointer enter its panel (%s)', async (Control, label, role, name) => {
  const user = userEvent.setup()
  render(<><Control /><button>Outside</button></>)
  const trigger = screen.getByRole('button', { name: label })
  await user.hover(trigger)
  const panel = screen.getByRole(role, { name })
  expect(trigger).toHaveAttribute('aria-expanded', 'true')
  await user.hover(panel)
  expect(panel).toBeVisible()
  await user.hover(screen.getByRole('button', { name: 'Outside' }))
  await act(() => new Promise(resolve => setTimeout(resolve, 250)))
  expect(screen.queryByRole(role, { name })).not.toBeInTheDocument()
})

it.each([HeaderAccountLinks, ThemeControl])('preserves touch toggling and keyboard focus inside a hovered dropdown (%s)', async Control => {
  const user = userEvent.setup()
  render(<><Control /><button>Outside</button></>)
  const trigger = screen.getAllByRole('button')[0]
  await user.pointer({ keys: '[TouchA]', target: trigger })
  expect(trigger).toHaveAttribute('aria-expanded', 'true')
  await user.pointer({ keys: '[TouchA]', target: trigger })
  expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await user.hover(trigger)
  await user.click(trigger)
  expect(trigger).toHaveAttribute('aria-expanded', 'true')
  await user.tab()
  await user.hover(screen.getByRole('button', { name: 'Outside' }))
  await act(() => new Promise(resolve => setTimeout(resolve, 250)))
  expect(trigger).toHaveAttribute('aria-expanded', 'true')
  await user.keyboard('{Escape}')
  expect(trigger).toHaveFocus()
  expect(trigger).toHaveAttribute('aria-expanded', 'false')
})

it('keeps manager access out of an authenticated client menu', async () => {
  const user = userEvent.setup()
  render(<HeaderAccountLinks signedIn />)

  await user.hover(screen.getByRole('button', { name: 'Account options' }))

  const menu = screen.getByRole('navigation', { name: 'Account options' })
  expect(screen.getByRole('button', { name: 'Account options' })).toHaveTextContent('My account')
  expect(menu).toHaveTextContent('Client account')
  expect(menu).not.toHaveTextContent('Manager')
  expect(menu).not.toHaveTextContent('List a property')
})

it('closes the previous navbar dropdown immediately when another opens', async () => {
  const user = userEvent.setup()
  render(<><ThemeControl /><HeaderAccountLinks /></>)

  await user.hover(screen.getByRole('button', { name: /Choose appearance/ }))
  expect(screen.getByRole('group', { name: 'Appearance' })).toBeInTheDocument()

  await user.hover(screen.getByRole('button', { name: 'Sign in options' }))
  expect(screen.queryByRole('group', { name: 'Appearance' })).not.toBeInTheDocument()
  expect(screen.getByRole('navigation', { name: 'Sign-in options' })).toBeInTheDocument()
})

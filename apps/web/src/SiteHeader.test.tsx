import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { clientSessionHintKey, SiteHeader } from './SiteHeader'

afterEach(() => {
  localStorage.removeItem(clientSessionHintKey)
  vi.restoreAllMocks()
})

it('shows the client account when an existing session is active', async () => {
  localStorage.setItem(clientSessionHintKey, 'active')
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ client: { id: 'buyer', email: 'buyer@example.test' } }))

  render(<SiteHeader pathname="/" />)

  expect(await screen.findByRole('button', { name: 'Account options' })).toHaveTextContent('My account')
  expect(screen.queryByRole('button', { name: 'Sign in options' })).not.toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'Open navigation' }))
  const drawer = screen.getByRole('dialog', { name: 'Explore OpenHaus' })
  expect(within(drawer).getByRole('link', { name: 'Client account' })).toHaveAttribute('href', '/client/login')
  expect(within(drawer).queryByRole('link', { name: 'Client sign in' })).not.toBeInTheDocument()
  expect(within(drawer).queryByRole('link', { name: 'Manager sign in' })).not.toBeInTheDocument()
  expect(within(drawer).queryByRole('link', { name: 'List a property' })).not.toBeInTheDocument()
})

it('exposes information pages without opening a menu and marks the current page', () => {
  render(<SiteHeader pathname="/contact" />)
  const navigation = screen.getByRole('navigation', { name: 'Primary navigation' })
  for (const [label, href] of [['Find homes', '/#explore'], ['About', '/about'], ['Contact', '/contact'], ['Help', '/help'], ['Privacy', '/privacy']]) {
    expect(within(navigation).getByRole('link', { name: label })).toHaveAttribute('href', href)
  }
  expect(within(navigation).getByRole('link', { name: 'Contact' })).toHaveAttribute('aria-current', 'page')
  expect(screen.queryByRole('button', { name: 'Information' })).not.toBeInTheDocument()
})

it('opens a focused side menu and closes it with Escape', async () => {
  const user = userEvent.setup()
  render(<SiteHeader pathname="/about" />)

  const trigger = screen.getByRole('button', { name: 'Open navigation' })
  await user.click(trigger)

  const drawer = screen.getByRole('dialog', { name: 'Explore OpenHaus' })
  expect(trigger).toHaveAttribute('aria-expanded', 'true')
  expect(within(drawer).getByRole('link', { name: 'About' })).toHaveAttribute('aria-current', 'page')
  expect(within(drawer).getByRole('link', { name: 'Client sign in' })).toHaveAttribute('href', '/client/login')
  const listingLink = within(drawer).getByRole('link', { name: 'List a property' })
  const closeButton = screen.getByRole('button', { name: 'Close navigation' })
  expect(listingLink).toHaveAttribute('href', '/manager/login')
  expect(closeButton).toHaveFocus()

  await user.keyboard('{Shift>}{Tab}{/Shift}')
  expect(listingLink).toHaveFocus()
  await user.tab()
  expect(closeButton).toHaveFocus()

  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog', { name: 'Explore OpenHaus' })).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
})

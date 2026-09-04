import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'
import { SiteHeader } from './SiteHeader'

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

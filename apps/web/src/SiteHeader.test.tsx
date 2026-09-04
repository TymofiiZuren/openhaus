import { render, screen, within } from '@testing-library/react'
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

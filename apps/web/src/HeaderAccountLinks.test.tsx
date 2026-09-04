import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, it } from 'vitest'
import { HeaderAccountLinks } from './HeaderAccountLinks'

it('groups client and manager sign-in without hiding information pages in a menu', () => {
  render(<HeaderAccountLinks />)
  fireEvent.click(screen.getByRole('button', { name: 'Sign in options' }))
  const accounts = screen.getByRole('navigation', { name: 'Sign-in options' })
  expect(within(accounts).getByRole('link', { name: 'Client sign in' })).toHaveAttribute('href', '/client/login')
  expect(within(accounts).getByRole('link', { name: 'Manager sign in / List a property' })).toHaveAttribute('href', '/manager/login')
  expect(screen.queryByRole('button', { name: 'Information' })).not.toBeInTheDocument()
})

it('closes sign-in with Escape and returns focus to its trigger', () => {
  render(<HeaderAccountLinks />)
  fireEvent.click(screen.getByRole('button', { name: 'Sign in options' }))
  fireEvent.keyDown(screen.getByRole('navigation', { name: 'Sign-in options' }), { key: 'Escape' })
  expect(screen.queryByRole('navigation', { name: 'Sign-in options' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Sign in options' })).toHaveFocus()
})

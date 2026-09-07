import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { HeaderAccountLinks } from './HeaderAccountLinks'

it('offers direct buyer workspace shortcuts', () => {
  render(<HeaderAccountLinks signedIn />)
  fireEvent.click(screen.getByRole('button', { name: 'Account options' }))
  expect(screen.getByRole('link', { name: 'Saved homes' })).toHaveAttribute('href', '/client#saved-properties-title')
  expect(screen.getByRole('link', { name: 'Saved searches' })).toHaveAttribute('href', '/client#saved-searches-title')
  expect(screen.getByRole('link', { name: 'Account security' })).toHaveAttribute('href', '/client#client-security-title')
})

it('offers manager creation and review shortcuts', () => {
  render(<HeaderAccountLinks managerSignedIn />)
  fireEvent.click(screen.getByRole('button', { name: 'Manager account options' }))
  expect(screen.getByRole('link', { name: 'Add property' })).toHaveAttribute('href', '/manager?action=new#manager-editor-title')
  expect(screen.getByRole('link', { name: 'Media readiness' })).toHaveAttribute('href', '/manager/analytics#coverage-title')
})

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

it('replaces sign-in choices with manager workspace links for a manager session', () => {
  const signOut = vi.fn()
  render(<HeaderAccountLinks managerSignedIn identity={{ id: 'manager-1', email: 'manager@example.test' }} onSignOut={signOut} />)
  fireEvent.click(screen.getByRole('button', { name: 'Manager account options' }))
  const accounts = screen.getByRole('navigation', { name: 'Manager account options' })
  expect(within(accounts).getByText('manager@example.test')).toBeVisible()
  expect(within(accounts).getByRole('link', { name: 'Analytics overview' })).toHaveAttribute('href', '/manager/analytics')
  expect(within(accounts).getByRole('link', { name: 'Property portfolio' })).toHaveAttribute('href', '/manager')
  expect(within(accounts).getByRole('link', { name: 'Account profile' })).toHaveAttribute('href', '/manager/profile')
  expect(within(accounts).queryByRole('link', { name: 'Public site' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
  expect(signOut).toHaveBeenCalledOnce()
  expect(within(accounts).queryByRole('link', { name: 'Client sign in' })).not.toBeInTheDocument()
})

it('prevents repeated logout requests while sign out is pending', async () => {
  let finishSignOut: (() => void) | undefined
  const signOut = vi.fn(() => new Promise<void>(resolve => { finishSignOut = resolve }))
  render(<HeaderAccountLinks managerSignedIn identity={{ id: 'manager-1', email: 'manager@example.test' }} onSignOut={signOut} />)

  const logout = screen.getByRole('button', { name: 'Log out' })
  fireEvent.click(logout)
  fireEvent.click(logout)

  expect(signOut).toHaveBeenCalledOnce()
  expect(screen.getByRole('button', { name: 'Logging out…' })).toBeDisabled()
  finishSignOut?.()
})

it('closes manager options when the pointer moves to log out', async () => {
  const user = userEvent.setup()
  render(<HeaderAccountLinks managerSignedIn identity={{ id: 'manager-1', email: 'manager@example.test' }} onSignOut={vi.fn()} />)

  const manager = screen.getByRole('button', { name: 'Manager account options' })
  await user.hover(manager)
  expect(screen.getByRole('navigation', { name: 'Manager account options' })).toBeVisible()

  await user.hover(screen.getByRole('button', { name: 'Log out' }))
  expect(screen.queryByRole('navigation', { name: 'Manager account options' })).not.toBeInTheDocument()
})

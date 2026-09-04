import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { ManagerApp } from './ManagerApp'

afterEach(() => vi.restoreAllMocks())

it('keeps sign-in input after failure and provides a password visibility control', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 401 }))
  render(<ManagerApp />)
  const user = userEvent.setup()
  const email = await screen.findByLabelText('Email address')
  const password = screen.getByLabelText('Password', { exact: true })
  await user.type(email, 'test@example.invalid')
  await user.type(password, crypto.randomUUID())
  await user.click(screen.getByRole('button', { name: 'Show password' }))
  expect(password).toHaveAttribute('type', 'text')
  await user.click(screen.getByRole('button', { name: 'Hide password' }))
  expect(password).toHaveAttribute('type', 'password')
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  await screen.findByRole('alert')
  expect(screen.getByLabelText('Email address')).toHaveValue('test@example.invalid')
  expect(screen.getByLabelText('Password', { exact: true })).toBe(password)
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
})

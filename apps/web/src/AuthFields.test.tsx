import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { AuthFields } from './AuthFields'

it('provides matching labelled fields and an accessible password toggle', () => {
  render(<AuthFields prefix="test" email="" password="" onEmail={() => {}} onPassword={() => {}} />)
  expect(screen.getByLabelText('Email address')).toHaveAttribute('autocomplete', 'username')
  const password = screen.getByLabelText('Password')
  expect(password).toHaveAttribute('type', 'password')
  fireEvent.click(screen.getByRole('button', { name: 'Show password' }))
  expect(password).toHaveAttribute('type', 'text')
  fireEvent.click(screen.getByRole('button', { name: 'Hide password' }))
  expect(password).toHaveAttribute('type', 'password')
})

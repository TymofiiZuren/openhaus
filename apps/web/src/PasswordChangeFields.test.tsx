import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { PasswordChangeFields } from './PasswordChangeFields'

const props = { currentPassword: '', newPassword: 'example new phrase', confirmation: 'different phrase', onCurrentPassword: vi.fn(), onNewPassword: vi.fn(), onConfirmation: vi.fn(), disabled: false }

it('links requirements to the new password and waits for blur before flagging a mismatch', () => {
  const { rerender } = render(<PasswordChangeFields {...props} />)
  expect(screen.getByLabelText('New password')).toHaveAccessibleDescription(/12–72 bytes/)
  const confirmation = screen.getByLabelText('Confirm new password')
  expect(confirmation).not.toHaveAttribute('aria-invalid', 'true')
  fireEvent.blur(confirmation)
  expect(confirmation).toHaveAttribute('aria-invalid', 'true')
  expect(confirmation).toHaveAccessibleDescription('The new passwords do not match.')
  rerender(<PasswordChangeFields {...props} confirmation={props.newPassword} />)
  expect(confirmation).not.toHaveAttribute('aria-invalid', 'true')
  expect(screen.queryByText('The new passwords do not match.')).not.toBeInTheDocument()
})

it('keeps controls disabled during a request and preserves password-manager support', () => {
  render(<PasswordChangeFields {...props} disabled />)
  for (const label of ['Current password', 'New password', 'Confirm new password']) {
    expect(screen.getByLabelText(label)).toBeDisabled()
    expect(screen.getByLabelText(label)).toHaveAttribute('type', 'password')
  }
  expect(screen.getByLabelText('Current password')).toHaveAttribute('autocomplete', 'current-password')
  expect(screen.getByLabelText('New password')).toHaveAttribute('autocomplete', 'new-password')
})

import { useState } from 'react'
import './PasswordChangeFields.css'

export function PasswordChangeFields({ currentPassword, newPassword, confirmation, onCurrentPassword, onNewPassword, onConfirmation, disabled }: {
  currentPassword: string; newPassword: string; confirmation: string
  onCurrentPassword: (value: string) => void; onNewPassword: (value: string) => void; onConfirmation: (value: string) => void
  disabled: boolean
}) {
  const [confirmationVisited, setConfirmationVisited] = useState(false)
  const mismatch = confirmationVisited && confirmation.length > 0 && confirmation !== newPassword
  return <div className="password-change-fields">
    <div className="password-change-field">
      <label htmlFor="client-current-password">Current password</label>
      <input id="client-current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={event => onCurrentPassword(event.target.value)} disabled={disabled} required />
    </div>
    <div className="password-change-field">
      <label htmlFor="client-new-password">New password</label>
      <input id="client-new-password" type="password" autoComplete="new-password" value={newPassword} onChange={event => onNewPassword(event.target.value)} disabled={disabled} minLength={12} maxLength={72} required aria-describedby="client-new-password-hint" />
      <p id="client-new-password-hint">12–72 bytes. Accented characters may use more than one byte. Password managers and pasting are supported.</p>
    </div>
    <div className="password-change-field">
      <label htmlFor="client-confirm-password">Confirm new password</label>
      <input id="client-confirm-password" type="password" autoComplete="new-password" value={confirmation} onChange={event => onConfirmation(event.target.value)} onBlur={() => setConfirmationVisited(true)} disabled={disabled} minLength={12} maxLength={72} required aria-invalid={mismatch || undefined} aria-describedby="client-confirm-password-hint" />
      <p id="client-confirm-password-hint" className={mismatch ? 'password-change-error' : undefined} aria-live="polite">{mismatch ? 'The new passwords do not match.' : 'Enter your new password again to confirm.'}</p>
    </div>
  </div>
}

import { useState } from 'react'
import './AuthFields.css'

export function AuthFields({ prefix, email, password, onEmail, onPassword, disabled = false, register = false }: {
  prefix: string; email: string; password: string; onEmail: (value: string) => void; onPassword: (value: string) => void; disabled?: boolean; register?: boolean
}) {
  const [visible, setVisible] = useState(false)
  return <div className="auth-fields">
    <label htmlFor={`${prefix}-email`}>Email address</label>
    <div className="auth-control"><input id={`${prefix}-email`} name="email" type="email" autoComplete="username" maxLength={320} required value={email} onChange={event => onEmail(event.target.value)} disabled={disabled} /></div>
    <label htmlFor={`${prefix}-password`}>Password</label>
    <div className="auth-control"><input id={`${prefix}-password`} name="password" type={visible ? 'text' : 'password'} autoComplete={register ? 'new-password' : 'current-password'} required value={password} onChange={event => onPassword(event.target.value)} disabled={disabled} aria-describedby={register ? `${prefix}-password-hint` : undefined} /><button type="button" aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible} disabled={disabled} onClick={() => setVisible(value => !value)}>{visible ? 'Hide' : 'Show'}</button></div>
    {register && <p id={`${prefix}-password-hint`}>12–72 bytes. Password managers and pasting are supported.</p>}
  </div>
}

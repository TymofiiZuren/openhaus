import { render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ClientSignInPrompt } from './ClientSignInPrompt'
afterEach(() => vi.unstubAllGlobals())
it('offers optional sign-in when the backend supports it', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })))
  render(<ClientSignInPrompt />)
  expect(await screen.findByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/client/login')
  expect(screen.getByText(/not synced to an account/)).toBeInTheDocument()
})
it.each([404, 503, 200])('does not promote an unavailable or malformed account response (%s)', async status => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status })))
  const { container } = render(<ClientSignInPrompt />)
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(container).toBeEmptyDOMElement()
})

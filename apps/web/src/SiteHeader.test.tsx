import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { clientSessionHintKey, managerSessionHintKey, SiteHeader } from './SiteHeader'

afterEach(() => {
  localStorage.removeItem(clientSessionHintKey)
  localStorage.removeItem(managerSessionHintKey)
  vi.restoreAllMocks()
})

it('shows manager workspace navigation when a manager session is active', async () => {
  localStorage.setItem(managerSessionHintKey, 'active')
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => init?.method === 'DELETE'
    ? new Response(null, { status: 204 })
    : Response.json({ manager: { id: 'manager-1', email: 'manager@example.test' } }))

  render(<SiteHeader pathname="/" />)

  const trigger = await screen.findByRole('button', { name: 'Manager account options' })
  await userEvent.click(trigger)
  const menu = screen.getByRole('navigation', { name: 'Manager account options' })
  expect(within(menu).getByText('manager@example.test')).toBeVisible()
  expect(within(menu).getByRole('link', { name: 'Analytics overview' })).toHaveAttribute('href', '/manager/analytics')
  await userEvent.click(screen.getByRole('button', { name: 'Log out' }))
  expect(fetchMock).toHaveBeenCalledWith('/api/v1/manager/session', expect.objectContaining({ method: 'DELETE' }))
  expect(screen.getByRole('button', { name: 'Sign in options' })).toBeVisible()
})

it('supports a controlled manager session without rediscovering or owning its sign out', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch')
  const onManagerSignOut = vi.fn()

  render(<SiteHeader
    pathname="/manager/analytics"
    clientSessionStatus="anonymous"
    manager={{ id: 'manager-1', email: 'manager@example.test' }}
    managerSessionStatus="authenticated"
    onManagerSignOut={onManagerSignOut}
  />)

  expect(screen.getByRole('button', { name: 'Open navigation' })).toBeVisible()
  await userEvent.click(screen.getByRole('button', { name: 'Manager account options' }))
  expect(screen.getByText('manager@example.test')).toBeVisible()
  await userEvent.click(screen.getByRole('button', { name: 'Log out' }))
  expect(onManagerSignOut).toHaveBeenCalledOnce()
  expect(fetchMock).not.toHaveBeenCalled()
})

it('restores a manager session from its secure cookie when browser hints are missing', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    if (String(input) === '/api/v1/client/session') return new Response(null, { status: 401 })
    if (String(input) === '/api/v1/manager/session') {
      return Response.json({ manager: { id: 'manager-1', email: 'manager@example.test' } })
    }
    throw new Error(`Unexpected request: ${String(input)}`)
  })

  render(<SiteHeader pathname="/areas" />)

  expect(await screen.findByRole('button', { name: 'Manager account options' })).toBeVisible()
  expect(fetchMock).toHaveBeenCalledWith('/api/v1/client/session', expect.objectContaining({ credentials: 'same-origin' }))
  expect(fetchMock).toHaveBeenCalledWith('/api/v1/manager/session', expect.objectContaining({ credentials: 'same-origin' }))
  expect(localStorage.getItem(managerSessionHintKey)).toBe('active')
})

it('restores a client session from its secure cookie when browser hints are missing', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    if (String(input) === '/api/v1/client/session') {
      return Response.json({ client: { id: 'buyer', email: 'buyer@example.test' } })
    }
    throw new Error(`Unexpected request: ${String(input)}`)
  })

  render(<SiteHeader pathname="/services" />)

  expect(await screen.findByRole('button', { name: 'Account options' })).toBeVisible()
  expect(fetchMock).toHaveBeenCalledWith('/api/v1/client/session', expect.objectContaining({ credentials: 'same-origin' }))
  expect(fetchMock).not.toHaveBeenCalledWith('/api/v1/manager/session', expect.anything())
  expect(localStorage.getItem(clientSessionHintKey)).toBe('active')
})

it('puts the OpenHaus guide in the navbar', async () => {
  const onOpenGuide = vi.fn()
  render(<SiteHeader pathname="/" onOpenGuide={onOpenGuide} guideOpen={false} />)

  const guide = screen.getByRole('button', { name: 'Open OpenHaus guide' })
  expect(guide.querySelector('.openhaus-guide-orbit')).not.toBeNull()
  await userEvent.click(guide)
  expect(onOpenGuide).toHaveBeenCalledOnce()

  await userEvent.click(screen.getByRole('button', { name: 'Open navigation' }))
  await userEvent.click(within(screen.getByRole('dialog', { name: 'Explore OpenHaus' })).getByRole('button', { name: 'OpenHaus guide' }))
  expect(onOpenGuide).toHaveBeenCalledTimes(2)
})

it('shows the client account when an existing session is active', async () => {
  localStorage.setItem(clientSessionHintKey, 'active')
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ client: { id: 'buyer', email: 'buyer@example.test' } }))

  render(<SiteHeader pathname="/" />)

  expect(await screen.findByRole('button', { name: 'Account options' })).toHaveTextContent('My account')
  expect(screen.getByRole('button', { name: 'Log out' })).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Sign in options' })).not.toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'Open navigation' }))
  const drawer = screen.getByRole('dialog', { name: 'Explore OpenHaus' })
  expect(within(drawer).getByRole('link', { name: 'Client account' })).toHaveAttribute('href', '/client/login')
  expect(within(drawer).queryByRole('link', { name: 'Client sign in' })).not.toBeInTheDocument()
  expect(within(drawer).queryByRole('link', { name: 'Manager sign in' })).not.toBeInTheDocument()
  expect(within(drawer).queryByRole('link', { name: 'List a property' })).not.toBeInTheDocument()
})

it('exposes information pages without opening a menu and marks the current page', () => {
  render(<SiteHeader pathname="/contact" />)
  const navigation = screen.getByRole('navigation', { name: 'Primary navigation' })
  for (const [label, href] of [['Find homes', '/#explore'], ['About', '/about'], ['Contact', '/contact'], ['Help', '/help'], ['Privacy', '/privacy']]) {
    expect(within(navigation).getByRole('link', { name: label })).toHaveAttribute('href', href)
  }
  expect(within(navigation).getByRole('link', { name: 'Contact' })).toHaveAttribute('aria-current', 'page')
  expect(screen.queryByRole('button', { name: 'Information' })).not.toBeInTheDocument()
})

it('keeps the agent directory active while viewing an agent profile', () => {
  render(<SiteHeader pathname="/agents/aoife-byrne" />)

  expect(within(screen.getByRole('navigation', { name: 'Primary navigation' })).getByRole('link', { name: 'Agents' }))
    .toHaveAttribute('aria-current', 'page')
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

it('uses a visible vector icon for the compact navigation control', () => {
  render(<SiteHeader pathname="/" />)

  const trigger = screen.getByRole('button', { name: 'Open navigation' })
  expect(trigger.querySelector('svg')).not.toBeNull()
  expect(trigger.querySelectorAll('span')).toHaveLength(0)
})

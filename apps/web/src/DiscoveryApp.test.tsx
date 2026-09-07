import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { DiscoveryApp } from './DiscoveryApp'

const properties = [
  {
    id: 'dublin-home', title: 'City garden home', addressLine1: '1 Park Lane', city: 'Dublin', county: 'Dublin',
    priceCents: 55000000, bedrooms: 3, propertyType: 'terraced', longitude: -6.26, latitude: 53.35,
    media: [{ url: '/dublin.webp', kind: 'image', altText: 'Dublin home', position: 0 }],
  },
  {
    id: 'cork-home', title: 'Harbour house', addressLine1: '2 Quay Road', city: 'Cork', county: 'Cork',
    priceCents: 75000000, bedrooms: 4, propertyType: 'detached', longitude: -8.47, latitude: 51.9,
    media: [
      { url: '/cork.webp', kind: 'image', altText: 'Cork home', position: 0 },
      { url: '/plan.webp', kind: 'floor_plan', altText: 'Plan', position: 1 },
    ],
  },
]

afterEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState({}, '', '/')
})

it('re-ranks homes immediately when the buyer changes the location signal', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => String(input) === '/api/v1/properties'
    ? Response.json({ properties })
    : new Response(null, { status: 401 }))
  window.history.replaceState({}, '', '/match?county=Dublin')
  render(<DiscoveryApp page="match" />)

  const results = await screen.findByRole('region', { name: 'Ranked home matches' })
  expect(within(results).getAllByRole('article')[0]).toHaveTextContent('City garden home')

  await userEvent.selectOptions(screen.getByLabelText('Location focus'), 'Cork')

  expect(within(results).getAllByRole('article')[0]).toHaveTextContent('Harbour house')
  expect(window.location.search).toContain('county=Cork')
})

it('builds the area index from the current property catalogue', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => String(input) === '/api/v1/properties'
    ? Response.json({ properties })
    : new Response(null, { status: 401 }))
  render(<DiscoveryApp page="areas" />)

  expect(await screen.findByRole('heading', { name: 'The live shape of the market.' })).toBeInTheDocument()
  const index = screen.getByRole('region', { name: 'Area index' })
  expect(within(index).getByRole('heading', { name: 'Dublin' })).toBeInTheDocument()
  expect(within(index).getByRole('heading', { name: 'Cork' })).toBeInTheDocument()
  expect(within(index).getAllByText('1 live home')).toHaveLength(2)
})

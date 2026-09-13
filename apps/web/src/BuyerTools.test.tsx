import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ShortlistInsights, ViewingChecklist } from './BuyerTools'
import type { Property } from './api/properties'

afterEach(() => { localStorage.clear(); vi.restoreAllMocks() })

const homes = [
  { id: 'a', title: 'Garden home', county: 'Dublin', priceCents: 40000000, bedrooms: 3 },
  { id: 'b', title: 'Coastal home', county: 'Cork', priceCents: 20000000, bedrooms: 2 },
] as Property[]

it('calculates the shortlist median and filters without changing saved homes', () => {
  render(<ShortlistInsights properties={homes} status="ready" onRetry={() => {}} />)
  expect(screen.getByText('€300,000')).toBeVisible()
  fireEvent.change(screen.getByLabelText('County'), { target: { value: 'Cork' } })
  expect(screen.queryByRole('link', { name: 'Garden home' })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Coastal home' })).toHaveAttribute('href', '/properties/b')
  expect(homes.map(home => home.id)).toEqual(['a', 'b'])
})

it('does not present empty or failed data as zero-price statistics', () => {
  const { rerender } = render(<ShortlistInsights properties={[]} status="loading" onRetry={() => {}} />)
  expect(screen.getByRole('status')).toHaveTextContent('Loading')
  rerender(<ShortlistInsights properties={[]} status="error" onRetry={() => {}} />)
  expect(screen.getByRole('alert')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Retry saved homes' })).toBeVisible()
  rerender(<ShortlistInsights properties={[]} status="ready" onRetry={() => {}} />)
  expect(screen.getByText('Save a few homes to start comparing your shortlist.')).toBeVisible()
  expect(screen.queryByText('€0')).not.toBeInTheDocument()
})

it('tracks viewing preparation with native keyboard-operable checkboxes', () => {
  render(<ViewingChecklist />)
  const checks = screen.getAllByRole('checkbox')
  fireEvent.click(checks[0])
  expect(checks[0]).toBeChecked()
  expect(screen.getByRole('status')).toHaveTextContent(`1 of ${checks.length} completed`)
  fireEvent.click(checks[0])
  expect(screen.getByRole('status')).toHaveTextContent(`0 of ${checks.length} completed`)
  expect(screen.getByText(/does not book a viewing/)).toBeVisible()
})

it('saves only on request and restores a browser checklist after remount', () => {
  const view = render(<ViewingChecklist />)
  fireEvent.click(screen.getAllByRole('checkbox')[0])
  expect(localStorage.getItem('openhaus:viewing-checklist:v1')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Save on this browser' }))
  view.unmount()
  render(<ViewingChecklist />)
  expect(screen.getAllByRole('checkbox')[0]).toBeChecked()
  fireEvent.click(screen.getByRole('button', { name: 'Reset checklist' }))
  expect(screen.getByRole('status')).toHaveTextContent('0 of 9 completed')
  expect(localStorage.getItem('openhaus:viewing-checklist:v1')).toBeNull()
})

it('rejects malformed saved progress without crashing', () => {
  localStorage.setItem('openhaus:viewing-checklist:v1', '{broken')
  render(<ViewingChecklist />)
  expect(screen.getByRole('status')).toHaveTextContent('0 of 9 completed')
  expect(screen.getByRole('alert')).toHaveTextContent('could not be loaded')
})

it('retains checks and offers retry when saving fails', () => {
  render(<ViewingChecklist />)
  fireEvent.click(screen.getAllByRole('checkbox')[0])
  const failure = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
  fireEvent.click(screen.getByRole('button', { name: 'Save on this browser' }))
  expect(screen.getByRole('alert')).toHaveTextContent('could not be saved')
  expect(screen.getAllByRole('checkbox')[0]).toBeChecked()
  failure.mockRestore()
  fireEvent.click(screen.getByRole('button', { name: 'Save on this browser' }))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('Saved on this browser')
})

it('does not claim a reset succeeded when storage removal fails', () => {
  render(<ViewingChecklist />)
  fireEvent.click(screen.getAllByRole('checkbox')[0])
  fireEvent.click(screen.getByRole('button', { name: 'Save on this browser' }))
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('blocked') })
  fireEvent.click(screen.getByRole('button', { name: 'Reset checklist' }))
  expect(screen.getAllByRole('checkbox')[0]).toBeChecked()
  expect(screen.getByRole('alert')).toHaveTextContent('Nothing was reset')
})

it('deduplicates known checks and rejects unknown saved items', () => {
  const item = 'Confirm the address and viewing time'
  localStorage.setItem('openhaus:viewing-checklist:v1', JSON.stringify([item, item]))
  const view = render(<ViewingChecklist />)
  expect(screen.getByRole('status')).toHaveTextContent('1 of 9 completed')
  view.unmount()
  localStorage.setItem('openhaus:viewing-checklist:v1', JSON.stringify(['unknown']))
  render(<ViewingChecklist />)
  expect(screen.getByRole('status')).toHaveTextContent('0 of 9 completed')
  expect(screen.getByRole('alert')).toBeVisible()
})

import { render, screen, within } from '@testing-library/react'
import { expect, it } from 'vitest'
import { AgentPages } from './AgentPages'

it('shows the agent directory with transparent demonstration status', () => {
  render(<AgentPages />)
  const directory = screen.getByRole('region', { name: 'Selling agent directory' })
  expect(within(directory).getByRole('heading', { name: 'Aoife Byrne' })).toBeVisible()
  expect(within(directory).getAllByText('Demonstration profile')).toHaveLength(3)
})

it('shows coverage without inventing regulated contact information', () => {
  render(<AgentPages slug="aoife-byrne" />)
  expect(screen.getByRole('heading', { level: 1, name: 'Aoife Byrne' })).toBeVisible()
  expect(screen.getByText(/licence details have not been supplied/)).toBeVisible()
  expect(screen.getByRole('link', { name: 'Dublin' })).toHaveAttribute('href', '/?county=Dublin#homes')
  expect(screen.queryByRole('link', { name: /@/ })).not.toBeInTheDocument()
})

it('gives an unknown agent route a recovery path', () => {
  render(<AgentPages slug="missing" />)
  expect(screen.getByRole('heading', { name: 'Agent profile not found.' })).toBeVisible()
  expect(screen.getByRole('link', { name: 'View the agent directory' })).toHaveAttribute('href', '/agents')
})

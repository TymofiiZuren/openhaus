import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'
import { TonalComparison } from './TonalComparison'

it('pins a reference, survives loading, compares another sample and exports reproducible data', async () => {
  const user = userEvent.setup()
  const histogram = (index: number) => Array.from({ length: 32 }, (_, i) => i === index ? 100 : 0)
  const a = { name: 'Reference home', src: '/reference.jpg', histogram: histogram(0) }
  const b = { name: 'Current home', src: '/current.jpg', histogram: histogram(31) }
  const { rerender } = render(<TonalComparison current={a} />)
  await user.click(screen.getByRole('button', { name: 'Use current image as reference' }))
  rerender(<TonalComparison />)
  expect(screen.getByRole('status')).toHaveTextContent('Your reference is retained')
  expect(screen.getByRole('button', { name: 'Replace reference with current image' })).toBeDisabled()
  rerender(<TonalComparison current={b} />)
  expect(screen.getByText(/248.00/)).toBeVisible()
  expect(screen.getByRole('img', { name: /Cumulative brightness/ })).toBeVisible()
  const report = JSON.parse(decodeURIComponent(screen.getByRole('link', { name: /Download comparison/ }).getAttribute('href')!.split(',')[1]))
  expect(report.distance).toBe(248)
  expect(report.reference.src).toBe(a.src)
  expect(report.current.src).toBe(b.src)
  expect(report).not.toHaveProperty('edges')
  await user.click(screen.getByText('Explore all 32 measurements'))
  expect(screen.getByRole('table')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Clear reference' }))
  expect(screen.queryByRole('link', { name: /Download comparison/ })).not.toBeInTheDocument()
})

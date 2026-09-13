import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'
import { analysePixels } from './mediaAnalysis'
import { ChannelHistogram } from './ChannelHistogram'

it('switches labelled channels and exposes exact counts without relying on colour', async () => {
  const pixels = new Uint8ClampedArray(36)
  for (let i = 0; i < 9; i++) { pixels[i * 4] = 255; pixels[i * 4 + 3] = 255 }
  const user = userEvent.setup()
  render(<ChannelHistogram result={analysePixels(pixels, 3, 3)} />)
  expect(screen.getByRole('button', { name: 'Luma' })).toHaveAttribute('aria-pressed', 'true')
  await user.click(screen.getByRole('button', { name: 'Red' }))
  expect(screen.getByRole('button', { name: 'Red' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('img', { name: /Red channel histogram/ })).toBeVisible()
  expect(screen.getByLabelText('Red distribution statistics')).toHaveTextContent('No split')
  expect(screen.getByLabelText('Red distribution statistics')).toHaveTextContent('0.00')
  await user.click(screen.getByText('View channel counts'))
  const row = screen.getByRole('row', { name: '248–255 9 100.00%' })
  expect(within(row).getByText('9')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Green' }))
  expect(screen.getByRole('row', { name: '0–7 9 100.00%' })).toBeVisible()
})

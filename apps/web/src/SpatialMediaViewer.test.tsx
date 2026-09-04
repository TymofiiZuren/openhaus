import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { SpatialMediaViewer, type SpatialMediaSource } from './SpatialMediaViewer'

describe('SpatialMediaViewer', () => {
  it('shows a non-interactive processing state before a tour is ready', () => {
    const source: SpatialMediaSource = { provider: 'embed', embedUrl: 'https://kuula.co/share/LTPpc', title: 'Ground floor tour', processingState: 'processing' }
    render(<SpatialMediaViewer source={source} />)

    expect(screen.getByRole('status')).toHaveTextContent('360° tour processing')
    expect(screen.queryByRole('button', { name: /enter 360/i })).not.toBeInTheDocument()
  })

  it('loads an approved provider embed only after the visitor opts in', async () => {
    const user = userEvent.setup()
    const source: SpatialMediaSource = { provider: 'embed', embedUrl: 'https://my.matterport.com/show/?m=sample', title: 'Whole-home digital twin' }
    render(<SpatialMediaViewer source={source} />)

    expect(screen.queryByTitle('Whole-home digital twin')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Enter 360° tour' }))
    expect(screen.getByTitle('Whole-home digital twin')).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-forms')
  })

  it('rejects an embed URL from an unsupported host', () => {
    render(<SpatialMediaViewer source={{ provider: 'embed', embedUrl: 'https://example.com/tour', title: 'Unknown tour' }} />)

    expect(screen.getByRole('alert')).toHaveTextContent('This tour provider is not supported')
    expect(screen.queryByTitle('Unknown tour')).not.toBeInTheDocument()
  })
})

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Property } from './api/properties'
import { PropertyImageCarousel } from './PropertyImageCarousel'

const property: Property = {
  id: 'sample', title: 'Sample home', addressLine1: 'Main Street', city: 'Cork', county: 'Cork',
  priceCents: 50000000, bedrooms: 3, propertyType: 'detached', longitude: -8.47, latitude: 51.9, media: [],
}

describe('PropertyImageCarousel', () => {
  it('shows the architectural house study when a listing has no photography', () => {
    render(<PropertyImageCarousel property={property} className="test-carousel" />)

    expect(screen.getByRole('img', { name: 'Architectural study for Sample home; photography coming soon' })).toHaveAttribute(
      'src',
      '/media/placeholders/architectural-home.svg',
    )
  })

  it('keeps the architectural house study when it is provided as listing media', () => {
    const { container } = render(<PropertyImageCarousel property={{ ...property, media: [{ kind: 'image', url: '/media/placeholders/architectural-home.svg', altText: 'Architectural study', position: 0 }] }} className="test-carousel" />)

    expect(container.querySelector('img')).toHaveAttribute('src', '/media/placeholders/architectural-home.svg')
  })
})

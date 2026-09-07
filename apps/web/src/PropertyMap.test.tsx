import { render, screen } from '@testing-library/react'
import { useState } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { loadAreasForCounty } from './administrativeAreas'
beforeAll(() => Promise.all(['Dublin', 'Cork'].map(loadAreasForCounty)))
import type { Property } from './api/properties'

let googleMapRenderCount = 0
vi.mock('./GooglePropertyMap', () => ({
  GooglePropertyMap: ({ properties, selectedPropertyID }: { properties: Property[]; selectedPropertyID?: string }) => {
    googleMapRenderCount += 1
    return <div data-testid="map-properties" data-selected-property={selectedPropertyID}>{properties.map((property) => property.title).join(',')}</div>
  },
}))

import { PropertyMap } from './PropertyMap'

const dublinProperty: Property = {
  id: 'dublin', title: 'Dublin home', addressLine1: 'Dublin 4', city: 'Dublin', county: 'Dublin',
  priceCents: 89500000, bedrooms: 4, propertyType: 'detached', longitude: -6.2527, latitude: 53.332, media: [],
}

const corkProperty: Property = {
  ...dublinProperty, id: 'cork', title: 'Cork home', addressLine1: 'Douglas', city: 'Cork', county: 'Cork',
  longitude: -8.4932, latitude: 51.9045,
}

const sharedProps = {
  selectedArea: undefined,
  propertyQuery: '',
  minimumBedrooms: 0,
  propertyType: 'all',
  maximumPrice: 0,
  spatialToursOnly: false,
  onPropertyQueryChange: vi.fn(),
  onMinimumBedroomsChange: vi.fn(),
  onPropertyTypeChange: vi.fn(),
  onMaximumPriceChange: vi.fn(),
  onSpatialToursOnlyChange: vi.fn(),
  onCountyChange: vi.fn(),
  onAreaChange: vi.fn(),
}

describe('property map listing visibility', () => {
  it('does not redraw the map while typing into the search field', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    googleMapRenderCount = 0
    const properties = [dublinProperty, corkProperty]
    function SearchHarness() {
      const [query, setQuery] = useState('')
      return <PropertyMap {...sharedProps} properties={properties} selectedCounty={null} propertyQuery={query} onPropertyQueryChange={setQuery} />
    }

    render(<SearchHarness />)
    expect(googleMapRenderCount).toBe(1)
    await user.type(screen.getByRole('searchbox', { name: 'Search homes' }), 'cork')
    expect(googleMapRenderCount).toBe(1)
  })

  it('offers every property type supported by the listing editor', () => {
    render(<PropertyMap {...sharedProps} properties={[dublinProperty]} selectedCounty={null} />)

    expect(screen.getByRole('option', { name: 'Apartment' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Semi-detached' })).toBeInTheDocument()
  })

  it('shows all visible listing markers and the listing rail in the Ireland overview', () => {
    render(<PropertyMap {...sharedProps} properties={[dublinProperty, corkProperty]} selectedCounty={null} />)

    expect(screen.getByTestId('map-properties')).toHaveTextContent('Dublin home,Cork home')
    expect(screen.getByRole('complementary', { name: 'Homes matching your search' })).toBeVisible()
  })

  it('shows county listing markers and the listing rail before a local area is selected', () => {
    render(<PropertyMap {...sharedProps} properties={[corkProperty]} selectedCounty="Cork" />)

    expect(screen.getByTestId('map-properties')).toHaveTextContent('Cork home')
    expect(screen.getByRole('complementary', { name: 'Homes matching your search' })).toBeVisible()
  })

  it('activates the matching map marker when a sidebar home is selected', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    render(<PropertyMap {...sharedProps} properties={[corkProperty]} selectedCounty="Cork" />)

    await user.click(screen.getByRole('button', { name: `Select ${corkProperty.title} on map` }))

    expect(screen.getByTestId('map-properties')).toHaveAttribute('data-selected-property', corkProperty.id)
    expect(screen.getByRole('article', { name: `Preview ${corkProperty.title}` })).toBeVisible()
  })

  it('restores a property selected by a deep link', () => {
    render(<PropertyMap {...sharedProps} properties={[corkProperty]} selectedCounty="Cork" initialSelectedPropertyID={corkProperty.id} />)

    expect(screen.getByTestId('map-properties')).toHaveAttribute('data-selected-property', corkProperty.id)
    expect(screen.getByRole('article', { name: `Preview ${corkProperty.title}` })).toBeVisible()
  })
})

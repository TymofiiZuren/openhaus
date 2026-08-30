import { useMemo, useState } from 'react'
import type { Property } from './api/properties'
import { areaForCoordinate, areasForCounty } from './administrativeAreas'
import { GooglePropertyMap } from './GooglePropertyMap'
import { PropertyImageCarousel } from './PropertyImageCarousel'

type PropertyMapProps = {
  properties: Property[]
  selectedCounty: string | null
  selectedArea?: string
  propertyQuery: string
  minimumBedrooms: number
  propertyType: string
  maximumPrice: number
  onPropertyQueryChange: (query: string) => void
  onMinimumBedroomsChange: (bedrooms: number) => void
  onPropertyTypeChange: (propertyType: string) => void
  onMaximumPriceChange: (price: number) => void
  onCountyChange: (county: string | null) => void
  onAreaChange: (area?: string) => void
}
type CityGroup = { city: string; properties: Property[] }
type LocationGroup = { county: string; cities: CityGroup[]; properties: Property[] }

export function PropertyMap({ properties, selectedCounty, selectedArea, propertyQuery, minimumBedrooms, propertyType, maximumPrice, onPropertyQueryChange, onMinimumBedroomsChange, onPropertyTypeChange, onMaximumPriceChange, onCountyChange, onAreaChange }: PropertyMapProps) {
  const [countyQuery, setCountyQuery] = useState('')
  const [areaQuery, setAreaQuery] = useState('')
  const [showAllAreas, setShowAllAreas] = useState(false)
  const [selectedPropertyID, setSelectedPropertyID] = useState<string>()
  const [cameraRequestKey, setCameraRequestKey] = useState(0)
  const [locationPanelOpen, setLocationPanelOpen] = useState(false)
  const groups = useMemo(() => groupByCounty(properties), [properties])
  const availableCounties = useMemo(() => groups.map((group) => group.county), [groups])
  const selectedGroup = groups.find((group) => sameLocation(group.county, selectedCounty ?? ''))
  const countyAreas = useMemo(() => areasForCounty(selectedCounty), [selectedCounty])
  const areaGroups = useMemo(() => countyAreas.map((area) => ({
    area,
    properties: selectedGroup?.properties.filter((property) => areaForCoordinate(area.county, { lat: property.latitude, lng: property.longitude })?.name === area.name) ?? [],
  })), [countyAreas, selectedGroup])
  const activeArea = areaGroups.some((group) => sameLocation(group.area.name, selectedArea ?? '')) ? selectedArea : undefined
  const normalizedCountyQuery = countyQuery.trim().toLocaleLowerCase()
  const normalizedAreaQuery = areaQuery.trim().toLocaleLowerCase()
  const matchingGroups = groups.filter((group) => matchesGroup(group, normalizedCountyQuery))
  const matchingAreas = areaGroups.filter((group) => !normalizedAreaQuery || group.area.name.toLocaleLowerCase().includes(normalizedAreaQuery) || group.properties.some((property) => matchesPropertyLocation(property, normalizedAreaQuery)))
  const displayedAreas = normalizedAreaQuery || showAllAreas ? matchingAreas : matchingAreas.slice(0, 7)
  const visibleProperties = activeArea
    ? areaGroups.find((group) => sameLocation(group.area.name, activeArea))?.properties ?? []
    : selectedCounty ? selectedGroup?.properties ?? [] : properties
  // Keep the map and results panel synchronized at every geography level.
  // Selecting a county or area narrows both surfaces to the same listings.
  const mapProperties = visibleProperties
  const selectedProperty = visibleProperties.find((property) => property.id === selectedPropertyID)

  function chooseCounty(county: string | null) {
    setSelectedPropertyID(undefined)
    setAreaQuery('')
    setShowAllAreas(false)
    onCountyChange(county)
  }

  function chooseArea(area?: string) {
    setSelectedPropertyID(undefined)
    onAreaChange(area)
    if (area) setLocationPanelOpen(false)
  }

  function showWholeCounty() {
    chooseArea(undefined)
    setCameraRequestKey((key) => key + 1)
  }

  function showPropertyOnMap(property: Property) {
    const propertyArea = areaForCoordinate(property.county, { lat: property.latitude, lng: property.longitude })
    if (!sameLocation(property.county, selectedCounty ?? '')) onCountyChange(property.county)
    if (propertyArea) onAreaChange(propertyArea.name)
    setSelectedPropertyID(property.id)
  }

  return (
    <section className="location-explorer" aria-label="Explore homes by location">
      <header className="location-heading">
        <div className="location-heading-copy">
          <p className="eyebrow">Property for sale in Ireland</p>
          <h1>{activeArea ? `Homes in ${activeArea}` : selectedCounty ? `Homes in ${selectedCounty}` : 'Find a place that feels like home'}</h1>
          <p className="location-introduction">Search by county or local area, then explore every available home on the map.</p>
          <p className="location-total" aria-live="polite">{homeCount(visibleProperties.length)} for sale</p>
        </div>
      </header>

      <div className="property-search-bar" role="search" aria-label="Search and filter homes">
        <label className="property-search-input"><span className="visually-hidden">Search homes</span><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg><input type="search" value={propertyQuery} placeholder="Search by address, town or property" onChange={(event) => onPropertyQueryChange(event.target.value)} /></label>
        <label><span>Price</span><select aria-label="Maximum price" value={maximumPrice} onChange={(event) => onMaximumPriceChange(Number(event.target.value))}><option value="0">Any price</option><option value="650000">Up to €650k</option><option value="800000">Up to €800k</option><option value="1000000">Up to €1m</option></select></label>
        <label><span>Beds</span><select aria-label="Minimum bedrooms" value={minimumBedrooms} onChange={(event) => onMinimumBedroomsChange(Number(event.target.value))}><option value="0">Any beds</option><option value="2">2+ beds</option><option value="3">3+ beds</option><option value="4">4+ beds</option></select></label>
        <label><span>Type</span><select aria-label="Property type" value={propertyType} onChange={(event) => onPropertyTypeChange(event.target.value)}><option value="all">All types</option><option value="detached">Detached</option><option value="terraced">Terraced</option></select></label>
        <p aria-live="polite">{visibleProperties.length} {visibleProperties.length === 1 ? 'result' : 'results'}</p>
      </div>

      <div className={`location-workspace${selectedCounty ? ' has-results' : ''}`}>
        <div className={`location-toolbar${locationPanelOpen ? ' is-open' : ''}`} aria-hidden={!locationPanelOpen}>
          <div className="location-panel-heading"><div><span>{selectedCounty ? 'Refine location' : 'Explore Ireland'}</span><strong>{activeArea ?? selectedCounty ?? 'Counties'}</strong></div><button type="button" aria-label="Close location search" onClick={() => setLocationPanelOpen(false)}>×</button></div>
          <div className="location-toolbar-primary">
            <div className="location-filter-group">
              <p>Homes by county</p>
              <label className="panel-search"><span className="visually-hidden">Search counties</span><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg><input type="search" value={countyQuery} placeholder="Search counties" onChange={(event) => setCountyQuery(event.target.value)} /></label>
              <div className="location-pills" aria-label="Counties with homes for sale">
                {!normalizedCountyQuery && !selectedCounty && <button type="button" aria-pressed="true" aria-label="All Ireland" onClick={() => chooseCounty(null)}>All Ireland <span>{properties.length}</span></button>}
                {matchingGroups.map((group) => <button type="button" key={group.county} aria-pressed={sameLocation(group.county, selectedCounty ?? '')} aria-label={`Explore ${group.county}, ${propertyCount(group.properties.length)}`} onClick={() => chooseCounty(group.county)}>{group.county} <span>{group.properties.length}</span></button>)}
                {matchingGroups.length === 0 && <span className="filter-empty">No homes match this search</span>}
              </div>
            </div>
          </div>

          <div className={`location-drilldown-slot${selectedGroup && countyAreas.length > 0 ? ' is-active' : ''}`}>
            {!selectedGroup && <p className="location-drilldown-empty">Select a county on the map or from the county list. Local electoral areas appear only after you enter a county.</p>}
            {selectedGroup && countyAreas.length > 0 && <div className="location-filter-row city-filter-row">
              <p>Areas</p>
              <label className="panel-search"><span className="visually-hidden">Search areas in {selectedGroup.county}</span><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg><input type="search" value={areaQuery} placeholder={`Search ${selectedGroup.county} areas`} onChange={(event) => setAreaQuery(event.target.value)} /></label>
              <div className="location-pills city-pills" aria-label={`Areas in ${selectedGroup.county}`}>
                {displayedAreas.map((group) => <button type="button" key={group.area.name} aria-pressed={sameLocation(group.area.name, activeArea ?? '')} aria-label={`Explore ${group.area.name}, ${propertyCount(group.properties.length)}`} onClick={() => chooseArea(group.area.name)}>{group.area.name} <span>{group.properties.length}</span></button>)}
                {matchingAreas.length === 0 && <span className="filter-empty">No areas match this search</span>}
              </div>
              {!normalizedAreaQuery && matchingAreas.length > 7 && <button className="areas-disclosure" type="button" aria-expanded={showAllAreas} onClick={() => setShowAllAreas((shown) => !shown)}>{showAllAreas ? 'Show fewer areas' : `Show all ${matchingAreas.length} areas`} <span aria-hidden="true">{showAllAreas ? '−' : '+'}</span></button>}
            </div>}
          </div>
        </div>

        <div className="map-stage">
          <button className="map-location-toggle" type="button" aria-expanded={locationPanelOpen} onClick={() => setLocationPanelOpen((open) => !open)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z"/><circle cx="12" cy="10" r="2"/></svg><span>{activeArea ?? selectedCounty ?? 'Choose location'}</span></button>
          {selectedCounty && <div className="map-location-actions">
            <button className="map-back-button" type="button" aria-label="All Ireland" onClick={() => chooseCounty(null)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 6-6 6 6 6" /></svg><span>All Ireland</span></button>
            {activeArea && <button className="map-focus-button" type="button" aria-label={`Back to all ${selectedCounty}`} onClick={showWholeCounty}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 6-6 6 6 6" /></svg><span>Back</span></button>}
          </div>}
          <GooglePropertyMap properties={mapProperties} selectedPropertyID={selectedProperty?.id} selectedCounty={selectedCounty} selectedArea={activeArea} cameraRequestKey={cameraRequestKey} areas={countyAreas} availableCounties={availableCounties} onSelectProperty={showPropertyOnMap} onSelectCounty={(county) => chooseCounty(county)} onSelectArea={(area) => chooseArea(area)} onDismissProperty={() => setSelectedPropertyID(undefined)} />
          {!selectedCounty && <p className="map-drilldown-hint">Select a home or choose a county to explore local areas</p>}
          {selectedCounty && !activeArea && <p className="map-drilldown-hint">Select a home or choose a local area</p>}
        </div>
        {selectedCounty && <aside className="map-results" aria-label="Homes matching your search">
          <div className="map-results-heading"><span>Homes</span><strong>{visibleProperties.length} available</strong></div>
          <div className="map-results-list">
            {visibleProperties.map((property) => <article className={`map-result-card${selectedPropertyID === property.id ? ' is-selected' : ''}`} key={property.id}>
              <PropertyImageCarousel property={property} className="map-result-image" onImageClick={() => showPropertyOnMap(property)} />
              <button className="map-result-select" type="button" aria-label={`Select ${property.title} on map`} aria-pressed={selectedPropertyID === property.id} onClick={() => showPropertyOnMap(property)}>
                <span className="map-result-copy"><strong>{euros(property.priceCents)}</strong><span className="map-result-title">{property.title}</span><small>{property.bedrooms} beds · {property.city}</small><span className="map-result-map-action">Show on map</span></span>
              </button>
              <div className="map-result-actions"><a href={`/properties/${property.id}`}>View property <span aria-hidden="true">→</span></a></div>
            </article>)}
            {visibleProperties.length === 0 && <div className="map-results-empty"><strong>No matching homes</strong><p>Adjust the filters or choose another area.</p></div>}
          </div>
        </aside>}
      </div>
    </section>
  )
}

function groupByCounty(properties: Property[]): LocationGroup[] {
  const counties = new Map<string, Property[]>()
  for (const property of properties) counties.set(property.county, [...(counties.get(property.county) ?? []), property])
  return [...counties.entries()].map(([county, countyProperties]) => {
    const cities = new Map<string, Property[]>()
    for (const property of countyProperties) cities.set(property.city, [...(cities.get(property.city) ?? []), property])
    return { county, properties: countyProperties, cities: [...cities.entries()].map(([city, cityProperties]) => ({ city, properties: cityProperties })).sort((a, b) => a.city.localeCompare(b.city)) }
  }).sort((a, b) => a.county.localeCompare(b.county))
}
function matchesGroup(group: LocationGroup, query: string) { return !query || group.county.toLocaleLowerCase().includes(query) || group.cities.some((city) => matchesCity(city, query)) }
function matchesCity(group: CityGroup, query: string) { return !query || group.city.toLocaleLowerCase().includes(query) || group.properties.some((property) => property.addressLine1.toLocaleLowerCase().includes(query)) }
function matchesPropertyLocation(property: Property, query: string) { return property.city.toLocaleLowerCase().includes(query) || property.addressLine1.toLocaleLowerCase().includes(query) }
function euros(priceCents: number) { return new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(priceCents / 100) }
function sameLocation(left: string, right: string) { return left.localeCompare(right, undefined, { sensitivity: 'base' }) === 0 }
function homeCount(count: number) { return `${count} ${count === 1 ? 'home' : 'homes'}` }
function propertyCount(count: number) { return `${count} ${count === 1 ? 'property' : 'properties'}` }

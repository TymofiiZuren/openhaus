import { useMemo, useState } from 'react'
import type { Property } from './api/properties'
import { areaForCoordinate, areasForCounty } from './administrativeAreas'
import { GooglePropertyMap } from './GooglePropertyMap'

type PropertyMapProps = {
  properties: Property[]
  selectedCounty: string | null
  selectedArea?: string
  onCountyChange: (county: string | null) => void
  onAreaChange: (area?: string) => void
}
type CityGroup = { city: string; properties: Property[] }
type LocationGroup = { county: string; cities: CityGroup[]; properties: Property[] }

export function PropertyMap({ properties, selectedCounty, selectedArea, onCountyChange, onAreaChange }: PropertyMapProps) {
  const [query, setQuery] = useState('')
  const [selectedPropertyID, setSelectedPropertyID] = useState<string>()
  const groups = useMemo(() => groupByCounty(properties), [properties])
  const availableCounties = useMemo(() => groups.map((group) => group.county), [groups])
  const selectedGroup = groups.find((group) => sameLocation(group.county, selectedCounty ?? ''))
  const countyAreas = useMemo(() => areasForCounty(selectedCounty), [selectedCounty])
  const areaGroups = useMemo(() => countyAreas.map((area) => ({
    area,
    properties: selectedGroup?.properties.filter((property) => areaForCoordinate(area.county, { lat: property.latitude, lng: property.longitude })?.name === area.name) ?? [],
  })), [countyAreas, selectedGroup])
  const activeArea = areaGroups.some((group) => sameLocation(group.area.name, selectedArea ?? '')) ? selectedArea : undefined
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const matchingGroups = groups.filter((group) => matchesGroup(group, normalizedQuery))
  const matchingAreas = areaGroups.filter((group) => !normalizedQuery || group.area.name.toLocaleLowerCase().includes(normalizedQuery) || group.properties.some((property) => matchesPropertyLocation(property, normalizedQuery)))
  const visibleProperties = activeArea
    ? areaGroups.find((group) => sameLocation(group.area.name, activeArea))?.properties ?? []
    : selectedCounty ? selectedGroup?.properties ?? [] : properties
  // Keep the county subdivision unobstructed while the buyer chooses an area.
  // Property markers appear only at the final level of the location drill-down.
  const mapProperties = selectedCounty && activeArea ? visibleProperties : []
  const selectedProperty = visibleProperties.find((property) => property.id === selectedPropertyID)

  function chooseCounty(county: string | null) {
    setSelectedPropertyID(undefined)
    setQuery('')
    onCountyChange(county)
  }

  function chooseArea(area?: string) {
    setSelectedPropertyID(undefined)
    onAreaChange(area)
  }

  return (
    <section className="location-explorer" aria-label="Explore homes by location">
      <header className="location-heading">
        <div><p className="eyebrow">Explore by location</p><h2>{activeArea ? `Homes in ${activeArea}` : selectedCounty ? `Homes in ${selectedCounty}` : 'Where would you like to live?'}</h2></div>
        <p className="location-total" aria-live="polite">{homeCount(visibleProperties.length)} for sale</p>
      </header>

      <div className="location-workspace">
        <div className="location-toolbar">
          <div className="location-toolbar-primary">
            <div className="location-filter-group">
              <p>Homes by county</p>
              <div className="location-pills" aria-label="Counties with homes for sale">
                {!normalizedQuery && <button type="button" aria-pressed={!selectedCounty} aria-label="All Ireland" onClick={() => chooseCounty(null)}>All Ireland <span>{properties.length}</span></button>}
                {matchingGroups.map((group) => <button type="button" key={group.county} aria-pressed={sameLocation(group.county, selectedCounty ?? '')} aria-label={`Explore ${group.county}, ${propertyCount(group.properties.length)}`} onClick={() => chooseCounty(group.county)}>{group.county} <span>{group.properties.length}</span></button>)}
                {matchingGroups.length === 0 && <span className="filter-empty">No homes match this search</span>}
              </div>
            </div>
            <label className="location-search">
              <span>Search locations</span>
              <span className="location-search-field"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg><input type="search" value={query} placeholder="Try Dublin or Douglas" onChange={(event) => setQuery(event.target.value)} /></span>
            </label>
          </div>

          {selectedGroup && countyAreas.length > 0 && <div className="location-filter-row city-filter-row">
            <p>Areas</p>
            <div className="location-pills city-pills" aria-label={`Areas in ${selectedGroup.county}`}>
              {!normalizedQuery && <button type="button" aria-pressed={!activeArea} aria-label={`Show all ${selectedGroup.county} areas, ${propertyCount(selectedGroup.properties.length)}`} onClick={() => chooseArea(undefined)}>All {selectedGroup.county} <span>{selectedGroup.properties.length}</span></button>}
              {matchingAreas.map((group) => <button type="button" key={group.area.name} aria-pressed={sameLocation(group.area.name, activeArea ?? '')} aria-label={`Explore ${group.area.name}, ${propertyCount(group.properties.length)}`} onClick={() => chooseArea(group.area.name)}>{group.area.name} <span>{group.properties.length}</span></button>)}
              {matchingAreas.length === 0 && <span className="filter-empty">No areas match this search</span>}
            </div>
          </div>}
        </div>

        <div className="map-stage">
          <GooglePropertyMap properties={mapProperties} selectedPropertyID={selectedProperty?.id} selectedCounty={selectedCounty} selectedArea={activeArea} areas={countyAreas} availableCounties={availableCounties} onSelectProperty={(property) => setSelectedPropertyID(property.id)} onSelectCounty={(county) => chooseCounty(county)} onSelectArea={(area) => chooseArea(area)} />
          {!selectedCounty && <p className="map-drilldown-hint">Choose a county to see homes and local areas</p>}
          {selectedCounty && !activeArea && <p className="map-drilldown-hint">Choose a city or county area to see homes</p>}
          {selectedProperty && <a className="map-property-preview" href={`#property-${selectedProperty.id}`}>
            {coverPhoto(selectedProperty) && <img src={coverPhoto(selectedProperty)} alt="" />}
            <span><small>{selectedProperty.city} · Co. {selectedProperty.county}</small><strong>{selectedProperty.title}</strong><b>{euros(selectedProperty.priceCents)}</b></span>
            <span className="map-preview-action">View home <span aria-hidden="true">→</span></span>
          </a>}
        </div>
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
function coverPhoto(property: Property) { return property.media.find((item) => item.kind === 'image')?.url }
function euros(priceCents: number) { return new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(priceCents / 100) }
function sameLocation(left: string, right: string) { return left.localeCompare(right, undefined, { sensitivity: 'base' }) === 0 }
function homeCount(count: number) { return `${count} ${count === 1 ? 'home' : 'homes'}` }
function propertyCount(count: number) { return `${count} ${count === 1 ? 'property' : 'properties'}` }

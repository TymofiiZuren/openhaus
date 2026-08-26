import { useEffect, useRef, useState } from 'react'
import type { Property } from './api/properties'
import { administrativeAreaAttribution, type AdministrativeArea } from './administrativeAreas'
import { boundariesForSelection, countyBoundaryAttribution, mapViewport } from './countyBoundaries'
import { loadGoogleMaps } from './googleMapsLoader'
import type { Listener, MapInstance, MarkerInstance, PolygonInstance } from './googleMapsLoader'

const irelandOverviewRestriction = {
  west: -14.4,
  south: 50.2,
  east: -1.7,
  north: 56.6,
}

type GooglePropertyMapProps = {
  properties: Property[]
  selectedPropertyID?: string
  selectedCounty?: string | null
  selectedArea?: string
  areas: AdministrativeArea[]
  availableCounties: string[]
  onSelectProperty: (property: Property) => void
  onSelectCounty: (county: string) => void
  onSelectArea: (area: string) => void
}
export function GooglePropertyMap({ properties, selectedPropertyID, selectedCounty, selectedArea, areas, availableCounties, onSelectProperty, onSelectCounty, onSelectArea }: GooglePropertyMapProps) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<MapInstance | undefined>(undefined)
  const markers = useRef<Array<{ id: string; marker: MarkerInstance; listener: Listener }>>([])
  const polygons = useRef<Array<{ name: string; polygon: PolygonInstance; listeners: Listener[]; available: boolean }>>([])
  const onSelect = useRef(onSelectProperty)
  const onCountySelect = useRef(onSelectCounty)
  const onAreaSelect = useRef(onSelectArea)
  const selectedCountyRef = useRef(selectedCounty)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [mapType, setMapType] = useState<'roadmap' | 'satellite'>('roadmap')
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined
  const attribution = selectedCounty && areas.length > 0 ? administrativeAreaAttribution : countyBoundaryAttribution

  useEffect(() => { onSelect.current = onSelectProperty }, [onSelectProperty])
  useEffect(() => { onCountySelect.current = onSelectCounty }, [onSelectCounty])
  useEffect(() => { onAreaSelect.current = onSelectArea }, [onSelectArea])
  useEffect(() => { selectedCountyRef.current = selectedCounty }, [selectedCounty])

  useEffect(() => {
    if (!apiKey || !container.current) return
    let cancelled = false
    setStatus('loading')
    loadGoogleMaps(apiKey)
      .then((maps) => {
        if (cancelled || !container.current) return
        const ireland = mapViewport(null)
        map.current = new maps.Map(container.current, {
          center: { lat: 53.35, lng: -8 }, zoom: 6, minZoom: 5, maxZoom: 20,
          disableDefaultUI: true,
          clickableIcons: false, gestureHandling: 'cooperative', styles: openHausMapStyle,
          restriction: { latLngBounds: ireland.restriction, strictBounds: true },
        })
        setStatus('ready')
      })
      .catch(() => { if (!cancelled) setStatus('error') })
    return () => { cancelled = true }
  }, [apiKey])

  useEffect(() => {
    if (status !== 'ready' || !map.current || !window.google) return
    clearMarkers(markers.current)
    const maps = window.google.maps
    markers.current = properties.map((property) => {
      const position = { lat: property.latitude, lng: property.longitude }
      const marker = new maps.Marker({
        map: map.current, position, title: `${property.title}, ${compactEuros(property.priceCents)}`,
        icon: markerIcon(false, compactEuros(property.priceCents)), zIndex: 1,
      })
      const listener = marker.addListener('click', () => onSelect.current(property))
      return { id: property.id, marker, listener }
    })
  }, [properties, status])

  useEffect(() => {
    if (status !== 'ready' || !map.current || !window.google) return
    clearPolygons(polygons.current)
    const maps = window.google.maps
    const visibleCountyBoundaries = selectedCounty && areas.length > 0 ? [] : boundariesForSelection(selectedCounty)
    const countyPolygons = visibleCountyBoundaries.flatMap((county) => county.paths.map((path) => {
      const available = availableCounties.some((name) => sameLocation(name, county.name))
      const polygon = new maps.Polygon({
        map: map.current,
        paths: path,
        clickable: available && !selectedCounty,
        strokeColor: '#282824',
        strokeOpacity: selectedCounty ? 1 : available ? .72 : .3,
        strokeWeight: selectedCounty ? 2.5 : 1,
        fillColor: '#b95636',
        fillOpacity: selectedCounty ? .035 : 0,
        zIndex: 2,
      })
      const listeners = available && !selectedCounty ? [
        polygon.addListener('click', () => onCountySelect.current(county.name)),
        polygon.addListener('mouseover', () => {
          polygon.setOptions({ fillOpacity: .1, strokeOpacity: 1, strokeWeight: 2 })
        }),
        polygon.addListener('mouseout', () => polygon.setOptions(countyStyle(county.name, selectedCountyRef.current, available))),
      ] : []
      return { name: county.name, polygon, listeners, available }
    }))
    const areaShapes = selectedCounty
      ? areas.flatMap((area) => groupPolygonRings(area.paths).map((paths) => ({ area, paths, size: polygonArea(paths[0]) })))
        .sort((left, right) => right.size - left.size)
      : []
    const areaPolygons = areaShapes.map(({ area, paths }, areaIndex) => {
      const selected = sameLocation(area.name, selectedArea ?? '')
      const polygon = new maps.Polygon({
        map: map.current,
        paths,
        clickable: true,
        strokeColor: '#5f5b52',
        strokeOpacity: .8,
        strokeWeight: selected ? 2 : 1,
        fillColor: selected ? '#b95636' : areaIndex % 2 === 0 ? '#eee9df' : '#d8d3c9',
        fillOpacity: selected ? .2 : .12,
        // Large county regions are drawn first. Compact city polygons sit above
        // them so both remain independently visible and clickable.
        zIndex: 3 + areaIndex,
      })
      const listeners = [
        polygon.addListener('click', () => onAreaSelect.current(area.name)),
        polygon.addListener('mouseover', () => polygon.setOptions({ fillOpacity: selected ? .25 : .2, strokeOpacity: 1 })),
        polygon.addListener('mouseout', () => polygon.setOptions({ fillOpacity: selected ? .2 : .12, strokeOpacity: .8 })),
      ]
      return { name: area.name, polygon, listeners, available: true }
    })
    polygons.current = [...countyPolygons, ...areaPolygons]
    return () => clearPolygons(polygons.current)
  }, [areas, availableCounties, selectedArea, selectedCounty, status])

  useEffect(() => {
    if (!selectedCounty) for (const item of polygons.current) item.polygon.setOptions(countyStyle(item.name, selectedCounty, item.available))
  }, [selectedCounty, status])

  useEffect(() => {
    if (status !== 'ready' || !map.current || !window.google) return
    applyCamera(map.current, selectedCounty, container.current?.clientWidth)
  }, [selectedCounty, status])

  useEffect(() => {
    for (const item of markers.current) {
      const selected = item.id === selectedPropertyID
      const property = properties.find((candidate) => candidate.id === item.id)
      if (!property) continue
      item.marker.setIcon(markerIcon(selected, compactEuros(property.priceCents)))
      item.marker.setZIndex(selected ? 10 : 1)
    }
  }, [properties, selectedPropertyID])

  useEffect(() => () => { clearMarkers(markers.current); clearPolygons(polygons.current) }, [])

  if (!apiKey || status === 'error') {
    return (
      <div className="map-unavailable" role="status">
        <svg viewBox="0 0 48 48" aria-hidden="true"><path d="m7 12 11-5 12 5 11-5v29l-11 5-12-5-11 5zM18 7v29m12-24v29" /></svg>
        <div><strong>Map view is unavailable right now.</strong><p>Choose a county or town from the list. Every available home remains accessible.</p></div>
      </div>
    )
  }

  function changeMapType(type: 'roadmap' | 'satellite') {
    map.current?.setMapTypeId(type)
    setMapType(type)
  }

  function changeZoom(delta: number) {
    const currentZoom = map.current?.getZoom() ?? 7
    map.current?.setZoom(Math.max(5, Math.min(20, currentZoom + delta)))
  }

  function recenterCurrentArea() {
    if (!map.current || !window.google) return
    applyCamera(map.current, selectedCounty, container.current?.clientWidth)
  }

  return (
    <>
      <div ref={container} className="google-property-map" aria-label="Interactive Google map of available homes" />
      {status === 'loading' && <div className="map-loading" role="status">Loading map…</div>}
      {status === 'ready' && (
        <div className="openhaus-map-ui">
          <div className="map-type-control" aria-label="Map appearance">
            <button type="button" aria-pressed={mapType === 'roadmap'} onClick={() => changeMapType('roadmap')}>Map</button>
            <button type="button" aria-pressed={mapType === 'satellite'} onClick={() => changeMapType('satellite')}>Satellite</button>
          </div>
          <div className="map-navigation-control" aria-label="Map controls">
            <button type="button" aria-label="Recenter current area" onClick={recenterCurrentArea}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7" /><path d="M12 2v3m0 14v3M2 12h3m14 0h3" /></svg>
            </button>
            <button type="button" aria-label="Zoom in" onClick={() => changeZoom(1)}>+</button>
            <button type="button" aria-label="Zoom out" onClick={() => changeZoom(-1)}>−</button>
          </div>
        </div>
      )}
      <a className="county-attribution" href={attribution.url} target="_blank" rel="noreferrer">{attribution.label}</a>
    </>
  )
}

function clearMarkers(items: Array<{ marker: MarkerInstance; listener: Listener }>) {
  for (const item of items) { item.listener.remove(); item.marker.setMap(null) }
}

function clearPolygons(items: Array<{ polygon: PolygonInstance; listeners: Listener[] }>) {
  for (const item of items) { for (const listener of item.listeners) listener.remove(); item.polygon.setMap(null) }
}

function countyStyle(name: string, selectedCounty: string | null | undefined, available: boolean) {
  const selected = !!selectedCounty && sameLocation(name, selectedCounty)
  return {
    strokeColor: '#282824',
    strokeOpacity: selected ? 1 : available ? .72 : .34,
    strokeWeight: selected ? 2.5 : 1,
    fillColor: '#b95636',
    fillOpacity: selected ? .09 : 0,
    zIndex: selected ? 4 : 2,
  }
}

function applyCamera(map: MapInstance, selectedCounty: string | null | undefined, viewportWidth?: number) {
  if (!window.google) return
  const viewport = mapViewport(selectedCounty)
  const compact = !!viewportWidth && viewportWidth < 600
  // Area selection filters and highlights; it deliberately keeps the entire
  // county in view so every sibling area remains directly clickable.
  if (!selectedCounty) {
    map.setOptions({
      minZoom: compact ? 5 : 7.25,
      restriction: { latLngBounds: irelandOverviewRestriction, strictBounds: true },
    })
    map.setCenter({ lat: 53.42, lng: -8.05 })
    map.setZoom(compact ? 5 : 7.25)
    return
  }
  map.setCenter({
    lat: (viewport.bounds.south + viewport.bounds.north) / 2,
    lng: (viewport.bounds.west + viewport.bounds.east) / 2,
  })
  const span = Math.max(viewport.bounds.east - viewport.bounds.west, viewport.bounds.north - viewport.bounds.south)
  const desktopZoom = span > 2 ? 8 : span > 1 ? 9 : span > .5 ? 10 : 11
  const countyZoom = compact ? desktopZoom - 1 : desktopZoom
  map.setOptions({
    minZoom: Math.max(6, countyZoom - 1),
    restriction: { latLngBounds: viewport.restriction, strictBounds: false },
  })
  map.setZoom(countyZoom)
}

function markerIcon(selected: boolean, label: string) {
  const fill = selected ? '#b95636' : '#171715'
  const width = Math.max(62, 30 + label.length * 8)
  const scaledWidth = selected ? width * 1.08 : width
  const scaledHeight = selected ? 43 : 40
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="40" viewBox="0 0 ${width} 40"><rect x="1" y="1" width="${width - 2}" height="31" rx="15.5" fill="${fill}" stroke="#f7f4ed" stroke-width="2"/><text x="${width / 2}" y="21" text-anchor="middle" fill="#f7f4ed" font-family="Arial,sans-serif" font-size="12" font-weight="700">${escapeXML(label)}</text><path d="m${width / 2 - 4} 32 4 7 4-7" fill="${fill}"/></svg>`)}`,
    scaledSize: { width: scaledWidth, height: scaledHeight },
    anchor: { x: scaledWidth / 2, y: scaledHeight },
  }
}

function escapeXML(value: string) {
  return value.replace(/[<>&'"]/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[character] ?? character)
}

function polygonArea(path: Array<{ lat: number; lng: number }>) {
  let area = 0
  for (let current = 0, previous = path.length - 1; current < path.length; previous = current++) {
    area += path[previous].lng * path[current].lat - path[current].lng * path[previous].lat
  }
  return Math.abs(area / 2)
}

function signedPolygonArea(path: Array<{ lat: number; lng: number }>) {
  let area = 0
  for (let current = 0, previous = path.length - 1; current < path.length; previous = current++) {
    area += path[previous].lng * path[current].lat - path[current].lng * path[previous].lat
  }
  return area / 2
}

function groupPolygonRings(paths: Array<Array<{ lat: number; lng: number }>>) {
  const shapes = paths
    .filter((path) => signedPolygonArea(path) < 0)
    .map((outer) => [outer])

  for (const hole of paths.filter((path) => signedPolygonArea(path) >= 0)) {
    const owner = shapes.find(([outer]) => pointInRing(hole[0], outer))
    if (owner) owner.push(hole)
  }
  return shapes.length > 0 ? shapes : paths.map((path) => [path])
}

function pointInRing(point: { lat: number; lng: number }, path: Array<{ lat: number; lng: number }>) {
  let inside = false
  for (let current = 0, previous = path.length - 1; current < path.length; previous = current++) {
    const a = path[current]
    const b = path[previous]
    const intersects = (a.lat > point.lat) !== (b.lat > point.lat)
      && point.lng < (b.lng - a.lng) * (point.lat - a.lat) / (b.lat - a.lat) + a.lng
    if (intersects) inside = !inside
  }
  return inside
}

function compactEuros(priceCents: number) {
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1 }).format(priceCents / 100)
}

function sameLocation(left: string, right: string) { return left.localeCompare(right, undefined, { sensitivity: 'base' }) === 0 }

const openHausMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#dedbd3' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#4f4d48' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f3f1eb' }, { weight: 3 }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#a5a29a' }] },
  { featureType: 'administrative.country', elementType: 'labels.text.fill', stylers: [{ color: '#171715' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#272622' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#d7d8cf' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#e5e2da' }] },
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#c8d1c1' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#f8f6f0' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#cbc7be' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#f5efe1' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#b8aa8b' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#c4c1b8' }] },
  { featureType: 'transit.station', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#b9c9c9' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#596969' }] },
]

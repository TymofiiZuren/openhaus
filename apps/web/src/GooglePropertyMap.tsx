import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Property } from './api/properties'
import { administrativeAreaAttribution, type AdministrativeArea } from './administrativeAreas'
import { countyBoundaries, countyBoundaryAttribution, mapViewport } from './countyBoundaries'
import { loadGoogleMaps } from './googleMapsLoader'
import type { Listener, MapInstance, MarkerInstance, PolygonInstance } from './googleMapsLoader'
import { groupPropertiesForMap } from './mapListingGroups'
import { PropertyImageCarousel } from './PropertyImageCarousel'

const irelandOverviewRestriction = {
  west: -14.4,
  south: 50.2,
  east: -1.7,
  north: 56.6,
}
type MapPolygon = { name: string; kind: 'county' | 'area'; polygon: PolygonInstance; listeners: Listener[]; available: boolean }
type MapMarker = { ids: string[]; count: number; marker: MarkerInstance; listeners: Listener[] }

type GooglePropertyMapProps = {
  properties: Property[]
  selectedPropertyID?: string
  selectedCounty?: string | null
  selectedArea?: string
  cameraRequestKey?: number
  areas: AdministrativeArea[]
  availableCounties: string[]
  onSelectCounty: (county: string | null) => void
  onSelectArea: (area: string) => void
  onSelectProperty: (property: Property) => void
  onDismissProperty: () => void
}
export function GooglePropertyMap({ properties, selectedPropertyID, selectedCounty, selectedArea, cameraRequestKey = 0, areas, availableCounties, onSelectCounty, onSelectArea, onSelectProperty, onDismissProperty }: GooglePropertyMapProps) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<MapInstance | undefined>(undefined)
  const markers = useRef<MapMarker[]>([])
  const polygons = useRef<MapPolygon[]>([])
  const mapListeners = useRef<Listener[]>([])
  const onCountySelect = useRef(onSelectCounty)
  const onAreaSelect = useRef(onSelectArea)
  const onPropertySelect = useRef(onSelectProperty)
  const onDismiss = useRef(onDismissProperty)
  const suppressViewportDismiss = useRef(false)
  const [previewHost, setPreviewHost] = useState<HTMLElement>()
  const selectedCountyRef = useRef(selectedCounty)
  const selectedAreaRef = useRef(selectedArea)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [mapType, setMapType] = useState<'roadmap' | 'satellite'>('roadmap')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined
  const attribution = selectedCounty && areas.length > 0 ? administrativeAreaAttribution : countyBoundaryAttribution

  useEffect(() => { onCountySelect.current = onSelectCounty }, [onSelectCounty])
  useEffect(() => { onAreaSelect.current = onSelectArea }, [onSelectArea])
  useEffect(() => { onPropertySelect.current = onSelectProperty }, [onSelectProperty])
  useEffect(() => { onDismiss.current = onDismissProperty }, [onDismissProperty])
  useEffect(() => { selectedCountyRef.current = selectedCounty }, [selectedCounty])
  useEffect(() => { selectedAreaRef.current = selectedArea }, [selectedArea])

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
          clickableIcons: false, gestureHandling: 'greedy', scrollwheel: true, styles: openHausMapStyle,
          restriction: { latLngBounds: ireland.restriction, strictBounds: true },
        })
        const dragListener = map.current.addListener('dragstart', () => onDismiss.current())
        const zoomListener = map.current.addListener('zoom_changed', () => {
          if (!suppressViewportDismiss.current) onDismiss.current()
        })
        mapListeners.current = [dragListener, zoomListener]
        setStatus('ready')
      })
      .catch(() => { if (!cancelled) setStatus('error') })
    return () => { cancelled = true }
  }, [apiKey])

  useEffect(() => {
    if (status !== 'ready' || !map.current || !window.google) return
    clearMarkers(markers.current)
    const maps = window.google.maps
    markers.current = groupPropertiesForMap(properties, selectedCounty).map((group) => {
      const marker = new maps.Marker({
        map: map.current,
        position: group.position,
        title: `${group.properties.length} ${group.properties.length === 1 ? 'home' : 'homes'} in ${group.label}`,
        icon: markerIcon(false, group.markerLabel),
        zIndex: 1,
      })
      const listeners = selectedCounty && group.properties.length === 1
        ? [marker.addListener('click', () => onPropertySelect.current(group.properties[0]))]
        : []
      return { ids: group.properties.map((property) => property.id), count: group.properties.length, marker, listeners }
    })
  }, [properties, selectedCounty, status])

  useEffect(() => {
    if (status !== 'ready' || !map.current || !window.google) return
    clearPolygons(polygons.current)
    const maps = window.google.maps
    // Keep neighbouring counties available during county-level exploration so
    // buyers can switch location directly without returning to Ireland first.
    const visibleCountyBoundaries = countyBoundaries
    const countyPolygons = visibleCountyBoundaries.flatMap((county) => county.paths.map((path) => {
      const available = availableCounties.some((name) => sameLocation(name, county.name))
      const selected = sameLocation(county.name, selectedCounty ?? '')
      const polygon = new maps.Polygon({
        map: map.current,
        paths: path,
        clickable: available && !selected,
        strokeColor: '#294039',
        strokeOpacity: selected ? 1 : available ? .54 : .22,
        strokeWeight: selected ? 2.5 : 1,
        fillColor: '#d56f4b',
        fillOpacity: selected ? .035 : 0,
        zIndex: selected ? 2 : 1,
      })
      const listeners = available && !selected ? [
        polygon.addListener('click', () => onCountySelect.current(county.name)),
        polygon.addListener('mouseover', () => {
          polygon.setOptions({ fillOpacity: .1, strokeOpacity: 1, strokeWeight: 2 })
        }),
        polygon.addListener('mouseout', () => polygon.setOptions(countyStyle(county.name, selectedCountyRef.current, available))),
      ] : []
      return { name: county.name, kind: 'county' as const, polygon, listeners, available }
    }))
    const areaShapes = selectedCounty
      ? areas.flatMap((area) => groupPolygonRings(area.paths).map((paths) => ({ area, paths, size: polygonArea(paths[0]) })))
        .filter(({ size }) => size >= .00005)
        .sort((left, right) => right.size - left.size)
      : []
    const areaPolygons = areaShapes.map(({ area, paths }, areaIndex) => {
      const selected = sameLocation(area.name, selectedAreaRef.current ?? '')
      const polygon = new maps.Polygon({
        map: map.current,
        paths,
        clickable: true,
        strokeColor: '#294039',
        strokeOpacity: selected ? .95 : .62,
        strokeWeight: selected ? 1.5 : .8,
        fillColor: selected ? '#d56f4b' : areaIndex % 2 === 0 ? '#e3ebe7' : '#d6e2dc',
        fillOpacity: selected ? .22 : .08,
        // Large county regions are drawn first. Compact city polygons sit above
        // them so both remain independently visible and clickable.
        zIndex: 3 + areaIndex,
      })
      const listeners = [
        polygon.addListener('click', () => onAreaSelect.current(area.name)),
        polygon.addListener('mouseover', () => polygon.setOptions({ fillOpacity: sameLocation(area.name, selectedAreaRef.current ?? '') ? .22 : .14, strokeOpacity: .9 })),
        polygon.addListener('mouseout', () => polygon.setOptions(areaStyle(area.name, selectedAreaRef.current))),
      ]
      return { name: area.name, kind: 'area' as const, polygon, listeners, available: true }
    })
    polygons.current = [...countyPolygons, ...areaPolygons]
    return () => {
      clearPolygons(polygons.current)
    }
  }, [areas, availableCounties, selectedCounty, status])

  useEffect(() => {
    for (const item of polygons.current) {
      if (item.kind === 'area') item.polygon.setOptions(areaStyle(item.name, selectedArea))
    }
  }, [selectedArea])

  useEffect(() => {
    if (!selectedCounty) for (const item of polygons.current) item.polygon.setOptions(countyStyle(item.name, selectedCounty, item.available))
  }, [cameraRequestKey, selectedCounty, status])

  useEffect(() => {
    const handleFullscreenChange = () => {
      const stage = container.current?.closest('.map-stage')
      setIsFullscreen(document.fullscreenElement === stage)
      requestAnimationFrame(() => {
        if (!map.current || !window.google) return
        window.google.maps.event?.trigger(map.current, 'resize')
        applyCamera(map.current, selectedCountyRef.current, container.current?.clientWidth)
      })
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  useEffect(() => {
    if (status !== 'ready' || !map.current || !window.google) return
    applyCamera(map.current, selectedCounty, container.current?.clientWidth)
  }, [selectedCounty, status])

  useEffect(() => {
    for (const item of markers.current) {
      const selected = !!selectedPropertyID && item.ids.includes(selectedPropertyID)
      const property = selectedCounty && item.ids.length === 1 ? properties.find((candidate) => candidate.id === item.ids[0]) : undefined
      item.marker.setIcon(markerIcon(selected, property ? compactPrice(property.priceCents) : String(item.count)))
      item.marker.setZIndex(selected ? 10 : 1)
    }
    if (!selectedPropertyID || !map.current) return
    const selectedProperty = properties.find((property) => property.id === selectedPropertyID)
    if (!selectedProperty) return
    suppressViewportDismiss.current = true
    moveCamera(map.current, { lat: selectedProperty.latitude, lng: selectedProperty.longitude }, 14)
    const idleListener = map.current.addListener('idle', () => {
      suppressViewportDismiss.current = false
      idleListener.remove()
    })
  }, [properties, selectedCounty, selectedPropertyID])

  useEffect(() => {
    if (status !== 'ready' || !map.current || !window.google || !selectedPropertyID) {
      setPreviewHost(undefined)
      return
    }
    const selectedMarker = markers.current.find((item) => item.ids.includes(selectedPropertyID))
    if (!selectedMarker) return
    const host = document.createElement('div')
    const infoWindow = new window.google.maps.InfoWindow({ content: host, disableAutoPan: true, maxWidth: 640 })
    const closeListener = infoWindow.addListener('closeclick', () => onDismiss.current())
    infoWindow.open({ map: map.current, anchor: selectedMarker.marker })
    setPreviewHost(host)
    return () => {
      closeListener.remove()
      infoWindow.close()
      setPreviewHost(undefined)
    }
  }, [selectedPropertyID, status])

  useEffect(() => () => {
    clearMarkers(markers.current)
    clearPolygons(polygons.current)
    for (const listener of mapListeners.current) listener.remove()
  }, [])

  if (!apiKey || status === 'error') {
    return (
      <div className="map-unavailable" role="status">
        <svg viewBox="0 0 48 48" aria-hidden="true"><path d="m7 12 11-5 12 5 11-5v29l-11 5-12-5-11 5zM18 7v29m12-24v29" /></svg>
        <div><strong>Map view is unavailable right now.</strong><p>Choose a county or town from the list. Every available home remains accessible.</p></div>
      </div>
    )
  }

  function changeMapType(type: 'roadmap' | 'satellite') {
    onDismiss.current()
    map.current?.setMapTypeId(type)
    setMapType(type)
  }

  function recenterCurrentArea() {
    if (!map.current || !window.google) return
    onDismiss.current()
    applyCamera(map.current, selectedCounty, container.current?.clientWidth)
  }

  async function toggleFullscreen() {
    const stage = container.current?.closest<HTMLElement>('.map-stage')
    if (!stage) return
    if (document.fullscreenElement === stage) await document.exitFullscreen()
    else await stage.requestFullscreen()
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
            <button type="button" aria-label={isFullscreen ? 'Exit full screen map' : 'Open full screen map'} aria-pressed={isFullscreen} onClick={toggleFullscreen}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d={isFullscreen ? 'M9 3v6H3m18 0h-6V3M3 15h6v6m6 0v-6h6' : 'M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6'} /></svg>
            </button>
          </div>
        </div>
      )}
      <a className="county-attribution" href={attribution.url} target="_blank" rel="noreferrer">{attribution.label}</a>
      {previewHost && selectedPropertyID && createPortal(<MapPropertyPreview property={properties.find((property) => property.id === selectedPropertyID)} />, previewHost)}
    </>
  )
}

function MapPropertyPreview({ property }: { property?: Property }) {
  if (!property) return null
  return <article className="map-property-preview" aria-label={`Preview ${property.title}`}>
    <PropertyImageCarousel property={property} className="map-preview-gallery" />
    <div className="map-preview-copy"><small>Asking price</small><b>{euros(property.priceCents)}</b><strong>{property.title}</strong><span className="map-preview-location">{property.city} · Co. {property.county}</span><a className="map-preview-action" href={`/properties/${property.id}`} aria-label={`View details for ${property.title}`}>View property <span aria-hidden="true">→</span></a></div>
  </article>
}

function euros(priceCents: number) { return new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(priceCents / 100) }
function compactPrice(priceCents: number) {
  const value = priceCents / 100
  if (value >= 1_000_000) return `€${(value / 1_000_000).toFixed(value % 1_000_000 ? 1 : 0)}m`
  return `€${Math.round(value / 1_000)}k`
}

function clearMarkers(items: Array<{ marker: MarkerInstance; listeners: Listener[] }>) {
  for (const item of items) { for (const listener of item.listeners) listener.remove(); item.marker.setMap(null) }
}

function clearPolygons(items: Array<{ polygon: PolygonInstance; listeners: Listener[] }>) {
  for (const item of items) { for (const listener of item.listeners) listener.remove(); item.polygon.setMap(null) }
}

function countyStyle(name: string, selectedCounty: string | null | undefined, available: boolean) {
  const selected = !!selectedCounty && sameLocation(name, selectedCounty)
  return {
    strokeColor: '#294039',
    strokeOpacity: selected ? 1 : available ? .72 : .34,
    strokeWeight: selected ? 2.5 : 1,
    fillColor: '#d56f4b',
    fillOpacity: selected ? .09 : 0,
    zIndex: selected ? 4 : 2,
  }
}

function areaStyle(name: string, selectedArea: string | undefined) {
  const selected = sameLocation(name, selectedArea ?? '')
  return {
    strokeColor: '#294039',
    strokeOpacity: selected ? .95 : .62,
    strokeWeight: selected ? 1.5 : .8,
    fillColor: selected ? '#d56f4b' : '#e3ebe7',
    fillOpacity: selected ? .22 : .08,
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
      minZoom: 5,
      restriction: { latLngBounds: irelandOverviewRestriction, strictBounds: true },
    })
    moveCamera(map, { lat: 53.35, lng: -8 }, compact ? 5 : 6)
    return
  }
  const center = {
    lat: (viewport.bounds.south + viewport.bounds.north) / 2,
    lng: (viewport.bounds.west + viewport.bounds.east) / 2,
  }
  const span = Math.max(viewport.bounds.east - viewport.bounds.west, viewport.bounds.north - viewport.bounds.south)
  const desktopZoom = span > 2 ? 8 : span > 1 ? 9 : span > .5 ? 10 : 11
  const countyZoom = (compact ? desktopZoom - 1 : desktopZoom) + (sameLocation(selectedCounty, 'Cork') ? 1.1 : 0)
  map.setOptions({
    minZoom: 5,
    restriction: { latLngBounds: irelandOverviewRestriction, strictBounds: true },
  })
  moveCamera(map, center, countyZoom)
}

function moveCamera(map: MapInstance, center: { lat: number; lng: number }, zoom: number) {
  if (map.moveCamera) {
    map.moveCamera({ center, zoom })
    return
  }
  map.setCenter(center)
  map.setZoom(zoom)
}

function markerIcon(selected: boolean, label: string) {
  const fill = selected ? '#d56f4b' : '#1d2b26'
  const width = Math.max(62, 30 + label.length * 8)
  const scaledWidth = selected ? width * 1.08 : width
  const scaledHeight = selected ? 43 : 40
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="40" viewBox="0 0 ${width} 40"><rect x="1" y="1" width="${width - 2}" height="31" rx="15.5" fill="${fill}" stroke="#f5f7f3" stroke-width="2"/><text x="${width / 2}" y="21" text-anchor="middle" fill="#f5f7f3" font-family="Helvetica,Arial,sans-serif" font-size="12" font-weight="700">${escapeXML(label)}</text><path d="m${width / 2 - 4} 32 4 7 4-7" fill="${fill}"/></svg>`)}`,
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

function sameLocation(left: string, right: string) { return left.localeCompare(right, undefined, { sensitivity: 'base' }) === 0 }

const openHausMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#dedbd3' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#4f4d48' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f3f1eb' }, { weight: 3 }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#a5a29a' }] },
  { featureType: 'administrative.province', elementType: 'geometry.stroke', stylers: [{ visibility: 'off' }] },
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

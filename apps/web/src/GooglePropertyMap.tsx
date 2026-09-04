import { useEffect, useRef, useState } from 'react'
import type { Property } from './api/properties'
import { administrativeAreaAttribution, type AdministrativeArea } from './administrativeAreas'
import { countyBoundaries, countyBoundaryAttribution, mapViewport } from './countyBoundaries'
import { loadGoogleMaps } from './googleMapsLoader'
import type { Listener, MapInstance, MarkerInstance, PolygonInstance } from './googleMapsLoader'
import { groupPropertiesForMap } from './mapListingGroups'
import { fitCameraImmediately } from './mapCamera'

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
  const failureObserver = useRef<MutationObserver | undefined>(undefined)
  const onCountySelect = useRef(onSelectCounty)
  const onAreaSelect = useRef(onSelectArea)
  const onPropertySelect = useRef(onSelectProperty)
  const onDismiss = useRef(onDismissProperty)
  const previousCamera = useRef<{ geography: string; property?: string } | null>(null)
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
          // Cooperative mode supplies the tinted modifier-key hint, preserves
          // page scrolling and accepts intentional Ctrl/Command-scroll zoom.
          // Do not set scrollwheel:false: it also disables intentional zoom.
          clickableIcons: false, gestureHandling: 'cooperative', disableDoubleClickZoom: true, zoomControl: true, styles: openHausMapStyle,
          restriction: { latLngBounds: ireland.restriction, strictBounds: true },
        })
        const dragListener = map.current.addListener('dragstart', () => onDismiss.current())
        mapListeners.current = [dragListener]
        const reportProviderFailure = () => {
          if (!container.current?.querySelector('.gm-err-container, .gm-err-message')) return false
          container.current.replaceChildren()
          setStatus('error')
          return true
        }
        failureObserver.current?.disconnect()
        if (!reportProviderFailure()) {
          failureObserver.current = new MutationObserver(() => {
            if (reportProviderFailure()) failureObserver.current?.disconnect()
          })
          failureObserver.current.observe(container.current, { childList: true, subtree: true })
          setStatus('ready')
        }
      })
      .catch(() => { if (!cancelled) setStatus('error') })
    return () => { cancelled = true }
  }, [apiKey])

  useEffect(() => {
    if (status !== 'ready' || !map.current || !window.google) return
    clearMarkers(markers.current)
    const maps = window.google.maps
    markers.current = groupPropertiesForMap(properties, selectedCounty, selectedArea).map((group) => {
      const selected = !!selectedPropertyID && group.properties.some((property) => property.id === selectedPropertyID)
      const marker = new maps.Marker({
        map: map.current,
        position: group.position,
        title: `${group.properties.length} ${group.properties.length === 1 ? 'home' : 'homes'} in ${group.label}`,
        icon: markerIcon(selected, group.markerLabel),
        zIndex: selected ? 10 : 1,
      })
      const listeners = selectedCounty && selectedArea && group.properties.length === 1
        ? [marker.addListener('click', () => onPropertySelect.current(group.properties[0]))]
        : []
      return { ids: group.properties.map((property) => property.id), count: group.properties.length, marker, listeners }
    })
  }, [properties, selectedArea, selectedCounty, selectedPropertyID, status])

  useEffect(() => {
    if (status !== 'ready' || !map.current || !window.google) return
    clearPolygons(polygons.current)
    const maps = window.google.maps
    // Keep neighbouring counties available during county-level exploration so
    // buyers can switch location directly without returning to Ireland first.
    const visibleCountyBoundaries = countyBoundaries
    // Keep all rings together: preserves holes and gives each county one
    // interaction target rather than thousands of separate island overlays.
    const countyPolygons = visibleCountyBoundaries.map((county) => {
      const available = availableCounties.some((name) => sameLocation(name, county.name))
      const selected = sameLocation(county.name, selectedCounty ?? '')
      const polygon = new maps.Polygon({
        map: map.current,
        paths: county.paths,
        clickable: available && !selected,
        ...countyStyle(county.name, selectedCounty, available),
      })
      const listeners = available && !selected ? [
        polygon.addListener('click', () => onCountySelect.current(county.name)),
        polygon.addListener('mouseover', () => {
          polygon.setOptions({ fillOpacity: .06, strokeOpacity: .9 })
        }),
        polygon.addListener('mouseout', () => polygon.setOptions(countyStyle(county.name, selectedCountyRef.current, available))),
      ] : []
      return { name: county.name, kind: 'county' as const, polygon, listeners, available }
    })
    const areaShapes = selectedCounty
      ? areas.flatMap((area) => groupPolygonRings(area.paths).map((paths) => ({ area, paths, size: polygonArea(paths[0]) })))
        .filter(({ size }) => size >= .00005)
        .sort((left, right) => right.size - left.size)
      : []
    const areaPolygons = areaShapes.map(({ area, paths }, areaIndex) => {
      const polygon = new maps.Polygon({
        map: map.current,
        paths,
        clickable: true,
        ...areaStyle(area.name, selectedAreaRef.current),
        // Large county regions are drawn first. Compact city polygons sit above
        // them so both remain independently visible and clickable.
        zIndex: 3 + areaIndex,
      })
      const listeners = [
        polygon.addListener('click', () => onAreaSelect.current(area.name)),
        polygon.addListener('mouseover', () => polygon.setOptions({ fillOpacity: sameLocation(area.name, selectedAreaRef.current ?? '') ? .12 : .07, strokeOpacity: .85 })),
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
    const geography = JSON.stringify([selectedCounty, selectedArea, cameraRequestKey])
    const previous = previousCamera.current
    previousCamera.current = { geography, property: selectedPropertyID }
    // Dismissing a popup (including by dragging) must not undo the user's pan.
    if (previous?.geography === geography && (!selectedPropertyID || previous.property === selectedPropertyID)) return
    const selectedProperty = properties.find((property) => property.id === selectedPropertyID)
    const area = selectedArea && areas.find(candidate => sameLocation(candidate.name, selectedArea))
    if (selectedProperty) moveCamera(map.current, { lat: selectedProperty.latitude, lng: selectedProperty.longitude }, 14)
    else if (area) focusArea(map.current, area)
    else applyCamera(map.current, selectedCounty, container.current?.clientWidth)
  }, [areas, cameraRequestKey, properties, selectedArea, selectedCounty, selectedPropertyID, status])

  useEffect(() => () => {
    failureObserver.current?.disconnect()
    clearMarkers(markers.current)
    clearPolygons(polygons.current)
    for (const listener of mapListeners.current) listener.remove()
  }, [])

  if (!apiKey || status === 'error') {
    return (
      <div className="map-unavailable" role="status">
        <svg viewBox="0 0 48 48" aria-hidden="true"><path d="m7 12 11-5 12 5 11-5v29l-11 5-12-5-11 5zM18 7v29m12-24v29" /></svg>
        <div><strong>Map is not available.</strong><p>Use Choose location to browse every available county and local area.</p></div>
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
    const area = selectedArea && areas.find((candidate) => sameLocation(candidate.name, selectedArea))
    if (area) focusArea(map.current, area)
    else applyCamera(map.current, selectedCounty, container.current?.clientWidth)
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
    </>
  )
}
function clearMarkers(items: Array<{ marker: MarkerInstance; listeners: Listener[] }>) {
  for (const item of items) { for (const listener of item.listeners) listener.remove(); item.marker.setMap(null) }
}

function clearPolygons(items: Array<{ polygon: PolygonInstance; listeners: Listener[] }>) {
  for (const item of items) { for (const listener of item.listeners) listener.remove(); item.polygon.setMap(null) }
}

export function countyStyle(name: string, selectedCounty: string | null | undefined, available: boolean) {
  const selected = !!selectedCounty && sameLocation(name, selectedCounty)
  return {
    strokeColor: '#3a2d28',
    strokeOpacity: selected ? .95 : available ? .5 : .26,
    strokeWeight: selected ? 3 : 1,
    fillColor: '#d56f4b',
    fillOpacity: selected ? .025 : 0,
    zIndex: selected ? 2 : 1,
  }
}

export function areaStyle(name: string, selectedArea: string | undefined) {
  const selected = sameLocation(name, selectedArea ?? '')
  return {
    strokeColor: selected ? '#884531' : '#655d55',
    strokeOpacity: selected ? .95 : .48,
    strokeWeight: selected ? 2 : .8,
    fillColor: selected ? '#d56f4b' : '#eee2d7',
    fillOpacity: selected ? .12 : .025,
  }
}

export function applyCamera(map: MapInstance, selectedCounty: string | null | undefined, viewportWidth?: number) {
  if (!window.google) return
  const viewport = mapViewport(selectedCounty)
  const compact = !!viewportWidth && viewportWidth < 600
  if (viewport.mode === 'ireland') {
    map.setOptions({
      minZoom: 5,
      restriction: { latLngBounds: irelandOverviewRestriction, strictBounds: true },
    })
    moveCamera(map, { lat: 53.35, lng: -8 }, compact ? 5 : 6)
    return
  }
  map.setOptions({
    minZoom: 5,
    restriction: { latLngBounds: irelandOverviewRestriction, strictBounds: true },
  })
  // Fit the real outline to both viewport dimensions, without county-specific
  // zoom guesses. Leave room for floating controls and coastal islands.
  fitCameraImmediately(map, [
    { lat: viewport.bounds.south, lng: viewport.bounds.west },
    { lat: viewport.bounds.north, lng: viewport.bounds.east },
  ], compact ? 48 : 64)
}

function moveCamera(map: MapInstance, center: { lat: number; lng: number }, zoom: number) {
  if (map.moveCamera) {
    map.moveCamera({ center, zoom })
    return
  }
  map.setCenter(center)
  map.setZoom(zoom)
}

function focusArea(map: MapInstance, area: AdministrativeArea) {
  if (!window.google) return
  fitCameraImmediately(map, area.paths.flat(), 72)
}

function markerIcon(selected: boolean, label: string) {
  const width = Math.max(70, 30 + label.length * 9)
  const fill = selected ? '#d56f4b' : '#211b18'
  const escapedLabel = label.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="46" viewBox="0 0 ${width} 46"><path d="M12 2h${width - 24}a10 10 0 0 1 10 10v14a10 10 0 0 1-10 10H${width / 2 + 6}L${width / 2} 44l-6-8H12A10 10 0 0 1 2 26V12A10 10 0 0 1 12 2Z" fill="${fill}" stroke="#fffdfa" stroke-width="${selected ? 3 : 2}"/><text x="${width / 2}" y="23" fill="#fffdfa" font-family="Arial,sans-serif" font-size="13" font-weight="700" text-anchor="middle">${escapedLabel}</text></svg>`
  return { url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}` }
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
  { elementType: 'geometry', stylers: [{ color: '#e9e3d8' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#53615c' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f7f2e9' }, { weight: 3 }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#aeb8b2' }] },
  { featureType: 'administrative.province', elementType: 'geometry.stroke', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.country', elementType: 'labels.text.fill', stylers: [{ color: '#211b18' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#3a2d28' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#e9e1d7' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#eee9df' }] },
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#dedbc9' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#fffaf1' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#d8d0c3' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#f2d7c9' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#c99579' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#c9c6bb' }] },
  { featureType: 'transit.station', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#cbd7d8' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#667477' }] },
]

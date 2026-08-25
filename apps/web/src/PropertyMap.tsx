import { lazy, Suspense, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import countyData from './data/irelandCounties.json'
import type { MapBounds, Property } from './api/properties'
import { IRELAND_MAP_BOUNDS } from './mapBounds'

const StreetMap = lazy(() => import('./StreetMap').then((module) => ({ default: module.StreetMap })))

type ViewBox = { x: number; y: number; width: number; height: number }
type Drag = { pointerID: number; clientX: number; clientY: number; viewBox: ViewBox; captured: boolean }

const fullViewBox: ViewBox = { x: 0, y: 0, width: countyData.projection.width, height: countyData.projection.height }
export function PropertyMap({ properties, onBoundsChange }: { properties: Property[]; onBoundsChange: (bounds: MapBounds) => void }) {
  const [activeCounty, setActiveCounty] = useState<string>()
  const [streetCounty, setStreetCounty] = useState<string>()
  const [viewBox, setViewBox] = useState(fullViewBox)
  const drag = useRef<Drag | undefined>(undefined)
  const dragged = useRef(false)
  const countyProperties = activeCounty
    ? properties.filter((property) => sameLocation(property.county, activeCounty))
    : properties

  useEffect(() => {
    const timeout = window.setTimeout(() => onBoundsChange(boundsForViewBox(viewBox)), 250)
    return () => window.clearTimeout(timeout)
  }, [onBoundsChange, viewBox])

  function selectCounty(county: string) {
    setActiveCounty(county)
  }

  function viewCounty() {
    if (!activeCounty) return
    const county = countyData.counties.find((item) => item.name === activeCounty)
    if (!county) return
    setStreetCounty(activeCounty)
    onBoundsChange(county.bounds as MapBounds)
  }

  function returnToIreland() {
    setStreetCounty(undefined)
    setActiveCounty(undefined)
    setViewBox(fullViewBox)
    onBoundsChange(IRELAND_MAP_BOUNDS)
  }

  function reset() {
    setActiveCounty(undefined)
    setStreetCounty(undefined)
    setViewBox(fullViewBox)
  }

  function startDrag(event: PointerEvent<SVGSVGElement>) {
    drag.current = { pointerID: event.pointerId, clientX: event.clientX, clientY: event.clientY, viewBox, captured: false }
    dragged.current = false
  }

  function moveDrag(event: PointerEvent<SVGSVGElement>) {
    if (!drag.current || drag.current.pointerID !== event.pointerId) return
    const rectangle = event.currentTarget.getBoundingClientRect()
    if (rectangle.width === 0 || rectangle.height === 0) return
    const deltaX = event.clientX - drag.current.clientX
    const deltaY = event.clientY - drag.current.clientY
    if (Math.hypot(deltaX, deltaY) > 3) {
      dragged.current = true
      if (!drag.current.captured) {
        event.currentTarget.setPointerCapture?.(event.pointerId)
        drag.current.captured = true
      }
    }
    setViewBox(constrainViewBox({
      ...drag.current.viewBox,
      x: drag.current.viewBox.x - deltaX * drag.current.viewBox.width / rectangle.width,
      y: drag.current.viewBox.y - deltaY * drag.current.viewBox.height / rectangle.height,
    }))
  }

  function finishDrag(event: PointerEvent<SVGSVGElement>) {
    if (drag.current?.pointerID !== event.pointerId) return
    const captured = drag.current.captured
    drag.current = undefined
    if (captured) event.currentTarget.releasePointerCapture?.(event.pointerId)
  }

  return (
    <section className="map-explorer" aria-label="Explore homes by location">
      <div className="map-copy">
        <p className="eyebrow">Explore by location</p>
        <h2>Start with the map.</h2>
        <p>Choose a county, then open its street map to explore available homes.</p>
      </div>
      {streetCounty ? (
        <Suspense fallback={<div className="street-map-loading" role="status">Loading street map…</div>}>
          <StreetMap
            county={streetCounty}
            countyBounds={countyData.counties.find((county) => county.name === streetCounty)?.bounds as MapBounds}
            properties={properties.filter((property) => sameLocation(property.county, streetCounty))}
            onBack={returnToIreland}
            onBoundsChange={onBoundsChange}
          />
        </Suspense>
      ) : <div className="map-layout">
        <div className="ireland-map-frame">
          <div className="map-controls" aria-label="Map controls">
            <button type="button" aria-label="Zoom in" onClick={() => setViewBox((current) => zoomViewBox(current, .72))}>+</button>
            <button type="button" aria-label="Zoom out" disabled={isFullView(viewBox)} onClick={() => setViewBox((current) => zoomViewBox(current, 1 / .72))}>−</button>
          </div>
          <svg
            className="ireland-map"
            viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
            role="img"
            aria-label="Map of Ireland divided by county"
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={finishDrag}
            onPointerCancel={finishDrag}
            onClickCapture={(event) => {
              if (!dragged.current) return
              event.preventDefault()
              event.stopPropagation()
              dragged.current = false
            }}
          >
            <g className="county-layer">
              {countyData.counties.map((county) => {
                const count = properties.filter((property) => sameLocation(property.county, county.name)).length
                return (
                  <path
                    key={county.name}
                    d={county.d}
                    className="county-shape"
                    role="button"
                    tabIndex={0}
                    aria-label={`${county.name}, ${homeCount(count)}`}
                    aria-pressed={activeCounty === county.name}
                    onClick={() => selectCounty(county.name)}
                    onKeyDown={(event) => activateWithKeyboard(event, () => selectCounty(county.name))}
                  />
                )
              })}
            </g>
          </svg>
          <a className="map-attribution" href={countyData.source} target="_blank" rel="noreferrer">
            Tailte Éireann · CC BY 4.0
          </a>
        </div>
        <aside className="map-results" aria-live="polite">
          <button className="map-reset" type="button" onClick={reset} disabled={!activeCounty && isFullView(viewBox)}>
            All Ireland
          </button>
          {activeCounty ? (
            <>
              <p className="map-result-count">{homeCount(countyProperties.length)}</p>
              <h3>{activeCounty}</h3>
              <p>{countyProperties.length > 0
                ? `Explore streets and ${homeCount(countyProperties.length)} currently for sale.`
                : 'There are no published homes in this county yet.'}</p>
              <button className="county-view-button" type="button" onClick={viewCounty}>
                View {activeCounty} on street map
              </button>
            </>
          ) : (
            <>
              <p className="map-result-count">{homeCount(properties.length)}</p>
              <h3>Homes across Ireland</h3>
              <p>Select a county to see its cities and available homes.</p>
            </>
          )}
        </aside>
      </div>}
    </section>
  )
}

function boundsForViewBox(viewBox: ViewBox): MapBounds {
  const projection = countyData.projection
  const west = countyData.bounds.minLongitude + (viewBox.x - projection.offsetX) / (projection.cosineLatitude * projection.scale)
  const east = countyData.bounds.minLongitude + (viewBox.x + viewBox.width - projection.offsetX) / (projection.cosineLatitude * projection.scale)
  const north = countyData.bounds.maxLatitude - (viewBox.y - projection.offsetY) / projection.scale
  const south = countyData.bounds.maxLatitude - (viewBox.y + viewBox.height - projection.offsetY) / projection.scale
  return [
    round(Math.max(countyData.bounds.minLongitude, west)),
    round(Math.max(countyData.bounds.minLatitude, south)),
    round(Math.min(countyData.bounds.maxLongitude, east)),
    round(Math.min(countyData.bounds.maxLatitude, north)),
  ]
}

function zoomViewBox(viewBox: ViewBox, factor: number): ViewBox {
  const width = Math.min(fullViewBox.width, Math.max(fullViewBox.width / 4, viewBox.width * factor))
  const height = Math.min(fullViewBox.height, Math.max(fullViewBox.height / 4, viewBox.height * factor))
  return constrainViewBox({
    x: viewBox.x + (viewBox.width - width) / 2,
    y: viewBox.y + (viewBox.height - height) / 2,
    width,
    height,
  })
}

function constrainViewBox(viewBox: ViewBox): ViewBox {
  return {
    ...viewBox,
    x: Math.min(fullViewBox.width - viewBox.width, Math.max(0, viewBox.x)),
    y: Math.min(fullViewBox.height - viewBox.height, Math.max(0, viewBox.y)),
  }
}

function isFullView(viewBox: ViewBox) {
  return viewBox.x === 0 && viewBox.y === 0 && viewBox.width === fullViewBox.width && viewBox.height === fullViewBox.height
}

function round(value: number) { return Math.round(value * 1_000_000) / 1_000_000 }

function activateWithKeyboard(event: KeyboardEvent<SVGElement>, action: () => void) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    action()
  }
}

function sameLocation(left: string, right: string) { return left.localeCompare(right, undefined, { sensitivity: 'base' }) === 0 }
function homeCount(count: number) { return `${count} ${count === 1 ? 'home' : 'homes'}` }

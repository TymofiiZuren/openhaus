import { useEffect, useRef, useState } from 'react'
import { Map, NavigationControl, type GeoJSONSource, type MapLayerMouseEvent } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { MapBounds, Property } from './api/properties'

const propertySource = 'county-properties'

export function StreetMap({
  county,
  countyBounds,
  properties,
  onBack,
  onBoundsChange,
}: {
  county: string
  countyBounds: MapBounds
  properties: Property[]
  onBack: () => void
  onBoundsChange: (bounds: MapBounds) => void
}) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<Map | null>(null)
  const propertiesRef = useRef(properties)
  const boundsCallback = useRef(onBoundsChange)
  const moveTimeout = useRef<number | undefined>(undefined)
  const [selectedID, setSelectedID] = useState<string>()
  const [mapError, setMapError] = useState(() => !supportsWebGL2())
  const selected = properties.find((property) => property.id === selectedID)

  useEffect(() => {
    propertiesRef.current = properties
    boundsCallback.current = onBoundsChange
  }, [onBoundsChange, properties])

  useEffect(() => {
    if (!container.current) return
    if (!supportsWebGL2()) return

    let instance: Map
    try {
      instance = new Map({
        container: container.current,
        style: 'https://tiles.openfreemap.org/styles/liberty',
        bounds: [[countyBounds[0], countyBounds[1]], [countyBounds[2], countyBounds[3]]],
        fitBoundsOptions: { padding: 54 },
      })
    } catch {
      const errorTimeout = window.setTimeout(() => setMapError(true), 0)
      return () => window.clearTimeout(errorTimeout)
    }
    map.current = instance
    instance.addControl(new NavigationControl({ showCompass: false }), 'top-right')

    instance.on('load', () => {
      instance.addSource(propertySource, {
        type: 'geojson',
        data: propertiesToGeoJSON(propertiesRef.current),
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 46,
      })
      instance.addLayer({
        id: 'property-clusters',
        type: 'circle',
        source: propertySource,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#171715',
          'circle-radius': ['step', ['get', 'point_count'], 18, 10, 23, 50, 29],
          'circle-stroke-color': '#f4f1e9',
          'circle-stroke-width': 2,
        },
      })
      instance.addLayer({
        id: 'property-cluster-count',
        type: 'symbol',
        source: propertySource,
        filter: ['has', 'point_count'],
        layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12 },
        paint: { 'text-color': '#f4f1e9' },
      })
      instance.addLayer({
        id: 'individual-property',
        type: 'circle',
        source: propertySource,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': '#f4f1e9',
          'circle-radius': 8,
          'circle-stroke-color': '#171715',
          'circle-stroke-width': 3,
        },
      })

      instance.on('click', 'property-clusters', async (event) => {
        const feature = event.features?.[0]
        const clusterID = Number(feature?.properties?.cluster_id)
        if (!feature || !Number.isFinite(clusterID) || feature.geometry.type !== 'Point') return
        const source = instance.getSource(propertySource) as GeoJSONSource
        const zoom = await source.getClusterExpansionZoom(clusterID)
        instance.easeTo({ center: feature.geometry.coordinates as [number, number], zoom })
      })

      instance.on('click', 'individual-property', (event: MapLayerMouseEvent) => {
        const propertyID = String(event.features?.[0]?.properties?.id ?? '')
        setSelectedID(propertyID)
      })

      for (const layer of ['property-clusters', 'individual-property']) {
        instance.on('mouseenter', layer, () => { instance.getCanvas().style.cursor = 'pointer' })
        instance.on('mouseleave', layer, () => { instance.getCanvas().style.cursor = '' })
      }
    })

    instance.on('moveend', () => {
      window.clearTimeout(moveTimeout.current)
      moveTimeout.current = window.setTimeout(() => {
        const bounds = instance.getBounds()
        boundsCallback.current([
          round(bounds.getWest()), round(bounds.getSouth()), round(bounds.getEast()), round(bounds.getNorth()),
        ])
      }, 250)
    })

    return () => {
      window.clearTimeout(moveTimeout.current)
      map.current = null
      instance.remove()
    }
  }, [countyBounds])

  useEffect(() => {
    const source = map.current?.getSource(propertySource) as GeoJSONSource | undefined
    source?.setData(propertiesToGeoJSON(properties))
  }, [properties])

  return (
    <section className="street-map-view" aria-label={`Street map of ${county}`}>
      <div className="street-map-toolbar">
        <button type="button" onClick={onBack} aria-label="Back to Ireland">← Ireland</button>
        <div>
          <p>County view</p>
          <h3>{county}</h3>
        </div>
        <p>{propertyLabel(properties.length)} in {county}</p>
      </div>
      <div ref={container} className="street-map-canvas" aria-hidden="true" />
      {mapError && (
        <div className="street-map-fallback">
          <RasterStreetMap county={county} properties={properties} countyBounds={countyBounds} />
          <p className="street-map-fallback-notice" role="status">
            <strong>The interactive map is unavailable in this browser.</strong>
            <span>A raster street map is shown instead.</span>
          </p>
        </div>
      )}
      <div className={`street-map-accessible-list${mapError ? ' street-map-accessible-list--fallback' : ''}`}>
        {properties.map((property) => (
          <button
            key={property.id}
            type="button"
            aria-label={`View ${property.title} on street map`}
            onClick={() => setSelectedID(property.id)}
          >
            {mapError && property.media.find((media) => media.kind === 'image') && (
              <img src={property.media.find((media) => media.kind === 'image')?.url} alt="" />
            )}
            <span>
              <strong>{property.title}</strong>
              {mapError && <small>{property.city} · {euros.format(property.priceCents / 100)}</small>}
            </span>
            <span className="street-map-list-action">View</span>
          </button>
        ))}
      </div>
      {selected && <StreetPropertyCard property={selected} onClose={() => setSelectedID(undefined)} />}
    </section>
  )
}

function StreetPropertyCard({ property, onClose }: { property: Property; onClose: () => void }) {
  const image = property.media.find((media) => media.kind === 'image')
  return (
    <article className="street-property-card">
      <button className="street-card-close" type="button" onClick={onClose} aria-label="Close property preview">×</button>
      {image && <img src={image.url} alt={image.altText} />}
      <div>
        <p>{property.city} · Co. {property.county}</p>
        <h4>{property.title}</h4>
        <strong>{euros.format(property.priceCents / 100)}</strong>
        <a href={`#property-${property.id}`}>View property</a>
      </div>
    </article>
  )
}

function propertiesToGeoJSON(properties: Property[]) {
  return {
    type: 'FeatureCollection' as const,
    features: properties.map((property) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [property.longitude, property.latitude] },
      properties: { id: property.id },
    })),
  }
}

function propertyLabel(count: number) { return `${count} ${count === 1 ? 'property' : 'properties'}` }
function round(value: number) { return Math.round(value * 1_000_000) / 1_000_000 }
function supportsWebGL2() {
  if (typeof WebGL2RenderingContext === 'undefined') return false
  return Boolean(document.createElement('canvas').getContext('webgl2'))
}

function RasterStreetMap({ county, properties, countyBounds }: {
  county: string
  properties: Property[]
  countyBounds: MapBounds
}) {
  const zoom = 12
  const center = properties[0]
    ? worldPoint(properties[0].longitude, properties[0].latitude, zoom)
    : worldPoint((countyBounds[0] + countyBounds[2]) / 2, (countyBounds[1] + countyBounds[3]) / 2, zoom)
  const centerTileX = Math.floor(center.x / 256)
  const centerTileY = Math.floor(center.y / 256)
  const tiles = []
  for (let offsetY = -2; offsetY <= 2; offsetY += 1) {
    for (let offsetX = -3; offsetX <= 3; offsetX += 1) {
      const x = centerTileX + offsetX
      const y = centerTileY + offsetY
      tiles.push({
        x,
        y,
        left: x * 256 - center.x,
        top: y * 256 - center.y,
      })
    }
  }

  return (
    <div className="raster-street-map" role="region" aria-label={`Raster street map of ${county}`}>
      {tiles.map((tile) => (
        <img
          key={`${tile.x}-${tile.y}`}
          src={`https://tile.openstreetmap.org/${zoom}/${tile.x}/${tile.y}.png`}
          alt=""
          loading="lazy"
          draggable="false"
          style={{ left: `calc(50% + ${tile.left}px)`, top: `calc(50% + ${tile.top}px)` }}
        />
      ))}
      {properties.map((property) => {
        const point = worldPoint(property.longitude, property.latitude, zoom)
        return (
          <button
            key={property.id}
            className="raster-property-marker"
            type="button"
            aria-label={`Property marker for ${property.title}`}
            style={{ left: `calc(50% + ${point.x - center.x}px)`, top: `calc(50% + ${point.y - center.y}px)` }}
            onClick={() => document.getElementById(`property-${property.id}`)?.scrollIntoView({ behavior: 'smooth' })}
          />
        )
      })}
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
        © OpenStreetMap contributors
      </a>
    </div>
  )
}

function worldPoint(longitude: number, latitude: number, zoom: number) {
  const scale = 256 * 2 ** zoom
  const latitudeRadians = latitude * Math.PI / 180
  return {
    x: (longitude + 180) / 360 * scale,
    y: (1 - Math.asinh(Math.tan(latitudeRadians)) / Math.PI) / 2 * scale,
  }
}

const euros = new Intl.NumberFormat('en-IE', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
})

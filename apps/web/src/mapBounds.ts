import type { MapBounds } from './api/properties'
import countyData from './data/irelandCounties.json'

export const IRELAND_MAP_BOUNDS: MapBounds = [
  countyData.bounds.minLongitude,
  countyData.bounds.minLatitude,
  countyData.bounds.maxLongitude,
  countyData.bounds.maxLatitude,
]

import type { Property } from './api/properties'

export type ConciergeCriteria = {
  location?: string
  minimumBedrooms: number
  maximumPrice: number
  propertyType: string
  spatialToursOnly: boolean
}

export type ConciergeReply = {
  summary: string
  criteria: ConciergeCriteria
  matches: Property[]
  canApply: boolean
}

function normalize(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-IE')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function requestedPrice(query: string) {
  const match = query.match(/(?:under|below|up to|maximum|max)\s*(?:€|eur)?\s*([\d,.]+)\s*([km])?/i)
  if (!match) return 0
  const amount = Number(match[1].replace(/,/g, ''))
  if (!Number.isFinite(amount) || amount <= 0) return 0
  const multiplier = match[2]?.toLocaleLowerCase() === 'm' ? 1_000_000 : match[2]?.toLocaleLowerCase() === 'k' ? 1_000 : 1
  return Math.round(amount * multiplier)
}

function requestedBedrooms(query: string) {
  const match = query.match(/(\d+)\s*(?:\+|or more)?\s*(?:bed|beds|bedroom|bedrooms)\b/i)
  return match ? Math.min(Number(match[1]), 20) : 0
}

function requestedLocation(query: string, properties: Property[]) {
  const normalizedQuery = ` ${normalize(query)} `
  const locations = [...new Set(properties.flatMap((property) => [property.city, property.county]))]
    .sort((left, right) => right.length - left.length)
  return locations.find((location) => normalizedQuery.includes(` ${normalize(location)} `))
}

function requestedPropertyType(query: string, properties: Property[]) {
  const normalizedQuery = ` ${normalize(query)} `
  const propertyTypes = [...new Set(properties.map((property) => property.propertyType))]
    .sort((left, right) => right.length - left.length)
  return propertyTypes.find((type) => normalizedQuery.includes(` ${normalize(type)} `)) ?? 'all'
}

export function createConciergeReply(message: string, properties: Property[]): ConciergeReply {
  const query = normalize(message)
  const criteria: ConciergeCriteria = {
    location: requestedLocation(message, properties),
    minimumBedrooms: requestedBedrooms(message),
    maximumPrice: requestedPrice(message),
    propertyType: requestedPropertyType(message, properties),
    spatialToursOnly: /(?:360|panorama|virtual\s+tour)/i.test(message),
  }
  const hasPropertyIntent = /\b(?:home|homes|house|houses|property|properties|apartment|apartments|residence|residences)\b/.test(query)
  const canApply = hasPropertyIntent || Boolean(criteria.location || criteria.minimumBedrooms || criteria.maximumPrice || criteria.propertyType !== 'all' || criteria.spatialToursOnly)

  if (!canApply) {
    return {
      summary: 'Tell me a location, budget, bedroom count or type of home and I’ll search the live catalogue.',
      criteria,
      matches: [],
      canApply: false,
    }
  }

  const normalizedLocation = criteria.location ? normalize(criteria.location) : ''
  const matches = properties.filter((property) => {
    const locationMatches = !normalizedLocation || [property.city, property.county, property.addressLine1].some((value) => normalize(value).includes(normalizedLocation))
    return locationMatches
      && (!criteria.minimumBedrooms || property.bedrooms >= criteria.minimumBedrooms)
      && (!criteria.maximumPrice || property.priceCents <= criteria.maximumPrice * 100)
      && (criteria.propertyType === 'all' || property.propertyType === criteria.propertyType)
      && (!criteria.spatialToursOnly || property.media.some((item) => item.kind === 'panorama'))
  })

  return {
    summary: matches.length
      ? `I found ${matches.length} ${matches.length === 1 ? 'home' : 'homes'} matching that brief in the current catalogue.`
      : 'I couldn’t find an exact match in the current catalogue. Try a wider location, budget or bedroom range.',
    criteria,
    matches,
    canApply: true,
  }
}

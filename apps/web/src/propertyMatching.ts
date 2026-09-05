import type { Property } from './api/properties'

export type MatchPreferences = {
  maxPriceCents: number
  minimumBedrooms: number
  county: string
  budgetWeight: number
  spaceWeight: number
  mediaWeight: number
}

export type MatchSignals = {
  budget: number
  space: number
  media: number
  location: number
}

export type PropertyMatch = {
  property: Property
  score: number
  signals: MatchSignals
  reasons: string[]
}

export type AreaIndex = {
  county: string
  inventory: number
  medianPriceCents: number
  mediaReadiness: number
  averageBedrooms: number
  leadingType: string
}

const clampScore = (value: number) => Math.round(Math.min(100, Math.max(0, value)))

function mediaScore(property: Property) {
  const kinds = new Set(property.media.map(item => item.kind))
  return clampScore(
    (kinds.has('image') ? 35 : 0) +
    (kinds.has('floor_plan') ? 25 : 0) +
    (kinds.has('video') ? 20 : 0) +
    (kinds.has('panorama') ? 20 : 0),
  )
}

function signalsFor(property: Property, preferences: MatchPreferences): MatchSignals {
  const overBudgetRatio = Math.max(0, property.priceCents - preferences.maxPriceCents) / preferences.maxPriceCents
  const budget = property.priceCents <= preferences.maxPriceCents ? 100 : clampScore(100 - overBudgetRatio * 180)
  const space = property.bedrooms >= preferences.minimumBedrooms
    ? 100
    : clampScore((property.bedrooms / Math.max(preferences.minimumBedrooms, 1)) * 100)
  const location = preferences.county === 'Any' ? 82 : property.county === preferences.county ? 100 : 28
  return { budget, space, media: mediaScore(property), location }
}

function reasonsFor(property: Property, signals: MatchSignals, preferences: MatchPreferences) {
  const reasons: string[] = []
  if (property.priceCents <= preferences.maxPriceCents) reasons.push('Within your working budget')
  if (property.bedrooms >= preferences.minimumBedrooms) reasons.push(`${property.bedrooms} bedrooms meet your space brief`)
  if (preferences.county !== 'Any' && property.county === preferences.county) reasons.push(`Exact ${property.county} location match`)
  if (signals.media >= 60) reasons.push('Rich media supports a clearer first decision')
  if (reasons.length === 0) reasons.push('Closest available catalogue alternative')
  return reasons.slice(0, 3)
}

export function rankProperties(properties: Property[], preferences: MatchPreferences): PropertyMatch[] {
  const budgetWeight = Math.max(1, preferences.budgetWeight)
  const spaceWeight = Math.max(1, preferences.spaceWeight)
  const mediaWeight = Math.max(1, preferences.mediaWeight)
  const locationWeight = preferences.county === 'Any' ? 1 : 4
  const totalWeight = budgetWeight + spaceWeight + mediaWeight + locationWeight

  return properties.map(property => {
    const signals = signalsFor(property, preferences)
    const score = clampScore((
      signals.budget * budgetWeight +
      signals.space * spaceWeight +
      signals.media * mediaWeight +
      signals.location * locationWeight
    ) / totalWeight)
    return { property, score, signals, reasons: reasonsFor(property, signals, preferences) }
  }).sort((left, right) =>
    right.score - left.score ||
    left.property.priceCents - right.property.priceCents ||
    left.property.title.localeCompare(right.property.title, 'en-IE'),
  )
}

function median(values: number[]) {
  const ordered = [...values].sort((left, right) => left - right)
  const middle = Math.floor(ordered.length / 2)
  return ordered.length % 2 === 0 ? Math.round((ordered[middle - 1] + ordered[middle]) / 2) : ordered[middle]
}

export function aggregateAreas(properties: Property[]): AreaIndex[] {
  const grouped = new Map<string, Property[]>()
  for (const property of properties) grouped.set(property.county, [...(grouped.get(property.county) ?? []), property])

  return [...grouped.entries()].map(([county, homes]) => {
    const types = new Map<string, number>()
    for (const home of homes) types.set(home.propertyType, (types.get(home.propertyType) ?? 0) + 1)
    const leadingType = [...types].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? 'home'
    const ready = homes.filter(home => {
      const kinds = new Set(home.media.map(item => item.kind))
      return kinds.has('image') && (kinds.has('floor_plan') || kinds.has('video') || kinds.has('panorama'))
    }).length
    return {
      county,
      inventory: homes.length,
      medianPriceCents: median(homes.map(home => home.priceCents)),
      mediaReadiness: Math.round((ready / homes.length) * 100),
      averageBedrooms: Math.round((homes.reduce((total, home) => total + home.bedrooms, 0) / homes.length) * 10) / 10,
      leadingType,
    }
  }).sort((left, right) => right.inventory - left.inventory || left.county.localeCompare(right.county, 'en-IE'))
}

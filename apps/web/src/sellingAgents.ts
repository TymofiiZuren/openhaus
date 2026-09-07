export type SellingAgent = {
  slug: string
  name: string
  initials: string
  role: string
  agency: string
  serviceAreas: readonly string[]
  specialisms: readonly string[]
  summary: string
  demonstration: true
  email?: never
  phone?: never
  licenceNumber?: never
}

export const sellingAgents: readonly SellingAgent[] = [
  {
    slug: 'aoife-byrne',
    name: 'Aoife Byrne',
    initials: 'AB',
    role: 'Residential listing advisor',
    agency: 'OpenHaus Partner Desk',
    serviceAreas: ['Dublin', 'Wicklow', 'Wexford', 'Kildare', 'Meath', 'Louth'],
    specialisms: ['City homes', 'Coastal property', 'Viewing preparation'],
    summary: 'Coordinates presentation and viewing context for homes across Dublin and the east coast.',
    demonstration: true,
  },
  {
    slug: 'niamh-osullivan',
    name: 'Niamh O’Sullivan',
    initials: 'NO',
    role: 'Regional property advisor',
    agency: 'OpenHaus Partner Desk',
    serviceAreas: ['Cork', 'Kerry', 'Waterford', 'Tipperary', 'Limerick', 'Clare'],
    specialisms: ['Family homes', 'Regional moves', 'Property media'],
    summary: 'Supports property presentation and buyer enquiries across Munster and the south-west.',
    demonstration: true,
  },
  {
    slug: 'cian-murphy',
    name: 'Cian Murphy',
    initials: 'CM',
    role: 'Residential property advisor',
    agency: 'OpenHaus Partner Desk',
    serviceAreas: ['Carlow', 'Cavan', 'Donegal', 'Galway', 'Kilkenny', 'Laois', 'Leitrim', 'Longford', 'Mayo', 'Monaghan', 'Offaly', 'Roscommon', 'Sligo', 'Westmeath'],
    specialisms: ['Country homes', 'Buyer questions', 'Listing readiness'],
    summary: 'Connects listing information, media and viewing preparation across the west, north and midlands.',
    demonstration: true,
  },
]

export function findSellingAgent(county: string) {
  return sellingAgents.find(agent => agent.serviceAreas.includes(county)) ?? sellingAgents[2]
}

export function getSellingAgent(slug: string) {
  return sellingAgents.find(agent => agent.slug === slug)
}

import { describe, expect, it } from 'vitest'
import { findSellingAgent, sellingAgents } from './sellingAgents'

describe('selling agent directory', () => {
  it('assigns every Irish county to one transparent demonstration profile', () => {
    expect(findSellingAgent('Dublin')).toMatchObject({ slug: 'aoife-byrne', demonstration: true })
    expect(findSellingAgent('Cork')).toMatchObject({ slug: 'niamh-osullivan', demonstration: true })
    expect(findSellingAgent('Donegal')).toMatchObject({ slug: 'cian-murphy', demonstration: true })
  })

  it('keeps public profiles free of invented contact and licence details', () => {
    for (const agent of sellingAgents) {
      expect(agent.email).toBeUndefined()
      expect(agent.phone).toBeUndefined()
      expect(agent.licenceNumber).toBeUndefined()
    }
  })
})

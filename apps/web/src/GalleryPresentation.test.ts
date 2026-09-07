/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sourceDirectory = join(process.cwd(), 'src')
const appStyles = readFileSync(join(sourceDirectory, 'App.css'), 'utf8')
const discoveryStyles = readFileSync(join(sourceDirectory, 'DiscoveryApp.css'), 'utf8')
const clientStyles = readFileSync(join(sourceDirectory, 'ClientApp.css'), 'utf8')


describe('uploaded property image presentation', () => {
  it('shows complete images across the shared property surfaces', () => {
    expect(appStyles).toMatch(/\.gallery-image\s*\{[^}]*object-fit:\s*contain;/s)
    expect(appStyles).toMatch(/\.property-carousel-photo img\s*\{[^}]*object-fit:\s*contain;/s)
    expect(appStyles).toMatch(/\.map-result-image img\s*\{[^}]*object-fit:\s*contain;/s)
    expect(appStyles).toMatch(/\.comparison-image img\s*\{[^}]*object-fit:\s*contain;/s)
    expect(discoveryStyles).toMatch(/\.match-card-image img\s*\{[^}]*object-fit:\s*contain;/s)
    expect(clientStyles).toMatch(/\.client-saved article > img\s*\{[^}]*object-fit:\s*contain;/s)
  })

  it('reveals only the hovered or keyboard-focused control without hiding controls on touch', () => {
    expect(appStyles).toContain('@media (hover: hover) and (pointer: fine)')
    expect(appStyles).toMatch(/\.property-image-carousel \.property-carousel-arrow:hover,[\s\S]*\.property-image-carousel \.property-carousel-arrow:focus-visible[^}]*opacity:\s*1/s)
    expect(appStyles).toMatch(/\.property-gallery \.gallery-navigation button:hover,[\s\S]*\.property-gallery \.gallery-navigation button:focus-visible[^}]*opacity:\s*1/s)
  })

  it('keeps thumbnail gutters transparent and uses taller stage arrows', () => {
    expect(appStyles).toMatch(/\.gallery-filmstrip\s*\{[^}]*background:\s*transparent;/s)
    expect(appStyles).toMatch(/\.gallery-thumbnail\s*\{[^}]*background:\s*transparent;/s)
    expect(appStyles).toMatch(/\.gallery-navigation button\s*\{[^}]*height:\s*72px;/s)
    expect(appStyles).toMatch(/\.gallery-navigation svg\s*\{[^}]*height:\s*44px;/s)
  })

  it('shows the tour poster without a tinted backing or image filter', () => {
    expect(appStyles).toMatch(/\.spatial-consent\s*\{[^}]*background:\s*transparent;/s)
    expect(appStyles).toMatch(/\.spatial-consent > img\s*\{[^}]*object-fit:\s*contain;[^}]*opacity:\s*1;[^}]*filter:\s*none;/s)
    expect(appStyles).toMatch(/\.property-tour-canvas \.spatial-consent\s*\{[^}]*background:\s*transparent;/s)
    expect(appStyles).toMatch(/\.property-tour-canvas \.spatial-consent > img\s*\{[^}]*opacity:\s*1;[^}]*filter:\s*none;/s)
    expect(appStyles).toMatch(/\.property-tour-canvas\s*\{[^}]*background:\s*transparent;/s)
  })
})

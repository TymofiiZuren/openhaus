import { mkdir, readFile, writeFile } from 'node:fs/promises'

// Lossless, offline derivation from the checked-in authoritative dataset.
const source = JSON.parse(await readFile(new URL('../src/data/irelandSubregions.json', import.meta.url), 'utf8'))
const directory = new URL('../src/data/areas/', import.meta.url)
await mkdir(directory, { recursive: true })
const counties = new Map()
for (const area of source.areas) {
  const key = area.county.toLowerCase()
  if (!/^[a-z]+$/.test(key)) throw new Error('Unexpected county filename')
  const group = counties.get(key) ?? []
  group.push(area)
  counties.set(key, group)
}
for (const [county, areas] of counties) {
  await writeFile(new URL(`${county}.json`, directory), `${JSON.stringify(areas)}\n`)
}
console.log(`Derived ${counties.size} county assets without changing geometry.`)

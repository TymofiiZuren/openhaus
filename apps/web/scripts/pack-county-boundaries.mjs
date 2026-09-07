import { readFile, writeFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { decodeBoundary } from '../src/boundaryCodec.ts'
import { packBoundaries, unpackBoundaries } from '../src/boundaryTopology.ts'

const raw = await readFile(new URL('../src/data/irelandCounties.json', import.meta.url), 'utf8')
const source = JSON.parse(raw)
const decoded = source.counties.map(county => ({ name: county.name, paths: county.paths.map(decodeBoundary) }))
const packed = packBoundaries(decoded)
if (JSON.stringify(unpackBoundaries(packed)) !== JSON.stringify(decoded)) throw new Error('Topology changed source coordinates')
const output = `${JSON.stringify({ source: source.source, attribution: source.attribution, ...packed })}\n`
const before = gzipSync(raw).length, after = gzipSync(output).length
if (after >= before) throw new Error('No compressed-size improvement; output not written')
await writeFile(new URL('../src/data/irelandCountyTopology.json', import.meta.url), output)
console.log(JSON.stringify({ beforeGzipBytes: before, afterGzipBytes: after, savedBytes: before - after, uniqueArcs: packed.arcs.length }))

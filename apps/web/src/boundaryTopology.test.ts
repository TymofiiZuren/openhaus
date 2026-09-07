import { describe, expect, it } from 'vitest'
import { packBoundaries, unpackBoundaries } from './boundaryTopology'

type Point = [number, number]
const left: Point[] = [[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]
const right: Point[] = [[0, 1], [0, 2], [1, 2], [1, 1], [0, 1]]

describe('lossless shared boundary arcs', () => {
  it('stores a shared border once and reconstructs opposite ring orientations exactly', () => {
    const source = [{ name: 'Left', paths: [left] }, { name: 'Right', paths: [right] }]
    const packed = packBoundaries(source)
    expect(unpackBoundaries(packed)).toEqual(source)
    const references = packed.counties.flatMap(county => county.paths.flat())
    expect(references.some(ref => references.includes(-ref - 1))).toBe(true)
    expect(packBoundaries(source)).toEqual(packed)
  })

  it('preserves islands, holes, duplicate vertices and arbitrary ring starting points', () => {
    const hole: Point[] = [[.2, .2], [.4, .2], [.4, .4], [.2, .2]]
    const rotated = [...right.slice(2, -1), ...right.slice(0, 3)]
    const source = [{ name: 'Left', paths: [[left[0], ...left], hole] }, { name: 'Right', paths: [rotated] }]
    expect(unpackBoundaries(packBoundaries(source))).toEqual(source)
  })

  it('rejects open source rings, missing arcs and disconnected reconstructions', () => {
    expect(() => packBoundaries([{ name: 'Bad', paths: [left.slice(0, -1)] }])).toThrow()
    const packed = packBoundaries([{ name: 'Left', paths: [left] }, { name: 'Right', paths: [right] }])
    expect(() => unpackBoundaries({ ...packed, counties: [{ name: 'Bad', paths: [[9999]] }] })).toThrow()
    expect(() => unpackBoundaries({ ...packed, counties: [{ name: 'Bad', paths: [[0, 0]] }] })).toThrow()
    expect(() => packBoundaries([{ name: 'Overprecise', paths: [[[0, 0], [.1234567, 1], [1, 1], [0, 0]]] }])).toThrow('six-decimal')
  })

  it('reconstructs a grid with four-way junctions and reversed neighbouring rings', () => {
    const source = Array.from({ length: 16 }, (_, i) => {
      const x = i % 4, y = Math.floor(i / 4)
      const ring: Point[] = [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1], [x, y]]
      return { name: String(i), paths: [i % 2 ? ring.reverse() : ring] }
    })
    expect(unpackBoundaries(packBoundaries(source))).toEqual(source)
  })
})

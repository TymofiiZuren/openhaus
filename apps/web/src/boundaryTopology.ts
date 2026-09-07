import { decodeBoundary, encodeBoundary } from './boundaryCodec.ts'

type Point = [number, number]
type Boundary = { name: string; paths: Point[][] }
export type BoundaryTopology = {
  version: 1
  arcs: string[]
  counties: { name: string; paths: number[][] }[]
}
const pointKey = (point: Point) => `${point[0]},${point[1]}`
const equal = (a: Point, b: Point) => a[0] === b[0] && a[1] === b[1]

// Build-time graph traversal. Split at junctions and every original ring start,
// so reversed neighbouring rings agree on arc endpoints without rotating rings.
// Expected O(vertices + edges) time/space using hash maps; no simplification.
export function packBoundaries(source: Boundary[]): BoundaryTopology {
  const neighbours = new Map<string, Set<string>>()
  const starts = new Set<string>()
  for (const county of source) for (const ring of county.paths) {
    if (ring.length < 4 || !equal(ring[0], ring[ring.length - 1])) throw new Error('Unclosed boundary ring')
    for (const point of ring) for (const value of point) {
      if (!Number.isFinite(value) || Math.round(value * 1_000_000) / 1_000_000 !== value) throw new Error('Boundary requires six-decimal coordinates')
    }
    starts.add(pointKey(ring[0]))
    for (let i = 1; i < ring.length; i++) {
      const a = pointKey(ring[i - 1]), b = pointKey(ring[i])
      for (const [from, to] of [[a, b], [b, a]]) {
        const adjacent = neighbours.get(from) ?? new Set<string>()
        adjacent.add(to)
        neighbours.set(from, adjacent)
      }
    }
  }
  const arcs: string[] = []
  const indexes = new Map<string, number>()
  const intern = (points: Point[]) => {
    const forward = encodeBoundary(points)
    const reverse = encodeBoundary([...points].reverse())
    const reversed = reverse < forward
    const key = reversed ? reverse : forward
    let index = indexes.get(key)
    if (index === undefined) {
      index = arcs.length
      indexes.set(key, index)
      arcs.push(key)
    }
    return reversed ? -index - 1 : index
  }
  const counties = source.map(county => ({ name: county.name, paths: county.paths.map(ring => {
    const references: number[] = []
    let start = 0
    for (let end = 1; end < ring.length; end++) {
      const key = pointKey(ring[end])
      if (end === ring.length - 1 || starts.has(key) || neighbours.get(key)?.size !== 2) {
        references.push(intern(ring.slice(start, end + 1)))
        start = end
      }
    }
    return references
  }) }))
  return { version: 1, arcs, counties }
}

// Decode each unique arc once, then reconstruct each original ring in order.
// Negative references use -index-1, allowing arc zero to be reversed too.
export function unpackBoundaries(topology: BoundaryTopology): Boundary[] {
  if (topology.version !== 1) throw new Error('Unsupported boundary topology')
  const arcs = topology.arcs.map(decodeBoundary)
  return topology.counties.map(county => ({ name: county.name, paths: county.paths.map(references => {
    const ring: Point[] = []
    for (const reference of references) {
      const index = reference < 0 ? -reference - 1 : reference
      if (!Number.isSafeInteger(reference) || !arcs[index] || arcs[index].length < 2) throw new Error('Invalid boundary arc')
      const points = arcs[index]
      const reverse = reference < 0
      const first = points[reverse ? points.length - 1 : 0]
      if (ring.length && !equal(ring[ring.length - 1], first)) throw new Error('Disconnected boundary arc')
      for (let i = ring.length ? 1 : 0; i < points.length; i++) {
        ring.push(points[reverse ? points.length - i - 1 : i])
      }
    }
    if (ring.length < 4 || !equal(ring[0], ring[ring.length - 1])) throw new Error('Unclosed boundary ring')
    return ring
  }) }))
}

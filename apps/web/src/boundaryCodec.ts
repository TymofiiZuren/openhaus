// Lossless delta encoding for the source's six-decimal latitude/longitude pairs.
const scale = 1_000_000

export function encodeBoundary(points: [number, number][]): string {
  let encoded = ''
  const previous = [0, 0]
  for (const point of points) {
    for (let axis = 0; axis < 2; axis++) {
      const value = Math.round(point[axis] * scale)
      if (!Number.isFinite(value) || Math.abs(value) > (axis === 0 ? 90 : 180) * scale) throw new Error('Invalid boundary coordinate')
      const delta = value - previous[axis]
      previous[axis] = value
      let remaining = delta < 0 ? ~(delta << 1) : delta << 1
      while (remaining >= 32) {
        encoded += String.fromCharCode((32 | (remaining & 31)) + 63)
        remaining >>>= 5
      }
      encoded += String.fromCharCode(remaining + 63)
    }
  }
  return encoded
}

export function decodeBoundary(encoded: string): [number, number][] {
  let index = 0
  const previous = [0, 0]
  const points: [number, number][] = []
  while (index < encoded.length) {
    for (let axis = 0; axis < 2; axis++) {
      let result = 0
      let shift = 0
      let byte: number
      do {
        if (index >= encoded.length || shift > 25) throw new Error('Truncated boundary coordinate')
        byte = encoded.charCodeAt(index++) - 63
        if (byte < 0 || byte > 63) throw new Error('Invalid boundary encoding')
        result |= (byte & 31) << shift
        shift += 5
      } while (byte >= 32)
      previous[axis] += result & 1 ? ~(result >>> 1) : result >>> 1
      if (Math.abs(previous[axis]) > (axis === 0 ? 90 : 180) * scale) throw new Error('Invalid boundary coordinate')
    }
    points.push([previous[0] / scale, previous[1] / scale])
  }
  return points
}

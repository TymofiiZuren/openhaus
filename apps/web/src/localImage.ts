export const MAX_LOCAL_BYTES = 10 * 1024 * 1024

export function checkLocalDimensions(width: number, height: number) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width > 8192 || height > 8192 || width * height > 20_000_000) {
    throw new Error('Choose an image up to 20 megapixels, with neither side above 8,192 pixels.')
  }
}

// A bounded header preflight, not a replacement for the browser's image decoder.
// No extension/MIME trust; segment lengths must fit before their contents are read.
export function inspectLocalImage(bytes: Uint8Array) {
  if (bytes.length > MAX_LOCAL_BYTES) throw new Error('Choose an image no larger than 10 MiB.')
  const invalid = () => new Error('Choose a valid JPEG or PNG image. This file header is unsupported or incomplete.')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const dimensions = (width: number, height: number, type: string) => {
    checkLocalDimensions(width, height)
    return { width, height, type }
  }
  if ([137,80,78,71,13,10,26,10].every((value, i) => bytes[i] === value)) {
    if (bytes.length < 33 || view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49484452) throw invalid()
    // Animated PNGs do not provide a stable correspondence between preview and measurements.
    for (let offset = 8; offset + 12 <= bytes.length;) {
      const length = view.getUint32(offset)
      if (length > bytes.length - offset - 12) throw invalid()
      if (view.getUint32(offset + 4) === 0x6163544c) throw new Error('Choose a still PNG rather than an animated PNG.')
      offset += length + 12
    }
    return dimensions(view.getUint32(16), view.getUint32(20), 'image/png')
  }
  if (bytes[0] !== 255 || bytes[1] !== 216) throw invalid()
  for (let offset = 2; offset < bytes.length;) {
    if (bytes[offset++] !== 255) throw invalid()
    while (bytes[offset] === 255) offset++
    const marker = bytes[offset++]
    if (marker === undefined || marker === 0xda || marker === 0xd9) throw invalid()
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
    if (offset + 2 > bytes.length) throw invalid()
    const length = view.getUint16(offset)
    if (length < 2 || length > bytes.length - offset) throw invalid()
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (length < 8 || bytes[offset + 2] !== 8 || length !== 8 + 3 * bytes[offset + 7]) throw invalid()
      return dimensions(view.getUint16(offset + 5), view.getUint16(offset + 3), 'image/jpeg')
    }
    offset += length
  }
  throw invalid()
}

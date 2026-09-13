import { expect, it } from 'vitest'
import { inspectLocalImage, MAX_LOCAL_BYTES } from './localImage'

function png(width = 640, height = 480) {
  const bytes = new Uint8Array(33)
  bytes.set([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82])
  const view = new DataView(bytes.buffer)
  view.setUint32(16, width); view.setUint32(20, height)
  return bytes
}
function jpeg(marker = 0xc0) {
  return new Uint8Array([255,216,255,224,0,4,0,0,255,marker,0,11,8,1,224,2,128,1,1,17,0])
}
it('reads PNG and baseline/progressive JPEG dimensions without a decoder', () => {
  expect(inspectLocalImage(png())).toEqual({ width: 640, height: 480, type: 'image/png' })
  for (const marker of [0xc0, 0xc2]) expect(inspectLocalImage(jpeg(marker))).toEqual({ width: 640, height: 480, type: 'image/jpeg' })
})
it('rejects oversized dimensions, empty and unsupported data before decode', () => {
  for (const bytes of [png(0), png(8193, 1), png(5000, 5000), new Uint8Array(), new Uint8Array([60,115,118,103])]) expect(() => inspectLocalImage(bytes)).toThrow()
  expect(() => inspectLocalImage(new Uint8Array(MAX_LOCAL_BYTES + 1))).toThrow('10 MiB')
})
it('rejects truncated headers and invalid JPEG segment lengths', () => {
  for (let length = 0; length < 21; length++) expect(() => inspectLocalImage(jpeg().slice(0, length))).toThrow()
  const bytes = jpeg(); bytes[5] = 255
  expect(() => inspectLocalImage(bytes)).toThrow()
  expect(() => inspectLocalImage(png().slice(0, 24))).toThrow()
})

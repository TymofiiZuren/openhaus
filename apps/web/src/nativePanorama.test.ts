import { webcrypto } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'
import { readNativePanorama } from './nativePanorama'

afterEach(() => vi.unstubAllGlobals())
const names = ['front', 'right', 'back', 'left', 'top', 'bottom']
async function fixture() {
  vi.stubGlobal('crypto', webcrypto)
  const close = vi.fn()
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 2, height: 2, close }))
  const bytes = new Uint8Array([255,216,255,192,0,11,8,0,2,0,2,1,1,17,0])
  const hash = Array.from(new Uint8Array(await webcrypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('')
  const manifest = { version: 1, projection: 'cubemap-x-right-y-up-z-front', faceSize: 2,
    faces: names.map(name => ({ name, file: `${name}.jpg`, bytes: bytes.length, sha256: hash })) }
  const file = (name: string, data: Uint8Array) => Object.assign(new File([data as Uint8Array<ArrayBuffer>], name), { arrayBuffer: vi.fn().mockResolvedValue(data.buffer) })
  const files = () => [file('manifest.json', new TextEncoder().encode(JSON.stringify(manifest))), ...names.map(name => file(`${name}.jpg`, bytes))]
  return { manifest, files, close }
}
it('accepts the Go bundle contract and closes every decoded bitmap', async () => {
  const { files, close } = await fixture()
  const result = await readNativePanorama(files(), new AbortController().signal)
  expect(result.size).toBe(2)
  expect(result.faces.map(face => face.name)).toEqual(names)
  expect(close).toHaveBeenCalledTimes(6)
})
it.each(['missing', 'duplicate', 'path', 'hash', 'dimension', 'unknown', 'oversize'] as const)('rejects %s bundles', async kind => {
  const data = await fixture()
  if (kind === 'path') data.manifest.faces[0].file = '../front.jpg'
  if (kind === 'hash') data.manifest.faces[0].sha256 = '0'.repeat(64)
  if (kind === 'dimension') data.manifest.faceSize = 3
  if (kind === 'unknown') Object.assign(data.manifest, { unexpected: true })
  const files = data.files()
  if (kind === 'missing') files.pop()
  if (kind === 'duplicate') files[1] = files[2]
  if (kind === 'oversize') Object.defineProperty(files[1], 'size', { value: 11 * 1024 * 1024 })
  await expect(readNativePanorama(files, new AbortController().signal)).rejects.toThrow()
  if (kind === 'oversize') expect(files[1].arrayBuffer).not.toHaveBeenCalled()
})
it('rejects cancellation before reads and after a pending read', async () => {
  const { files } = await fixture()
  const controller = new AbortController()
  controller.abort()
  await expect(readNativePanorama(files(), controller.signal)).rejects.toThrow()
  const next = new AbortController(), selection = files()
  selection[0].arrayBuffer.mockImplementation(async () => { next.abort(); return new ArrayBuffer(0) })
  await expect(readNativePanorama(selection, next.signal)).rejects.toThrow()
  expect(createImageBitmap).not.toHaveBeenCalled()
})
it('rejects decoder disagreement and releases its bitmap', async () => {
  const { files, close } = await fixture()
  vi.mocked(createImageBitmap).mockResolvedValue({ width: 9, height: 2, close } as ImageBitmap)
  await expect(readNativePanorama(files(), new AbortController().signal)).rejects.toThrow()
  expect(close).toHaveBeenCalledOnce()
})

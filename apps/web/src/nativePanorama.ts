import { inspectLocalImage, MAX_LOCAL_BYTES } from './localImage'

const names = ['front', 'right', 'back', 'left', 'top', 'bottom'] as const
export type NativePanorama = { size: number; faces: { name: string; blob: Blob }[] }
const invalid = () => new Error('Choose manifest.json and the six unchanged JPEG faces from a native panorama bundle.')
function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== keys.length || !keys.every(key => Object.hasOwn(value, key))) throw invalid()
  return value as Record<string, unknown>
}

// Local inspection only. Hashes detect corruption, not who created the bundle.
// This browser preview deliberately caps each face at 10 MiB (the CLI allows 32).
export async function readNativePanorama(files: File[], signal: AbortSignal): Promise<NativePanorama> {
  signal.throwIfAborted()
  if (files.length !== 7 || new Set(files.map(file => file.name)).size !== 7) throw invalid()
  const manifestFile = files.find(file => file.name === 'manifest.json')
  if (!manifestFile || manifestFile.size > 16384 || files.some(file => file.size < 1 || file.size > MAX_LOCAL_BYTES)) {
    throw new Error('Choose a complete bundle: manifest up to 16 KiB and each JPEG face up to 10 MiB.')
  }
  if (!globalThis.crypto?.subtle || typeof createImageBitmap !== 'function') throw new Error('This preview needs a browser with secure image verification support. Use HTTPS or localhost.')
  const manifestBytes = await manifestFile.arrayBuffer()
  signal.throwIfAborted()
  const manifest = record(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(manifestBytes)), ['version', 'projection', 'faceSize', 'faces'])
  if (manifest.version !== 1 || manifest.projection !== 'cubemap-x-right-y-up-z-front' ||
      !Number.isSafeInteger(manifest.faceSize) || (manifest.faceSize as number) < 1 || (manifest.faceSize as number) > 2048 ||
      !Array.isArray(manifest.faces) || manifest.faces.length !== 6) throw invalid()
  const entries = manifest.faces.map(value => record(value, ['name', 'file', 'bytes', 'sha256']))
  if (new Set(entries.map(entry => entry.name)).size !== 6 || entries.some(entry =>
    !names.some(name => name === entry.name) || entry.file !== `${entry.name}.jpg` ||
    !Number.isSafeInteger(entry.bytes) || (entry.bytes as number) < 1 || (entry.bytes as number) > MAX_LOCAL_BYTES ||
    typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256) ||
    !files.some(file => file.name === entry.file && file.size === entry.bytes))) throw invalid()
  const faces: NativePanorama['faces'] = []
  for (const name of names) {
    signal.throwIfAborted()
    const entry = entries.find(entry => entry.name === name)!
    const data = await files.find(file => file.name === entry.file)!.arrayBuffer()
    signal.throwIfAborted()
    const dimensions = inspectLocalImage(new Uint8Array(data))
    if (dimensions.type !== 'image/jpeg' || dimensions.width !== manifest.faceSize || dimensions.height !== manifest.faceSize) throw invalid()
    const digest = await crypto.subtle.digest('SHA-256', data)
    signal.throwIfAborted()
    const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
    if (data.byteLength !== entry.bytes || hash !== entry.sha256) throw new Error('A panorama face has changed or is incomplete. Re-export the bundle before previewing.')
    const blob = new Blob([data], { type: 'image/jpeg' })
    const bitmap = await createImageBitmap(blob)
    try {
      signal.throwIfAborted()
      if (bitmap.width !== manifest.faceSize || bitmap.height !== manifest.faceSize) throw invalid()
    } finally { bitmap.close() }
    faces.push({ name, blob })
  }
  return { size: manifest.faceSize as number, faces }
}

import { useEffect, useId, useRef, useState } from 'react'
import { inspectLocalImage, MAX_LOCAL_BYTES } from './localImage'
import './LocalImagePicker.css'

export function LocalImagePicker({ onSelect }: { onSelect: (source: string) => void }) {
  const id = useId()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const generation = useRef(0)
  useEffect(() => () => { generation.current++ }, [])
  async function choose(file: File) {
    const current = ++generation.current
    setBusy(true); setError('')
    try {
      if (file.size > MAX_LOCAL_BYTES) throw new Error('Choose an image no larger than 10 MiB.')
      const bytes = new Uint8Array(await file.arrayBuffer())
      if (current !== generation.current) return
      const { type } = inspectLocalImage(bytes)
      // Only the validated bytes are passed on; no filename or filesystem path.
      onSelect(URL.createObjectURL(new Blob([bytes], { type })))
    } catch (cause) {
      if (current === generation.current) setError(cause instanceof Error ? cause.message : 'Could not read this image. Choose another file.')
    } finally { if (current === generation.current) setBusy(false) }
  }
  return <section className="local-image-picker" aria-labelledby={`${id}-title`}>
    <div><h3 id={`${id}-title`}>Your photo. Your browser.</h3><p id={`${id}-help`}>JPEG or still PNG · up to 10 MiB and 20 megapixels · maximum side 8,192px. The selected file is not uploaded or saved by OpenHaus. Reports omit its name and metadata.</p></div>
    <label htmlFor={id}>Choose a local image</label>
    <input id={id} type="file" accept="image/jpeg,image/png" aria-describedby={`${id}-help${error ? ` ${id}-error` : ''}`} aria-invalid={!!error} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void choose(file) }} />
    {busy && <p role="status">Checking image headers…</p>}
    {error && <p id={`${id}-error`} role="alert">{error}</p>}
  </section>
}

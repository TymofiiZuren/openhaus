import { useEffect, useRef, useState } from 'react'
import { readNativePanorama } from './nativePanorama'
import { CubemapViewer } from './CubemapViewer'
import './NativePanoramaPreview.css'

type Preview = { size: number; faces: { name: string; url: string; bytes: number }[] }
const title = (value: string) => value[0].toUpperCase() + value.slice(1)
const fileSize = (bytes: number) => bytes < 1024 ? `${bytes} B` : `${Number((bytes / 1024).toFixed(1))} KiB`

export function NativePanoramaPreview() {
  const [preview, setPreview] = useState<Preview>()
  const [selected, setSelected] = useState(0)
  const [interactive, setInteractive] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const current = useRef<AbortController | undefined>(undefined)
  const urls = useRef<string[]>([])
  const picker = useRef<HTMLInputElement>(null)
  function release() {
    current.current?.abort()
    for (const url of urls.current) URL.revokeObjectURL(url)
    urls.current = []
  }
  useEffect(() => () => {
    current.current?.abort()
    for (const url of urls.current) URL.revokeObjectURL(url)
  }, [])
  async function choose(files: File[]) {
    if (!files.length) return
    release(); setPreview(undefined); setSelected(0); setInteractive(false); setError(''); setBusy(true)
    const attempt = new AbortController()
    current.current = attempt
    try {
      const bundle = await readNativePanorama(files, attempt.signal)
      if (attempt.signal.aborted) return
      const faces = bundle.faces.map(face => {
        const url = URL.createObjectURL(face.blob)
        urls.current.push(url)
        return { name: face.name, url, bytes: face.blob.size }
      })
      setPreview({ size: bundle.size, faces })
    } catch (failure) {
      if (!attempt.signal.aborted) {
        for (const url of urls.current) URL.revokeObjectURL(url)
        urls.current = []
        setError(failure instanceof SyntaxError ? 'The manifest is not valid JSON. Re-export the native bundle.' : failure instanceof Error ? failure.message : 'Could not verify this bundle. Choose the files again.')
      }
    } finally { if (!attempt.signal.aborted) setBusy(false) }
  }
  return <section className="native-panorama-preview" aria-labelledby="native-panorama-heading">
    <div className="native-panorama-intro" role="group" aria-label="Native panorama bundle dropzone"
      onDragOver={event => event.preventDefault()}
      onDrop={event => { event.preventDefault(); void choose(Array.from(event.dataTransfer.files)) }}>
      <p className="eyebrow">Native C++ / Bundle inspection</p>
      <h2 id="native-panorama-heading">Six faces. One panorama.</h2>
      <p>Inspect the output of our native panorama processor. Select or drop manifest.json and all six JPEG files from its bundle folder together.</p>
      <input ref={picker} hidden aria-label="Choose native bundle files" type="file" multiple accept=".json,.jpg" onChange={event => { const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ''; void choose(files) }} />
      <button type="button" onClick={() => picker.current?.click()}>{preview ? 'Replace bundle files' : 'Choose bundle files'}</button>
      <p>Local preview only—nothing is uploaded or saved. Up to 2,048 × 2,048 pixels and 10 MiB per face. Checksums detect changed files, not authenticity.</p>
      {preview && <>
        <p role="status">Bundle verified · {preview.faces.length} faces · {preview.size} × {preview.size} px per face · {fileSize(preview.faces.reduce((sum, face) => sum + face.bytes, 0))} of image data</p>
        <details className="native-panorama-report">
          <summary>Verified file details</summary>
          <p>manifest.json · Version 1 cubemap. All six JPEG dimensions and SHA-256 checksums match.</p>
          <ul>{preview.faces.map(face => <li key={face.name}><span>{face.name}.jpg</span><span>{fileSize(face.bytes)}</span></li>)}</ul>
        </details>
      </>}
      {(busy || preview || error) && <button type="button" onClick={() => { release(); setPreview(undefined); setBusy(false); setError('') }}>Clear preview</button>}
      {busy && <p role="status">Verifying six faces and their checksums…</p>}
      {error && <p role="alert">{error}</p>}
    </div>
    <div className="native-panorama-inspection">
      {preview ? <>
        <div className="native-panorama-faces" role="group" aria-label="Preview mode"><button type="button" aria-pressed={!interactive} onClick={() => setInteractive(false)}>Inspect faces</button><button type="button" aria-pressed={interactive} onClick={() => setInteractive(true)}>Explore 360°</button></div>
        {interactive ? <><p>Experimental local viewer. Use Inspect faces if your browser cannot display the 3D view correctly.</p><CubemapViewer faces={preview.faces} /></> : <>
        <div className="native-panorama-faces" role="group" aria-label="Cube faces">{preview.faces.map((face, index) => <button type="button" key={face.name} aria-pressed={selected === index} onClick={() => setSelected(index)}>{title(face.name)}</button>)}</div>
        <figure><img src={preview.faces[selected].url} alt={`${title(preview.faces[selected].name)} cube face`} width={preview.size} height={preview.size} /><figcaption>{preview.size} × {preview.size} · Six checksums verified</figcaption></figure>
        </>}
      </> : <div className="native-panorama-empty"><h3>Preview the processor’s output.</h3><p>Inspect all six faces or explore a local 360° view after verification. This preview does not publish a tour. Existing Kuula tours are unchanged.</p></div>}
    </div>
  </section>
}

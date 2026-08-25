export type MediaJob = {
  id: string
  propertyId: string
  outputPath?: string
  status: 'pending' | 'processing' | 'ready' | 'failed'
  attempts: number
  errorMessage?: string
  createdAt: string
}

export async function uploadPropertyVideo(
  propertyId: string,
  file: File,
  signal?: AbortSignal,
): Promise<MediaJob> {
  const form = new FormData()
  form.append('video', file)
  const response = await fetch(`/api/v1/properties/${propertyId}/videos`, {
    method: 'POST',
    body: form,
    signal,
  })
  if (!response.ok) throw new Error(`Video upload failed with status ${response.status}`)
  return (await response.json()) as MediaJob
}

export async function waitForMediaJob(
  jobId: string,
  onUpdate: (job: MediaJob) => void,
  signal?: AbortSignal,
): Promise<MediaJob> {
  while (!signal?.aborted) {
    const response = await fetch(`/api/v1/media-jobs/${jobId}`, {
      headers: { Accept: 'application/json' },
      signal,
    })
    if (!response.ok) throw new Error(`Media job request failed with status ${response.status}`)
    const job = (await response.json()) as MediaJob
    onUpdate(job)
    if (job.status === 'ready' || job.status === 'failed') return job
    await delay(1000, signal)
  }
  throw new DOMException('Video processing was cancelled', 'AbortError')
}

function delay(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Video processing was cancelled', 'AbortError'))
      return
    }
    const onAbort = () => {
      window.clearTimeout(timeout)
      reject(new DOMException('Video processing was cancelled', 'AbortError'))
    }
    const timeout = window.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, milliseconds)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

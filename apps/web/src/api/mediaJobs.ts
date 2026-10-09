export type MediaJob = {
  id: string
  status: 'pending' | 'processing' | 'ready' | 'failed'
  errorMessage?: string
  attempts?: number
}

const validJobID = /^[a-zA-Z0-9-]{1,128}$/

// Decode only the fields consumed by this client. Extra server metadata is not
// required for polling and must not be mistaken for validated client state.
function parseMediaJob(value: unknown, expectedID?: string): MediaJob {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid video job response')
  const data = value as Record<string, unknown>
  if (typeof data.id !== 'string' || !validJobID.test(data.id) || (expectedID !== undefined && data.id !== expectedID)
    || (data.status !== 'pending' && data.status !== 'processing' && data.status !== 'ready' && data.status !== 'failed')
    || (data.errorMessage !== undefined && typeof data.errorMessage !== 'string')
    || (data.attempts !== undefined && (typeof data.attempts !== 'number' || !Number.isInteger(data.attempts) || data.attempts < 0 || data.attempts > 32767))) {
    throw new Error('Invalid video job response')
  }
  return { id: data.id, status: data.status, ...(data.errorMessage === undefined ? {} : { errorMessage: data.errorMessage }), ...(data.attempts === undefined ? {} : { attempts: data.attempts as number }) }
}

export class VideoUploadInterruptedError extends Error {
  constructor() {
    super('Video upload was interrupted. Please try uploading again.')
    this.name = 'VideoUploadInterruptedError'
  }
}

export async function uploadPropertyVideo(
  propertyId: string,
  file: File,
  signal?: AbortSignal,
): Promise<MediaJob> {
  const form = new FormData()
  form.append('video', file)
  const response = await fetch(`/api/v1/manager/properties/${propertyId}/videos`, {
    method: 'POST',
    body: form,
    signal,
  })
  if (response.status === 408) throw new VideoUploadInterruptedError()
  if (!response.ok) throw new Error(`Video upload failed with status ${response.status}`)
  return parseMediaJob(await response.json())
}

export async function waitForMediaJob(
  jobId: string,
  onUpdate: (job: MediaJob) => void,
  signal?: AbortSignal,
): Promise<MediaJob> {
  if (!validJobID.test(jobId)) throw new Error('Invalid video job ID')
  let failures = 0
  while (!signal?.aborted) {
    const { status, job, retryAfter } = await readMediaJob(jobId, signal)
    // Retry only status reads, never the upload POST. Bound transient gateway
    // recovery to three retries (at least 1s, 2s, 4s); respect server cooldowns.
    // Auth and missing jobs fail promptly. Never shorten a long server cooldown.
    const retryDelay = Math.max(1000 * 2 ** failures, retryAfter ?? 0)
    // Status 0 is an internal transport-failure sentinel, not an HTTP response.
    if ([0, 429, 502, 503, 504].includes(status) && failures < 3 && retryDelay <= 60_000) {
      failures++
      await delay(retryDelay, signal)
      continue
    }
    if (!job) throw new Error(status === 0 ? 'Media job connection failed. Please try checking its status again.' : `Media job request failed with status ${status}`)
    failures = 0
    onUpdate(job)
    if (job.status === 'ready' || job.status === 'failed') return job
    await delay(1000, signal)
  }
  throw new DOMException('Video processing was cancelled', 'AbortError')
}

async function readMediaJob(jobId: string, signal?: AbortSignal) {
  const controller = new AbortController()
  const onAbort = () => controller.abort(signal?.reason)
  if (signal?.aborted) onAbort()
  else signal?.addEventListener('abort', onAbort, { once: true })
  // Include response-body decoding: receiving headers alone is not completion.
  const deadline = window.setTimeout(() => {
    controller.abort(new DOMException('Video status check timed out', 'TimeoutError'))
  }, 15_000)
  try {
    let response: Response
    try {
      response = await fetch(`/api/v1/manager/media-jobs/${jobId}`, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      })
    } catch (error) {
      // Fetch reports transport failures as TypeError. Keep decoding errors,
      // request deadlines and caller cancellation out of the retry path.
      if (error instanceof TypeError && !controller.signal.aborted) {
        return { status: 0, job: undefined }
      }
      throw error
    }
    if (!response.ok) {
      await response.body?.cancel()
      const header = response.headers.get('Retry-After')?.trim()
      // HTTP supports whole seconds or an HTTP date. Ignore malformed values;
      // a cooldown over one minute surfaces recovery rather than retrying early.
      const seconds = header && /^\d+$/.test(header) ? Number(header) * 1000 : undefined
      const date = header && /^[A-Za-z]{3},/.test(header) ? Date.parse(header) : NaN
      const retryAfter = seconds ?? (Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined)
      return { status: response.status, job: undefined, retryAfter }
    }
    const job = parseMediaJob(await response.json(), jobId)
    return { status: response.status, job }
  } catch (error) {
    // Keep timeouts distinct from user cancellation so the UI offers recovery.
    if (controller.signal.aborted) throw controller.signal.reason
    throw error
  } finally {
    window.clearTimeout(deadline)
    signal?.removeEventListener('abort', onAbort)
  }
}

function delay(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Video processing was cancelled', 'AbortError'))
      return
    }
    const onAbort = () => {
      window.clearTimeout(timeout)
      signal?.removeEventListener('abort', onAbort)
      reject(new DOMException('Video processing was cancelled', 'AbortError'))
    }
    const timeout = window.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, milliseconds)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

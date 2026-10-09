import { afterEach, describe, expect, it, vi } from 'vitest'
import { uploadPropertyVideo, waitForMediaJob } from './mediaJobs'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('video processing status recovery', () => {

  it('recovers from a dropped status connection without repeating the upload', async () => {
    vi.useFakeTimers()
    const ready = { id: 'job-1', status: 'ready' }
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(Response.json(ready))
    const update = vi.fn()
    const result = waitForMediaJob('job-1', update)
    const assertion = expect(result).resolves.toEqual(ready)
    await vi.advanceTimersByTimeAsync(999)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    await assertion
    expect(update).toHaveBeenCalledExactlyOnceWith(ready)
    expect(fetchMock.mock.calls.every(([url, init]) => url === '/api/v1/manager/media-jobs/job-1' && !init?.method)).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('bounds repeated network failures to three retries', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
    const assertion = expect(waitForMediaJob('job-1', vi.fn())).rejects.toThrow('Media job connection failed')
    await vi.runAllTimersAsync()
    await assertion
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not retry an interrupted upload POST', async () => {
    const error = new TypeError('Failed to fetch')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(error)
    await expect(uploadPropertyVideo('home-1', new File(['video'], 'tour.mp4'))).rejects.toBe(error)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not classify a response decoding TypeError as a dropped request', async () => {
    const response = Response.json({})
    vi.spyOn(response, 'json').mockRejectedValue(new TypeError('Unreadable body'))
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response)
    await expect(waitForMediaJob('job-1', vi.fn())).rejects.toThrow('Unreadable body')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('preserves the validated processing attempt', async () => {
    const job = { id: 'job-1', status: 'ready', attempts: 2 }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(job))
    await expect(waitForMediaJob('job-1', vi.fn())).resolves.toEqual(job)
  })

  it.each([-1, 1.5, '2', null, 32768])('rejects an invalid attempt count %s', async attempts => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ id: 'job-1', status: 'ready', attempts }))
    const update = vi.fn()
    await expect(waitForMediaJob('job-1', update)).rejects.toThrow('Invalid video job response')
    expect(update).not.toHaveBeenCalled()
  })
  it.each([
    [429, '5'], [503, '5'], [429, 'Tue, 08 Sep 2026 12:00:05 GMT'],
  ])('respects Retry-After on status %d (%s)', async (status, retryAfter) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-08T12:00:00Z'))
    const ready = { id: 'job-1', status: 'ready' }
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: Number(status), headers: { 'Retry-After': String(retryAfter) } }))
      .mockResolvedValueOnce(Response.json(ready))
    const result = waitForMediaJob('job-1', vi.fn())
    await vi.advanceTimersByTimeAsync(4999)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    await expect(result).resolves.toEqual(ready)
  })

  it.each(['nonsense', '-1', '0', 'Mon, 07 Sep 2026 12:00:00 GMT'])('keeps the minimum backoff for cooldown %s', async header => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-08T12:00:00Z'))
    const ready = { id: 'job-1', status: 'ready' }
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { 'Retry-After': header } }))
      .mockResolvedValueOnce(Response.json(ready))
    const result = waitForMediaJob('job-1', vi.fn())
    await vi.advanceTimersByTimeAsync(999)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    await expect(result).resolves.toEqual(ready)
  })

  it('does not retry earlier than a long server cooldown', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, {
      status: 429, headers: { 'Retry-After': '120' },
    }))
    await expect(waitForMediaJob('job-1', vi.fn())).rejects.toThrow('status 429')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('rejects a mismatched job before notifying the interface', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ id: 'another-job', status: 'ready' }))
    const update = vi.fn()
    await expect(waitForMediaJob('job-1', update)).rejects.toThrow('Invalid video job response')
    expect(update).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each([
    null, [], {},
    { id: 'job-1', status: 'unknown' },
    { id: 'job-1', status: null },
    { id: 'job-1', status: 'failed', errorMessage: { message: 'not text' } },
  ])('rejects malformed status data %j without polling again', async payload => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(payload))
    const update = vi.fn()
    await expect(waitForMediaJob('job-1', update)).rejects.toThrow('Invalid video job response')
    expect(update).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each(['../unexpected', '', 'job?query=1'])('rejects an unsafe requested job ID %j before fetching', async id => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    await expect(waitForMediaJob(id, vi.fn())).rejects.toThrow('Invalid video job ID')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('validates upload receipts before they can be saved for recovery', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ id: '../wrong', status: 'pending' }, { status: 202 }))
    await expect(uploadPropertyVideo('home-1', new File(['video'], 'tour.mp4'))).rejects.toThrow('Invalid video job response')
  })

  it('accepts the server job shape while exposing only validated workflow fields', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({
      id: 'job-1', propertyId: 'home-1', status: 'pending', attempts: 0,
      createdAt: '2026-09-07T12:00:00Z', outputPath: '',
    }, { status: 202 }))
    await expect(uploadPropertyVideo('home-1', new File(['video'], 'tour.mp4'))).resolves.toEqual({ id: 'job-1', status: 'pending', attempts: 0 })
  })

  it.each(['headers', 'body'])('times out a stalled response %s after 15 seconds', async stage => {
    vi.useFakeTimers()
    let requestSignal: AbortSignal | undefined
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
      requestSignal = init?.signal as AbortSignal | undefined
      const stalled = () => new Promise<never>((_resolve, reject) => {
        requestSignal?.addEventListener('abort', () => reject(requestSignal?.reason), { once: true })
      })
      if (stage === 'headers') return stalled()
      const response = Response.json({})
      vi.spyOn(response, 'json').mockImplementation(stalled)
      return Promise.resolve(response)
    })
    const update = vi.fn()
    let failure: unknown
    const settled = waitForMediaJob('job-1', update).catch(error => { failure = error })
    await vi.advanceTimersByTimeAsync(14999)
    expect(failure).toBeUndefined()
    await vi.advanceTimersByTimeAsync(1)
    expect(requestSignal?.aborted).toBe(true)
    expect(failure).toMatchObject({ name: 'TimeoutError' })
    await settled
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(update).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('forwards cancellation to an in-flight request and clears its deadline', async () => {
    vi.useFakeTimers()
    const parent = new AbortController()
    let requestSignal: AbortSignal | undefined
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      requestSignal = init?.signal as AbortSignal
      requestSignal.addEventListener('abort', () => reject(requestSignal?.reason), { once: true })
    }))
    const result = waitForMediaJob('job-1', vi.fn(), parent.signal).catch(error => error)
    parent.abort()
    expect(await result).toMatchObject({ name: 'AbortError' })
    expect(requestSignal?.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('retries temporary server failures with bounded exponential delays', async () => {
    vi.useFakeTimers()
    const ready = { id: 'job-1', status: 'ready' }
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 502 }))
      .mockResolvedValueOnce(Response.json(ready))
    const update = vi.fn()
    const result = waitForMediaJob('job-1', update)
    await vi.advanceTimersByTimeAsync(999)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1999)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    await expect(result).resolves.toEqual(ready)
    expect(update).toHaveBeenCalledExactlyOnceWith(ready)
    expect(fetchMock.mock.calls.every(([url, init]) => url === '/api/v1/manager/media-jobs/job-1' && !init?.method)).toBe(true)
  })

  it.each([429, 503])('stops after three retries and never hides status %d', async status => {
    vi.useFakeTimers()
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status }))
    const result = expect(waitForMediaJob('job-1', vi.fn())).rejects.toThrow(`status ${status}`)
    await vi.runAllTimersAsync()
    await result
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([401, 403, 404, 400])('does not retry status %d', async status => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status }))
    await expect(waitForMediaJob('job-1', vi.fn())).rejects.toThrow(`status ${status}`)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('resets the retry budget after a successful status read', async () => {
    vi.useFakeTimers()
    const pending = { id: 'job-1', status: 'processing' }
    const failed = { id: 'job-1', status: 'failed', errorMessage: 'Encoding failed' }
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json(pending))
      .mockResolvedValueOnce(new Response(null, { status: 504 }))
      .mockResolvedValueOnce(Response.json(failed))
    const update = vi.fn()
    const result = waitForMediaJob('job-1', update)
    await vi.runAllTimersAsync()
    await expect(result).resolves.toEqual(failed)
    expect(fetchMock).toHaveBeenCalledTimes(6)
    expect(update.mock.calls).toEqual([[pending], [failed]])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('never retries a malformed successful response', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('not JSON'))
    await expect(waitForMediaJob('job-1', vi.fn())).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each(['server', 'network'])('cancels a pending %s retry without another request', async failure => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    if (failure === 'network') fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    else fetchMock.mockResolvedValue(new Response(null, { status: 503 }))
    const result = expect(waitForMediaJob('job-1', vi.fn(), controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    await vi.advanceTimersByTimeAsync(100)
    controller.abort()
    await result
    await vi.runAllTimersAsync()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

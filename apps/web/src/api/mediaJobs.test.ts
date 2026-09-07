import { afterEach, describe, expect, it, vi } from 'vitest'
import { waitForMediaJob } from './mediaJobs'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('video processing status recovery', () => {
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

  it('stops after three retries and never hides the final failure', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 503 }))
    const result = expect(waitForMediaJob('job-1', vi.fn())).rejects.toThrow('status 503')
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

  it('cancels a pending retry without another request', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 503 }))
    const result = expect(waitForMediaJob('job-1', vi.fn(), controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    await vi.advanceTimersByTimeAsync(100)
    controller.abort()
    await result
    await vi.runAllTimersAsync()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

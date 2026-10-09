import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { test } from 'node:test'
import { createLogger, preview } from 'vite'

// Run explicitly with node:test, separate from Vitest's browser-oriented suite.
// Tests the built frontend and the real Vite proxy using an isolated API fixture.
// This is not a production server or a test of the Go API's authentication.
test('built preview preserves SPA routing and the API boundary', async (t) => {
  const received = []
  const api = createServer((request, response) => {
    received.push({ url: request.url, method: request.method, headers: request.headers })
    response.setHeader('Content-Type', 'application/json')
    if (request.url === '/readyz') {
      response.end(JSON.stringify({ status: 'ready' }))
    } else if (request.url === '/api/v1/interrupted-preview-fixture') {
      request.socket.destroy()
    } else if (request.url === '/api/v1/properties?county=Kildare') {
      response.end(JSON.stringify({ properties: [], fixture: true }))
    } else if (request.url === '/api/v1/manager/session') {
      response.setHeader('Cache-Control', 'no-store')
      response.statusCode = request.method === 'POST' ? 403 : 401
      response.end(JSON.stringify({ error: 'fixture-denied' }))
    } else {
      response.statusCode = 404
      response.end(JSON.stringify({ error: 'fixture-not-found' }))
    }
  })
  t.after(async () => {
    api.closeAllConnections()
    await new Promise((resolve, reject) => api.close((error) => error ? reject(error) : resolve()))
  })
  api.listen(0, '127.0.0.1')
  await once(api, 'listening')
  const apiAddress = api.address()
  assert.ok(apiAddress && typeof apiAddress === 'object')
  const originalTarget = process.env.OPENHAUS_API_PROXY_TARGET
  process.env.OPENHAUS_API_PROXY_TARGET = `http://127.0.0.1:${apiAddress.port}`
  t.after(() => {
    if (originalTarget === undefined) delete process.env.OPENHAUS_API_PROXY_TARGET
    else process.env.OPENHAUS_API_PROXY_TARGET = originalTarget
  })
  // Capture and assert the deliberately injected proxy error; unexpected errors
  // still fail the test rather than being lost among expected console output.
  const proxyErrors = []
  const logger = createLogger('silent')
  logger.error = (message, options) => proxyErrors.push({ message, code: options?.error?.code })
  const server = await preview({
    customLogger: logger,
    logLevel: 'error',
    preview: { host: '127.0.0.1', port: 0, strictPort: true, open: false },
  })
  t.after(async () => { await server.close() })
  const address = server.httpServer.address()
  assert.ok(address && typeof address === 'object')
  const base = `http://127.0.0.1:${address.port}`
  const request = (path, options = {}) => fetch(`${base}${path}`, {
    ...options, signal: AbortSignal.timeout(5000),
  })

  const home = await request('/')
  assert.equal(home.status, 200)
  assert.match(home.headers.get('content-type'), /text\/html/)
  const html = await home.text()
  assert.ok(!html.includes('/@vite/client'), 'must serve production output, not the dev client')
  const script = html.match(/<script[^>]+src="([^"]+\.js)"/)
  assert.ok(script, 'built entry script exists')
  assert.ok(script[1].startsWith('/assets/'), 'entry script stays on the local asset route')
  const asset = await request(script[1])
  assert.equal(asset.status, 200)
  assert.match(asset.headers.get('content-type'), /javascript/)
  await asset.arrayBuffer()

  for (const path of ['/client/login', '/manager', '/properties/preview-fixture']) {
    const deepLink = await request(path)
    assert.equal(deepLink.status, 200, path)
    assert.equal(await deepLink.text(), html, 'deep links must receive the SPA entry')
  }
  const catalogue = await request('/api/v1/properties?county=Kildare')
  assert.equal(catalogue.status, 200)
  assert.deepEqual(await catalogue.json(), { properties: [], fixture: true })
  assert.equal(received.at(-1).url, '/api/v1/properties?county=Kildare')

  const ready = await request('/readyz')
  assert.deepEqual(await ready.json(), { status: 'ready' })
  const missing = await request('/api/v1/unknown-preview-fixture')
  assert.equal(missing.status, 404)
  assert.match(missing.headers.get('content-type'), /application\/json/)
  assert.deepEqual(await missing.json(), { error: 'fixture-not-found' })

  for (const method of ['GET', 'POST']) {
    const denied = await request('/api/v1/manager/session', {
      method,
      headers: { Origin: base, Cookie: 'preview_fixture=not-a-real-session' },
    })
    assert.equal(denied.status, method === 'POST' ? 403 : 401)
    assert.equal(denied.headers.get('cache-control'), 'no-store')
    assert.deepEqual(await denied.json(), { error: 'fixture-denied' })
    assert.equal(received.at(-1).method, method)
    assert.equal(received.at(-1).headers.origin, base)
    assert.equal(received.at(-1).headers.cookie, 'preview_fixture=not-a-real-session')
  }

  const interrupted = await request('/api/v1/interrupted-preview-fixture')
  assert.equal(interrupted.status, 502, 'an interrupted upstream must not become SPA HTML')
  assert.match(interrupted.headers.get('content-type'), /text\/plain/)
  assert.equal(await interrupted.text(), '')

  const recovered = await request('/api/v1/properties?county=Kildare')
  assert.equal(recovered.status, 200, 'the proxy remains usable after an upstream failure')
  assert.deepEqual(await recovered.json(), { properties: [], fixture: true })
  const stillAvailable = await request('/client/login')
  assert.equal(stillAvailable.status, 200)
  assert.equal(await stillAvailable.text(), html)
  assert.equal(proxyErrors.length, 1, 'only the injected connection failure is expected')
  assert.match(proxyErrors[0].message, /http proxy error: \/api\/v1\/interrupted-preview-fixture/)
  assert.equal(proxyErrors[0].code, 'ECONNRESET')
})

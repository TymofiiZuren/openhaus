import { expect, it, vi } from 'vitest'

it('decodes only the selected county once and preserves coordinate lookup', async()=>{
 vi.resetModules()
 const codec=await import('./boundaryCodec')
 const spy=vi.spyOn(codec,'decodeBoundary')
 const areas=await import('./administrativeAreas')
 expect(spy.mock.calls.length).toBe(0)
 expect(()=>areas.areasForCounty('Dublin')).toThrow('not loaded')
 const pending=areas.loadAreasForCounty('Dublin')
 expect(areas.loadAreasForCounty('dublin')).toBe(pending)
 await pending
 const first=areas.areasForCounty('Dublin')
 expect(spy.mock.calls.length).toBeGreaterThan(0)
 const calls=spy.mock.calls.length
 expect(areas.areasForCounty('dublin')).toBe(first)
 expect(spy).toHaveBeenCalledTimes(calls)
 expect(areas.areaForCoordinate('Dublin',{lat:53.332,lng:-6.2527})?.name).toBe('Pembroke')
 expect(areas.areaForCoordinate('Dublin',{lat:0,lng:0})).toBeUndefined()
 spy.mockRestore()
})

it('evicts failed county requests so retries do not reuse a rejected promise', async () => {
 vi.resetModules()
 vi.doMock('./data/areas/cavan.json?raw', () => ({ default: '{invalid' }))
 try {
  const areas = await import('./administrativeAreas')
  const first = areas.loadAreasForCounty('Cavan')
  await expect(first).rejects.toThrow()
  const retry = areas.loadAreasForCounty('Cavan')
  expect(retry).not.toBe(first)
  await expect(retry).rejects.toThrow()
  expect(() => areas.areasForCounty('Cavan')).toThrow('not loaded')
  await expect(areas.loadAreasForCounty('../unknown')).resolves.toBeUndefined()
 } finally {
  vi.doUnmock('./data/areas/cavan.json?raw')
  vi.resetModules()
 }
})

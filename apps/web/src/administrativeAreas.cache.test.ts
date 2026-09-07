import { expect, it, vi } from 'vitest'

it('decodes only the selected county once and preserves coordinate lookup', async()=>{
 vi.resetModules()
 const codec=await import('./boundaryCodec')
 const spy=vi.spyOn(codec,'decodeBoundary')
 const areas=await import('./administrativeAreas')
 expect(spy.mock.calls.length).toBe(0)
 const first=areas.areasForCounty('Dublin')
 expect(spy.mock.calls.length).toBeGreaterThan(0)
 const calls=spy.mock.calls.length
 expect(areas.areasForCounty('dublin')).toBe(first)
 expect(spy).toHaveBeenCalledTimes(calls)
 expect(areas.areaForCoordinate('Dublin',{lat:53.332,lng:-6.2527})?.name).toBe('Pembroke')
 expect(areas.areaForCoordinate('Dublin',{lat:0,lng:0})).toBeUndefined()
 spy.mockRestore()
})

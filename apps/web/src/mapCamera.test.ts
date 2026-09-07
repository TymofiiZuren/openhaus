import { expect, it, vi } from 'vitest'
import { fitCameraImmediately } from './mapCamera'
import type { MapInstance } from './googleMapsLoader'

it('uses one atomic move and no animated fitting for repeated area selections', () => {
  const moveCamera = vi.fn(), fitBounds = vi.fn()
  const map = { moveCamera, fitBounds, getDiv: () => ({ clientWidth: 1100, clientHeight: 770 }) } as unknown as MapInstance
  const points = [{ lat: 53, lng: -10 }, { lat: 53.7, lng: -8 }]
  fitCameraImmediately(map, points, 64)
  fitCameraImmediately(map, points, 64)
  expect(fitBounds).not.toHaveBeenCalled()
  expect(moveCamera).toHaveBeenCalledTimes(2)
  expect(moveCamera.mock.calls[0]).toEqual(moveCamera.mock.calls[1])
  expect(moveCamera.mock.calls[0][0].zoom).toBe(9)
})

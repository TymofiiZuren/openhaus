import { afterEach, expect, it, vi } from 'vitest'
import { clearVideoRecovery, readVideoRecovery, saveVideoRecovery } from './videoRecovery'

afterEach(() => { vi.restoreAllMocks(); sessionStorage.clear() })

it('isolates job references by manager and property', () => {
  saveVideoRecovery('manager-1', 'home-1', 'job-1')
  expect(readVideoRecovery('manager-1', 'home-1')).toBe('job-1')
  expect(readVideoRecovery('manager-2', 'home-1')).toBeUndefined()
  expect(readVideoRecovery('manager-1', 'home-2')).toBeUndefined()
  clearVideoRecovery('manager-2', 'home-1')
  expect(readVideoRecovery('manager-1', 'home-1')).toBe('job-1')
  clearVideoRecovery('manager-1', 'home-1')
  expect(readVideoRecovery('manager-1', 'home-1')).toBeUndefined()
})

it('rejects malformed references without constructing request paths', () => {
  saveVideoRecovery('manager', 'home', '../secret?value=1')
  expect(readVideoRecovery('manager', 'home')).toBeUndefined()
  sessionStorage.setItem('openhaus:video-recovery:v1:manager:home', '../secret')
  expect(readVideoRecovery('manager', 'home')).toBeUndefined()
})

it('degrades safely when storage is blocked or full', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full') })
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('blocked') })
  expect(readVideoRecovery('manager', 'home')).toBeUndefined()
  expect(() => saveVideoRecovery('manager', 'home', 'job')).not.toThrow()
  expect(() => clearVideoRecovery('manager', 'home')).not.toThrow()
})

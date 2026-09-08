import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { LocalImagePicker } from './LocalImagePicker'

afterEach(() => vi.unstubAllGlobals())
function image() {
  const bytes = new Uint8Array([255,216,255,192,0,11,8,0,3,0,3,1,1,17,0])
  return Object.assign(new File([bytes], 'private-address.jpg'), { arrayBuffer: vi.fn().mockResolvedValue(bytes.buffer) })
}
it('validates bytes and passes only an object URL, not the private filename', async () => {
  const create = vi.fn().mockReturnValue('blob:local-photo')
  vi.stubGlobal('URL', { createObjectURL: create })
  const select = vi.fn()
  render(<LocalImagePicker onSelect={select} />)
  fireEvent.change(screen.getByLabelText('Choose a local image'), { target: { files: [image()] } })
  await waitFor(() => expect(select).toHaveBeenCalledWith('blob:local-photo'))
  expect(create.mock.calls[0][0]).toBeInstanceOf(Blob)
  expect(screen.queryByText('private-address.jpg')).not.toBeInTheDocument()
})
it('rejects oversized files before reading, retaining the current selection', async () => {
  const select = vi.fn(), file = image()
  Object.defineProperty(file, 'size', { value: 11 * 1024 * 1024 })
  render(<LocalImagePicker onSelect={select} />)
  fireEvent.change(screen.getByLabelText('Choose a local image'), { target: { files: [file] } })
  expect(await screen.findByRole('alert')).toHaveTextContent('10 MiB')
  expect(file.arrayBuffer).not.toHaveBeenCalled()
  expect(select).not.toHaveBeenCalled()
})
it('ignores a pending read after unmount', async () => {
  const select = vi.fn(), file = image()
  let finish!: (bytes: ArrayBuffer) => void
  file.arrayBuffer.mockReturnValue(new Promise(resolve => { finish = resolve }))
  const { unmount } = render(<LocalImagePicker onSelect={select} />)
  fireEvent.change(screen.getByLabelText('Choose a local image'), { target: { files: [file] } })
  unmount(); finish(new ArrayBuffer(0))
  await Promise.resolve()
  expect(select).not.toHaveBeenCalled()
})

it('does not replace the latest selection when an older file finishes reading', async () => {
  const create = vi.fn().mockReturnValue('blob:newest')
  vi.stubGlobal('URL', { createObjectURL: create })
  const select = vi.fn(), first = image(), second = image()
  let finish!: (bytes: ArrayBuffer) => void
  first.arrayBuffer.mockReturnValue(new Promise(resolve => { finish = resolve }))
  render(<LocalImagePicker onSelect={select} />)
  const input = screen.getByLabelText('Choose a local image')
  fireEvent.change(input, { target: { files: [first] } })
  fireEvent.change(input, { target: { files: [second] } })
  await waitFor(() => expect(select).toHaveBeenCalledWith('blob:newest'))
  finish(await second.arrayBuffer())
  await Promise.resolve()
  expect(create).toHaveBeenCalledTimes(1)
  expect(select).toHaveBeenCalledTimes(1)
})

import { render, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { useWorkspaceAnchor } from './useWorkspaceAnchor'

it('waits for authenticated content before restoring a workspace shortcut', async () => {
  window.history.replaceState({}, '', '/client#saved-properties-title')
  const scroll = vi.fn()
  const original = HTMLElement.prototype.scrollIntoView
  HTMLElement.prototype.scrollIntoView = scroll
  function Workspace({ ready }: { ready: boolean }) {
    useWorkspaceAnchor(ready)
    return <main className="client-main">{ready && <h2 id="saved-properties-title">Saved homes</h2>}</main>
  }
  try {
    const view = render(<Workspace ready={false} />)
    expect(scroll).not.toHaveBeenCalled()
    view.rerender(<Workspace ready />)
    await waitFor(() => expect(scroll).toHaveBeenCalledWith({ block: 'start', behavior: 'instant' }))
  } finally {
    HTMLElement.prototype.scrollIntoView = original
    window.history.replaceState({}, '', '/')
  }
})

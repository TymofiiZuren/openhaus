import { render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { MediaAudit } from './MediaAudit'
afterEach(()=>vi.restoreAllMocks())
it('loads a real versioned audit and identifies the chosen asset',async()=>{
 vi.spyOn(globalThis,'fetch').mockResolvedValue(Response.json({version:1,algorithm:'dhash-box-v1 + BK-tree',radius:8,assets:[{name:'test.jpg',perceptualHash:'0123456789abcdef',sha256:'a'.repeat(64),candidates:[]}]}))
 render(<MediaAudit filename="test.jpg" />)
 expect(await screen.findByText('0123456789abcdef')).toBeVisible()
 expect(screen.getByText(/No candidates within 8 bits/)).toBeVisible()
})
it('rejects unsupported reports instead of showing invented measurements',async()=>{
 vi.spyOn(globalThis,'fetch').mockResolvedValue(Response.json({version:2,assets:[]}))
 render(<MediaAudit filename="test.jpg" />)
 expect(await screen.findByRole('alert')).toHaveTextContent('Similarity report unavailable')
})

import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { ManagerImages } from './ManagerImages'
afterEach(()=>vi.restoreAllMocks())
it('edits a saved description and retains it after a failed save',async()=>{
 const media={url:'/front.png',kind:'image' as const,altText:'Front',position:0}
 const saved=vi.fn()
 vi.spyOn(globalThis,'fetch').mockResolvedValueOnce(new Response(null,{status:503})).mockResolvedValueOnce(Response.json({...media,altText:'Garden entrance'}))
 const user=userEvent.setup()
 render(<ManagerImages propertyID="home" media={[media]} onUploaded={vi.fn()} onOrdered={vi.fn()} onUpdated={saved}/> )
 await user.click(screen.getByRole('button',{name:'Edit description: Front'}))
 const input=screen.getByLabelText('Description for Front')
 await user.clear(input);await user.type(input,'Garden entrance')
 await user.click(screen.getByRole('button',{name:'Save description'}))
 expect(await screen.findByRole('alert')).toHaveTextContent('Could not save')
 expect(input).toHaveValue('Garden entrance')
 await user.click(screen.getByRole('button',{name:'Save description'}))
 expect(await screen.findByText('Description saved.')).toBeVisible()
 expect(saved).toHaveBeenCalledWith({...media,altText:'Garden entrance'})
})
it('uploads a described floor plan and reports saved media', async()=>{
 const media={url:'/api/v1/property-images/test.png',kind:'floor_plan',altText:'Ground floor',position:0}
 const fetchMock=vi.spyOn(globalThis,'fetch').mockResolvedValue(Response.json(media,{status:201}))
 const saved=vi.fn();const user=userEvent.setup()
 render(<ManagerImages propertyID="home" media={[]} onUploaded={saved} onOrdered={vi.fn()}/> )
 await user.selectOptions(screen.getByLabelText('Media type'),'floor_plan')
 await user.type(screen.getByLabelText('Image description'),'Ground floor')
 await user.upload(screen.getByLabelText('Choose photo or plan'),new File(['png'],'plan.png',{type:'image/png'}))
 // jsdom does not update native file-input validity for userEvent's FileList.
 fireEvent.submit(screen.getByRole('button',{name:'Upload image'}).closest('form')!)
 expect(await screen.findByText('Image saved.')).toBeVisible()
 expect(saved).toHaveBeenCalledWith(media)
 expect(fetchMock).toHaveBeenCalledWith('/api/v1/manager/properties/home/images',expect.objectContaining({method:'POST',body:expect.any(FormData)}))
})
it('makes the second photo the cover through a persisted order',async()=>{
 const media=[{url:'/a.png',kind:'image' as const,altText:'Front',position:0},{url:'/b.png',kind:'image' as const,altText:'Garden',position:1}]
 const fetchMock=vi.spyOn(globalThis,'fetch').mockResolvedValue(Response.json([...media].reverse()))
 const ordered=vi.fn();render(<ManagerImages propertyID="home" media={media} onUploaded={vi.fn()} onOrdered={ordered}/> )
 await userEvent.click(screen.getByRole('button',{name:'Make cover: Garden'}))
 expect(await screen.findByText('Photo order saved.')).toBeVisible()
 expect(fetchMock).toHaveBeenCalledWith('/api/v1/manager/properties/home/image-order',expect.objectContaining({body:JSON.stringify({urls:['/b.png','/a.png']})}))
 expect(ordered).toHaveBeenCalled()
})

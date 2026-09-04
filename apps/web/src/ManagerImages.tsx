import { useId, useState, type FormEvent } from 'react'
import type { Property } from './api/properties'

type Media = Property['media'][number]
export function ManagerImages({propertyID,media,onUploaded,onOrdered,onUpdated}:{propertyID:string;media:Media[];onUploaded:(media:Media)=>void;onOrdered:(media:Media[])=>void;onUpdated?:(media:Media)=>void}) {
 const id=useId()
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [message,setMessage]=useState('')
 const [file,setFile]=useState<File>()
 const photos=media.filter(item=>item.kind==='image').sort((a,b)=>a.position-b.position)
 const plans=media.filter(item=>item.kind==='floor_plan')
 async function upload(event:FormEvent<HTMLFormElement>){
  event.preventDefault();const form=event.currentTarget;const data=new FormData(form)
  setError('');setMessage('')
  if(!file?.size||file.size>10*1024*1024||!['image/jpeg','image/png'].includes(file.type)){setError('Choose a JPEG or PNG smaller than 10 MiB.');return}
  data.set('image',file)
  setBusy(true)
  try{const response=await fetch(`/api/v1/manager/properties/${propertyID}/images`,{method:'POST',body:data});if(!response.ok)throw new Error();onUploaded(await response.json());form.reset();setMessage('Image saved.')}
  catch{setError('Image could not be saved. Check the file (JPEG/PNG, up to 24 megapixels) and your connection, then retry.')}
  finally{setBusy(false)}
 }
 async function reorder(from:number,to:number){
  const ordered=[...photos];ordered.splice(to,0,ordered.splice(from,1)[0]);setBusy(true);setError('');setMessage('')
  try{const response=await fetch(`/api/v1/manager/properties/${propertyID}/image-order`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({urls:ordered.map(item=>item.url)})});if(!response.ok)throw new Error();onOrdered(await response.json());setMessage('Photo order saved.')}
  catch{setError('Order could not be saved. Refresh the page if another manager changed the photos, then retry.')}
  finally{setBusy(false)}
 }
 return <section className="manager-images" aria-labelledby={`${id}-title`} aria-busy={busy}>
  <h3 id={`${id}-title`}>Photos & floor plans</h3>
  <p>Upload one image at a time. JPEG or PNG, up to 10 MiB and 24 megapixels. The first photo is the cover. Saved changes appear immediately on published listings.</p>
  <form onSubmit={upload}>
   <fieldset disabled={busy}>
    <label htmlFor={`${id}-kind`}>Media type</label><select id={`${id}-kind`} name="kind"><option value="image">Photo</option><option value="floor_plan">Floor plan</option></select>
    <label htmlFor={`${id}-description`}>Image description</label><input id={`${id}-description`} name="description" maxLength={500} required placeholder="e.g. Bright living room overlooking the garden"/>
    <label htmlFor={`${id}-file`}>Choose photo or plan</label><input id={`${id}-file`} name="image" type="file" accept="image/jpeg,image/png" onChange={(event)=>setFile(event.target.files?.[0])} required/>
    <button type="submit">{busy?'Saving…':'Upload image'}</button>
   </fieldset>
  </form>
  {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
  <div className="manager-image-grid">{photos.length===0&&plans.length===0&&<div className="manager-gallery-empty"><span aria-hidden="true">＋</span><strong>Give this home its first impression</strong><p>Upload a photo to start the gallery, or a floor plan to show how the rooms connect.</p></div>}{[...photos,...plans].map(item=>{
   const index=photos.indexOf(item)
   const src=item.url.replace('/api/v1/property-images/','/api/v1/manager/property-images/')
   return <figure key={item.url}><a href={src} target="_blank" rel="noreferrer" aria-label={`Open image: ${item.altText}`}><img src={src} alt={item.altText} loading="lazy"/></a><figcaption>{index===0?'Cover photo':item.kind==='floor_plan'?'Floor plan':`Photo ${index+1}`} · {item.altText}</figcaption>
    {onUpdated&&<ImageDescriptionEditor propertyID={propertyID} media={item} disabled={busy} onUpdated={onUpdated}/>}
    {index>=0&&<div className="manager-image-actions">
     <button type="button" disabled={busy||index===0} onClick={()=>reorder(index,0)} aria-label={`Make cover: ${item.altText}`}>Make cover</button>
     <button type="button" disabled={busy||index===0} onClick={()=>reorder(index,index-1)} aria-label={`Move earlier: ${item.altText}`}>Earlier</button>
     <button type="button" disabled={busy||index===photos.length-1} onClick={()=>reorder(index,index+1)} aria-label={`Move later: ${item.altText}`}>Later</button>
    </div>}
   </figure>
  })}</div>
 </section>
}

function ImageDescriptionEditor({propertyID,media,disabled,onUpdated}:{propertyID:string;media:Media;disabled:boolean;onUpdated:(media:Media)=>void}){
 const [editing,setEditing]=useState(false)
 const [description,setDescription]=useState(media.altText)
 const [saving,setSaving]=useState(false)
 const [error,setError]=useState('')
 const [saved,setSaved]=useState(false)
 const id=useId()
 async function save(event:FormEvent){
  event.preventDefault();setError('')
  if(!description.trim()||new TextEncoder().encode(description.trim()).length>500){setError('Enter a description of up to 500 bytes.');return}
  setSaving(true)
  try{const response=await fetch(`/api/v1/manager/properties/${propertyID}/image-description`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:media.url,description:description.trim()})});if(!response.ok)throw new Error();onUpdated(await response.json());setEditing(false);setSaved(true)}
  catch{setError('Could not save the description. Your text is kept here; try again.')}
  finally{setSaving(false)}
 }
 return <div className="manager-description-editor">
  {!editing?<><button type="button" disabled={disabled} aria-label={`Edit description: ${media.altText}`} onClick={()=>{setDescription(media.altText);setEditing(true);setError('');setSaved(false)}}>Edit description</button>{saved&&<p role="status">Description saved.</p>}</>:<form onSubmit={save}>
   <label htmlFor={id}>Description for {media.altText}</label><input id={id} value={description} onChange={event=>setDescription(event.target.value)} maxLength={500} required disabled={saving} aria-describedby={error?`${id}-error`:undefined}/>
   <div><button type="submit" disabled={saving||disabled}>{saving?'Saving…':'Save description'}</button><button type="button" disabled={saving} onClick={()=>setEditing(false)}>Cancel</button></div>
   {error&&<p id={`${id}-error`} role="alert">{error}</p>}
  </form>}
 </div>
}

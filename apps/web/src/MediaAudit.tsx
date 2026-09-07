import { useEffect, useState } from 'react'

type Asset = { name: string; perceptualHash: string; sha256: string; candidates: {name:string;distance:number}[] }
function parseReport(value: unknown): Asset[] {
 const report = value as {version?:unknown;algorithm?:unknown;radius?:unknown;assets?:unknown}
 if (!report || report.version !== 1 || report.algorithm !== 'dhash-box-v1 + BK-tree' || report.radius !== 8 || !Array.isArray(report.assets)) throw new Error('Unsupported report')
 return report.assets.map((asset: Asset)=>{
  if (!asset || typeof asset.name !== 'string' || !/^[a-z0-9-]+\.jpg$/.test(asset.name) || !/^[a-f0-9]{16}$/.test(asset.perceptualHash) || !/^[a-f0-9]{64}$/.test(asset.sha256) || !Array.isArray(asset.candidates) || asset.candidates.some(item=>!item || typeof item.name!=='string' || !Number.isInteger(item.distance) || item.distance<0 || item.distance>8)) throw new Error('Invalid asset')
  return asset
 })
}

export function MediaAudit({filename}:{filename:string}) {
 const [state,setState]=useState<{assets:Asset[]}|{error:true}>()
 useEffect(()=>{
  const controller=new AbortController()
  const timeout=window.setTimeout(()=>controller.abort(),10000)
  let active=true
  fetch('/media-demo/audit-v1.json',{signal:controller.signal}).then(response=>{if(!response.ok)throw new Error();return response.json()}).then(data=>{if(active)setState({assets:parseReport(data)})}).catch(()=>{if(active)setState({error:true})}).finally(()=>clearTimeout(timeout))
  return ()=>{active=false;controller.abort();clearTimeout(timeout)}
 },[])
 const asset=state&&'assets' in state?state.assets.find(item=>item.name===filename):undefined
 return <section className="media-lab-method" aria-label="Perceptual similarity report"><div><p className="eyebrow">Go / dHash / BK-tree</p><h2>Similar pixels. Different evidence.</h2><p>A Go tool reduces each image to a 9 × 8 grayscale grid and compares adjacent cells to form a 64-bit fingerprint. A BK-tree uses Hamming distance and triangle-inequality pruning to find nearby fingerprints.</p><p>This is an offline audit delivered as a JSON report, not a live upload scanner. Similar rooms, crops and flat images can mislead it. Candidates need human review; nothing is automatically removed.</p><a href="/media-demo/audit-v1.json" download>Download similarity report ↓</a></div><div>
 {!state?<p role="status">Loading similarity report…</p>:'error' in state?<p role="alert">Similarity report unavailable. Reload to try again.</p>:!asset?<p>This sample has not been audited.</p>:<><p className="eyebrow">{state.assets.length} images indexed · distance threshold 8 / 64</p><h3>{asset.name}</h3><p>Perceptual fingerprint</p><code>{asset.perceptualHash}</code>{asset.candidates.length?<ul>{asset.candidates.map(item=><li key={item.name}>{item.name} · {item.distance} bits different</li>)}</ul>:<p>No candidates within 8 bits. This does not prove the image is unique.</p>}<details><summary>SHA-256 file identity</summary><code style={{overflowWrap:'anywhere'}}>{asset.sha256}</code></details></>}
 </div></section>
}

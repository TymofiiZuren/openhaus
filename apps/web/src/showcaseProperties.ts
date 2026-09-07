// Presentation-only registry for the insert-only packs in seed 000005.
// This is not an authorization rule or a substitute for publication status.
const showcaseIDs = new Set([
  'd3000000-0000-4000-8000-000000000001',
  'd3000000-0000-4000-8000-000000000002',
  'd3000000-0000-4000-8000-000000000003',
  ...Array.from({length:20},(_,index)=>`d5000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`),
])
export function isShowcaseProperty(id: string) { return showcaseIDs.has(id) }

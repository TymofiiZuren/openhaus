// A tab-local convenience only. Server authentication remains authoritative.
const prefix = 'openhaus:video-recovery:v1:'
const validID = /^[a-zA-Z0-9-]{1,128}$/

function key(managerID: string, propertyID: string) {
  return `${prefix}${encodeURIComponent(managerID)}:${encodeURIComponent(propertyID)}`
}

export function readVideoRecovery(managerID: string, propertyID: string): string | undefined {
  try {
    const id = sessionStorage.getItem(key(managerID, propertyID))
    return id && validID.test(id) ? id : undefined
  } catch { return undefined }
}

export function saveVideoRecovery(managerID: string, propertyID: string, jobID: string) {
  if (!validID.test(jobID)) return
  try { sessionStorage.setItem(key(managerID, propertyID), jobID) }
  catch { /* In-memory recovery still works when browser storage is unavailable. */ }
}

export function clearVideoRecovery(managerID: string, propertyID: string) {
  try { sessionStorage.removeItem(key(managerID, propertyID)) }
  catch { /* Storage is optional; never turn completed processing into a failure. */ }
}

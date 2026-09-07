export type ClientPropertyNote = {
  propertyId: string
  notes: string
  questions: string[]
  updatedAt?: string
}

type NoteResponse = { note: ClientPropertyNote }

function parseNote(body: unknown): ClientPropertyNote {
  const note = (body as NoteResponse | null)?.note
  if (!note || typeof note.propertyId !== 'string' || typeof note.notes !== 'string' || !Array.isArray(note.questions) || !note.questions.every(question => typeof question === 'string')) {
    throw new Error('invalid_property_note')
  }
  return note
}

export async function fetchClientPropertyNote(propertyID: string, signal?: AbortSignal): Promise<ClientPropertyNote> {
  const response = await fetch(`/api/v1/client/property-notes/${encodeURIComponent(propertyID)}`, {
    credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' }, signal,
  })
  if (response.status === 401) throw new Error('authentication_required')
  if (!response.ok) throw new Error('property_note_unavailable')
  return parseNote(await response.json())
}

export async function saveClientPropertyNote(propertyID: string, note: Pick<ClientPropertyNote, 'notes' | 'questions'>): Promise<ClientPropertyNote> {
  const response = await fetch(`/api/v1/client/property-notes/${encodeURIComponent(propertyID)}`, {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(note),
  })
  if (response.status === 401) throw new Error('authentication_required')
  if (!response.ok) throw new Error('save_property_note_failed')
  return parseNote(await response.json())
}

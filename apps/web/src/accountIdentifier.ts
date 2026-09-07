export function displayAccountIdentifier(identifier: string) {
  const concise = identifier.replace(/[^a-z0-9]/gi, '').slice(0, 8).toUpperCase()
  return `OH-${concise || 'ACCOUNT'}`
}

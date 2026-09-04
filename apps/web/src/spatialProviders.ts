export type ApprovedSpatialEmbed = { provider: 'Kuula' | 'Matterport'; url: string }

export function normalizeSpatialEmbedUrl(value: string): ApprovedSpatialEmbed | undefined {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password) return undefined
    const host = url.hostname.toLowerCase()
    if ((host === 'kuula.co' || host === 'www.kuula.co' || host === 'mls.kuu.la') && /^\/share\/(?:[A-Za-z0-9]+\/)?(?:collection\/)?[A-Za-z0-9]+\/?$/.test(url.pathname)) {
      return { provider: 'Kuula', url: url.toString() }
    }
    if (host === 'my.matterport.com' && url.pathname === '/show/' && /^[A-Za-z0-9_-]+$/.test(url.searchParams.get('m') ?? '')) {
      return { provider: 'Matterport', url: url.toString() }
    }
  } catch {
    return undefined
  }
  return undefined
}

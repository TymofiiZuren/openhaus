import { useState } from 'react'
import { normalizeSpatialEmbedUrl } from './spatialProviders'

type SpatialState = { processingState?: 'ready' | 'processing' | 'failed'; posterUrl?: string }
export type SpatialMediaSource = SpatialState & { provider: 'embed'; embedUrl: string; title: string }

export function SpatialMediaViewer({ source }: { source: SpatialMediaSource }) {
  if (source.processingState && source.processingState !== 'ready') {
    const failed = source.processingState === 'failed'
    return <div className="media-module media-module-360 spatial-processing" role={failed ? 'alert' : 'status'}>
      {source.posterUrl && <img src={source.posterUrl} alt="" />}
      <div><span>02</span><strong>{failed ? '360° tour unavailable' : '360° tour processing'}</strong><small>{failed ? 'Photography remains available while this is reviewed' : 'The immersive view will appear when processing finishes'}</small></div>
    </div>
  }
  return <HostedSpatialTour source={source} />
}

function HostedSpatialTour({ source }: { source: Extract<SpatialMediaSource, { provider: 'embed' }> }) {
  const [entered, setEntered] = useState(false)
  const approved = normalizeSpatialEmbedUrl(source.embedUrl)
  if (!approved) return <div className="media-module media-module-360 spatial-processing spatial-provider-error" role="alert">
    <div><span>02</span><strong>This tour provider is not supported</strong><small>Use a Kuula share link or Matterport Showcase link</small></div>
  </div>
  if (!entered) return <div className="media-module media-module-360 spatial-consent" role="group" aria-label={source.title}>
    {source.posterUrl && <img src={source.posterUrl} alt="" loading="lazy" />}
    <div className="spatial-consent-copy"><span>360° · {approved.provider} ready</span><strong>Step inside the home.</strong><small>{source.title}. Interactive content loads only after you continue.</small><button type="button" onClick={() => setEntered(true)}>Enter 360° tour</button></div>
  </div>
  return <div className="media-module media-module-360 spatial-embed" role="group" aria-label={source.title}>
    <iframe title={source.title} src={approved.url} loading="lazy" allow="fullscreen; xr-spatial-tracking; gyroscope; accelerometer" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-popups allow-forms" />
    <div><span>02</span><strong>Immersive view</strong><small>{approved.provider} hosted tour</small></div>
  </div>
}

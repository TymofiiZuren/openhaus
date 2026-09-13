import { useState } from 'react'
import type { MediaAnalysis } from './mediaAnalysis'
import './ChannelHistogram.css'
import { histogramStatistics } from './histogramStatistics'

const channelLabels = { luma: 'Luma', red: 'Red', green: 'Green', blue: 'Blue' } as const
type Channel = keyof typeof channelLabels

export function ChannelHistogram({ result }: { result: Pick<MediaAnalysis, 'histogram' | 'channels' | 'width' | 'height'> }) {
  const [channel, setChannel] = useState<Channel>('luma')
  const bins = channel === 'luma' ? result.histogram : result.channels[channel]
  const peak = Math.max(...bins)
  const total = result.width * result.height
  const label = channelLabels[channel]
  const statistics = histogramStatistics(bins)
  return <section className="channel-histogram" aria-label="Image channel analysis">
    <div className="channel-histogram-controls" role="group" aria-label="Histogram channel">
      {(Object.keys(channelLabels) as Channel[]).map(key => <button type="button" key={key} aria-pressed={channel === key} onClick={() => setChannel(key)}>{channelLabels[key]}</button>)}
    </div>
    <div className="channel-histogram-chart" role="img" aria-label={`${label} channel histogram, 32 bins from 0 to 255. Peak bin contains ${peak} pixels.`}>
      {bins.map((count, index) => <i key={index} style={{ height: `${peak ? count / peak * 100 : 0}%` }} />)}
    </div>
    <div className="channel-histogram-axis" aria-hidden="true"><span>0 · low intensity</span><span>255 · high intensity</span></div>
    <p>Bars scale to the selected channel’s peak. Counts describe the sampled image, not the original resolution.</p>
    <dl aria-label={`${label} distribution statistics`}>
      <div><dt>Binned entropy / 5 bits</dt><dd>{statistics.entropyBits.toFixed(2)}</dd></div>
      <div><dt>Otsu split after intensity</dt><dd>{statistics.splitAfter ?? 'No split'}</dd></div>
    </dl>
    <p>Entropy describes how evenly counts fill the 32 bins. Otsu finds the strongest two-class intensity separation; ties use the lowest boundary. Neither measures sharpness, quality or objects in the image.</p>
    <details><summary>View channel counts</summary>
      <div className="channel-histogram-table"><table>
        <caption>{label} · {total.toLocaleString()} sampled pixels</caption>
        <thead><tr><th scope="col">Intensity</th><th scope="col">Pixels</th><th scope="col">Share</th></tr></thead>
        <tbody>{bins.map((count, index) => <tr key={index}><th scope="row">{index * 8}–{index * 8 + 7}</th><td>{count.toLocaleString()}</td><td>{(count / total * 100).toFixed(2)}%</td></tr>)}</tbody>
      </table></div>
    </details>
  </section>
}

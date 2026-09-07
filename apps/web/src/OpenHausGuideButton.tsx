import './OpenHausGuideButton.css'

type OpenHausGuideButtonProps = {
  open?: boolean
  onOpen?: (anchor: HTMLElement) => void
  compact?: boolean
}

export const openHausGuideEvent = 'openhaus:guide-open'

export function OpenHausGuideButton({ open = false, onOpen, compact = false }: OpenHausGuideButtonProps) {
  const content = <>
    <span className="openhaus-guide-orbit" aria-hidden="true"><i /><i /><i /><b /></span>
    {!compact && <span>Guide</span>}
  </>

  if (!onOpen) return <button type="button" className="openhaus-guide-trigger" aria-label="Open OpenHaus guide" aria-controls="openhaus-guide-dialog" aria-expanded={open} onClick={event => window.dispatchEvent(new CustomEvent(openHausGuideEvent, { detail: event.currentTarget }))}>{content}</button>
  return <button type="button" className="openhaus-guide-trigger" aria-label="Open OpenHaus guide" aria-controls="openhaus-guide-dialog" aria-expanded={open} onClick={(event) => onOpen(event.currentTarget)}>{content}</button>
}

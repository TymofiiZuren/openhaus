import { useMemo, useState, type MouseEvent } from 'react'
import type { Property } from './api/properties'

type PropertyImageCarouselProps = {
  property: Property
  className: string
  onImageClick?: () => void
}

export function PropertyImageCarousel({ property, className, onImageClick }: PropertyImageCarouselProps) {
  const images = useMemo(() => property.media.filter((item) => item.kind === 'image').sort((left, right) => left.position - right.position), [property.media])
  const [index, setIndex] = useState(0)

  const visibleIndex = images.length > 0 ? index % images.length : 0

  function changeImage(event: MouseEvent, direction: number) {
    event.preventDefault()
    event.stopPropagation()
    setIndex((current) => (current + direction + images.length) % images.length)
  }

  return (
    <div className={`property-image-carousel ${className}`}>
      {images[visibleIndex]
        ? onImageClick
          ? <button className="property-carousel-photo" type="button" aria-label={`Show ${property.title} on map`} onClick={onImageClick}><img src={images[visibleIndex].url} alt="" loading="lazy" /></button>
          : <div className="property-carousel-photo"><img src={images[visibleIndex].url} alt="" loading="lazy" /></div>
        : <span className="property-carousel-empty">No photo</span>}
      {images.length > 1 && <>
        <button className="property-carousel-arrow is-previous" type="button" aria-label={`Previous image of ${property.title}`} onClick={(event) => changeImage(event, -1)}><span aria-hidden="true">‹</span></button>
        <button className="property-carousel-arrow is-next" type="button" aria-label={`Next image of ${property.title}`} onClick={(event) => changeImage(event, 1)}><span aria-hidden="true">›</span></button>
        <span className="property-carousel-count" aria-live="polite">{visibleIndex + 1} / {images.length}</span>
      </>}
    </div>
  )
}

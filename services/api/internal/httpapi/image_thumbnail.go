package httpapi

import (
	"image"
	"image/color"
)

// Called only after the upload pixel cap and orientation normalization. Integer
// box partitions cover every source pixel once, with no interpolation halos.
// Average premultiplied channels to avoid bleeding invisible RGB into edges.
func thumbnailImage(source image.Image) image.Image {
	bounds := source.Bounds()
	w, h := bounds.Dx(), bounds.Dy()
	longest := max(w, h)
	if longest <= 480 {
		return source
	}
	outW := max(1, int((int64(w)*480+int64(longest)/2)/int64(longest)))
	outH := max(1, int((int64(h)*480+int64(longest)/2)/int64(longest)))
	result := image.NewRGBA64(image.Rect(0, 0, outW, outH))
	for y := 0; y < outH; y++ {
		for x := 0; x < outW; x++ {
			x0, x1 := int(int64(x)*int64(w)/int64(outW)), int(int64(x+1)*int64(w)/int64(outW))
			y0, y1 := int(int64(y)*int64(h)/int64(outH)), int(int64(y+1)*int64(h)/int64(outH))
			var red, green, blue, alpha uint64
			for sy := y0; sy < y1; sy++ {
				for sx := x0; sx < x1; sx++ {
					r, g, b, a := source.At(bounds.Min.X+sx, bounds.Min.Y+sy).RGBA()
					red += uint64(r)
					green += uint64(g)
					blue += uint64(b)
					alpha += uint64(a)
				}
			}
			count := uint64(x1-x0) * uint64(y1-y0)
			result.SetRGBA64(x, y, color.RGBA64{R: uint16(red / count), G: uint16(green / count), B: uint16(blue / count), A: uint16(alpha / count)})
		}
	}
	return result
}

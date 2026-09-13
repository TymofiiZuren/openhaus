package httpapi

import (
	"bytes"
	"encoding/binary"
	"image"
)

// Read only the first EXIF APP1's primary IFD orientation. Never follow nested
// IFD/thumbnail offsets. Missing or malformed metadata leaves pixels unchanged;
// image.Decode remains authoritative for whether the image itself is valid.
func jpegOrientation(data []byte) int {
	if len(data) < 2 || data[0] != 255 || data[1] != 216 {
		return 1
	}
	for offset := 2; offset < len(data); {
		if data[offset] != 255 {
			return 1
		}
		for offset < len(data) && data[offset] == 255 {
			offset++
		}
		if offset >= len(data) {
			return 1
		}
		marker := data[offset]
		offset++
		if marker == 0 || marker == 0xda || marker == 0xd9 || marker == 0xd8 {
			return 1
		}
		if marker == 1 || (marker >= 0xd0 && marker <= 0xd7) {
			continue
		}
		if len(data)-offset < 2 {
			return 1
		}
		length := int(binary.BigEndian.Uint16(data[offset : offset+2]))
		if length < 2 || length > len(data)-offset {
			return 1
		}
		payload := data[offset+2 : offset+length]
		if marker == 0xe1 && bytes.HasPrefix(payload, []byte("Exif\x00\x00")) {
			return tiffOrientation(payload[6:])
		}
		offset += length
	}
	return 1
}

func tiffOrientation(data []byte) int {
	if len(data) < 8 {
		return 1
	}
	var order binary.ByteOrder
	switch string(data[:2]) {
	case "II":
		order = binary.LittleEndian
	case "MM":
		order = binary.BigEndian
	default:
		return 1
	}
	if order.Uint16(data[2:4]) != 42 {
		return 1
	}
	offset := uint64(order.Uint32(data[4:8]))
	if offset < 8 || offset+2 > uint64(len(data)) {
		return 1
	}
	entries := uint64(order.Uint16(data[offset : offset+2]))
	start := offset + 2
	// Include the trailing next-IFD pointer in the bounds check, but do not follow it.
	if start+entries*12+4 > uint64(len(data)) {
		return 1
	}
	for i := uint64(0); i < entries; i++ {
		entry := data[start+i*12 : start+(i+1)*12]
		if order.Uint16(entry[:2]) != 0x112 {
			continue
		}
		if order.Uint16(entry[2:4]) != 3 || order.Uint32(entry[4:8]) != 1 {
			return 1
		}
		value := int(order.Uint16(entry[8:10]))
		if value >= 1 && value <= 8 {
			return value
		}
		return 1
	}
	return 1
}

// EXIF's eight orientations are integer coordinate permutations: no resampling.
// Non-identity transforms allocate one output raster within the upload pixel cap.
func orientImage(source image.Image, orientation int) image.Image {
	if orientation < 2 || orientation > 8 {
		return source
	}
	bounds := source.Bounds()
	w, h := bounds.Dx(), bounds.Dy()
	outW, outH := w, h
	if orientation >= 5 {
		outW, outH = h, w
	}
	result := image.NewNRGBA(image.Rect(0, 0, outW, outH))
	for y := 0; y < outH; y++ {
		for x := 0; x < outW; x++ {
			sx, sy := x, y
			switch orientation {
			case 2:
				sx = w - 1 - x
			case 3:
				sx, sy = w-1-x, h-1-y
			case 4:
				sy = h - 1 - y
			case 5:
				sx, sy = y, x
			case 6:
				sx, sy = y, h-1-x
			case 7:
				sx, sy = w-1-y, h-1-x
			case 8:
				sx, sy = w-1-y, x
			}
			result.Set(x, y, source.At(bounds.Min.X+sx, bounds.Min.Y+sy))
		}
	}
	return result
}

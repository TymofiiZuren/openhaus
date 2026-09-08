package httpapi

import (
	"bytes"
	"encoding/binary"
	"image"
	"image/color"
	"image/jpeg"
	"testing"
)

func orientationJPEG(order binary.ByteOrder, value uint16) []byte {
	tiff := make([]byte, 26)
	copy(tiff, "II")
	if order == binary.BigEndian {
		copy(tiff, "MM")
	}
	order.PutUint16(tiff[2:], 42)
	order.PutUint32(tiff[4:], 8)
	order.PutUint16(tiff[8:], 1)
	order.PutUint16(tiff[10:], 0x112)
	order.PutUint16(tiff[12:], 3)
	order.PutUint32(tiff[14:], 1)
	order.PutUint16(tiff[18:], value)
	segment := append([]byte("Exif\x00\x00"), tiff...)
	header := []byte{255, 216, 255, 225, 0, byte(len(segment) + 2)}
	return append(header, segment...)
}

func TestJPEGOrientationByteOrders(t *testing.T) {
	for _, order := range []binary.ByteOrder{binary.LittleEndian, binary.BigEndian} {
		for orientation := uint16(1); orientation <= 8; orientation++ {
			if got := jpegOrientation(orientationJPEG(order, orientation)); got != int(orientation) {
				t.Fatalf("got %d want %d", got, orientation)
			}
		}
	}
}

func TestJPEGOrientationSkipsUnrelatedSegmentsAndStopsAtScan(t *testing.T) {
	valid := orientationJPEG(binary.LittleEndian, 8)
	withAPP0 := append([]byte{255, 216, 255, 224, 0, 4, 0, 0}, valid[2:]...)
	if jpegOrientation(withAPP0) != 8 {
		t.Fatal("APP0 hid orientation")
	}
	afterScan := append([]byte{255, 216, 255, 218, 0, 2}, valid[2:]...)
	if jpegOrientation(afterScan) != 1 {
		t.Fatal("read metadata from entropy-coded data")
	}
	// A cyclic next-IFD pointer must not be followed.
	binary.LittleEndian.PutUint32(valid[len(valid)-4:], 8)
	if jpegOrientation(valid) != 8 {
		t.Fatal("primary orientation lost")
	}
}

func TestOrientationPixelMappings(t *testing.T) {
	source := image.NewGray(image.Rect(10, 20, 12, 23))
	for i := 0; i < 6; i++ {
		source.SetGray(10+i%2, 20+i/2, color.Gray{Y: uint8(i + 1)})
	}
	wants := [][]uint8{{1, 2, 3, 4, 5, 6}, {2, 1, 4, 3, 6, 5}, {6, 5, 4, 3, 2, 1}, {5, 6, 3, 4, 1, 2}, {1, 3, 5, 2, 4, 6}, {5, 3, 1, 6, 4, 2}, {6, 4, 2, 5, 3, 1}, {2, 4, 6, 1, 3, 5}}
	for i, want := range wants {
		result := orientImage(source, i+1)
		w, h := 2, 3
		if i >= 4 {
			w, h = h, w
		}
		if result.Bounds().Dx() != w || result.Bounds().Dy() != h {
			t.Fatalf("orientation %d: wrong bounds", i+1)
		}
		for j, value := range want {
			got := color.GrayModel.Convert(result.At(result.Bounds().Min.X+j%w, result.Bounds().Min.Y+j/w)).(color.Gray).Y
			if got != value {
				t.Fatalf("orientation %d pixel %d: got %d want %d", i+1, j, got, value)
			}
		}
	}
	if orientImage(source, 1) != source {
		t.Fatal("identity should not allocate a new image")
	}
}

func TestSanitizationAppliesJPEGOrientationBeforeRemovingMetadata(t *testing.T) {
	source := image.NewGray(image.Rect(0, 0, 128, 64))
	for y := 0; y < 64; y++ {
		for x := 64; x < 128; x++ {
			source.SetGray(x, y, color.Gray{Y: 255})
		}
	}
	var encoded bytes.Buffer
	if err := jpeg.Encode(&encoded, source, &jpeg.Options{Quality: 95}); err != nil {
		t.Fatal(err)
	}
	input := append(orientationJPEG(binary.BigEndian, 6), encoded.Bytes()[2:]...)
	clean, err := sanitizeImage(input)
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := jpeg.Decode(bytes.NewReader(clean.data))
	if err != nil {
		t.Fatal(err)
	}
	if decoded.Bounds().Dx() != 64 || decoded.Bounds().Dy() != 128 {
		t.Fatalf("phone photo not rotated: %v", decoded.Bounds())
	}
	top := color.GrayModel.Convert(decoded.At(32, 16)).(color.Gray).Y
	bottom := color.GrayModel.Convert(decoded.At(32, 112)).(color.Gray).Y
	if top > 10 || bottom < 245 {
		t.Fatalf("incorrect rotation: top=%d bottom=%d", top, bottom)
	}
	if bytes.Contains(clean.data, []byte("Exif\x00\x00")) {
		t.Fatal("EXIF was retained")
	}
}

func TestMalformedOrientationMetadataIsIgnored(t *testing.T) {
	valid := orientationJPEG(binary.LittleEndian, 6)
	for length := 0; length < len(valid); length++ {
		if got := jpegOrientation(valid[:length]); got != 1 {
			t.Fatalf("truncated length %d returned %d", length, got)
		}
	}
	for _, value := range []uint16{0, 9, 65535} {
		if jpegOrientation(orientationJPEG(binary.LittleEndian, value)) != 1 {
			t.Fatal("unsupported orientation applied")
		}
	}
	for _, index := range []int{4, 5, 12, 14, 16, 20, 22, 26} {
		broken := bytes.Clone(valid)
		broken[index] = 255
		if got := jpegOrientation(broken); got != 1 {
			t.Fatalf("corrupt field at %d returned %d", index, got)
		}
	}
}

func FuzzJPEGOrientation(f *testing.F) {
	f.Add(orientationJPEG(binary.LittleEndian, 6))
	f.Add([]byte{255, 216, 255, 225, 0, 2})
	f.Fuzz(func(t *testing.T, data []byte) {
		if got := jpegOrientation(data); got < 1 || got > 8 {
			t.Fatalf("invalid orientation %d", got)
		}
	})
}

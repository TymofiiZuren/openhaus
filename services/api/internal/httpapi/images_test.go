package httpapi

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"testing"
)

func TestSanitizeImage(t *testing.T) {
	var data bytes.Buffer
	png.Encode(&data, image.NewRGBA(image.Rect(0, 0, 4, 4)))
	clean, err := sanitizeImage(data.Bytes())
	if err != nil || len(clean.data) == 0 || clean.extension != ".png" {
		t.Fatalf("valid PNG rejected: %v", err)
	}
	for _, invalid := range [][]byte{[]byte("<svg onload='alert(1)'/>"), []byte("not an image"), data.Bytes()[:20]} {
		if _, err := sanitizeImage(invalid); err == nil {
			t.Fatal("invalid image accepted")
		}
	}
}

func TestSanitizeJPEGKeepsCompactFormatAndDropsMetadata(t *testing.T) {
	photo := image.NewRGBA(image.Rect(0, 0, 256, 256))
	for y := 0; y < 256; y++ {
		for x := 0; x < 256; x++ {
			photo.SetRGBA(x, y, color.RGBA{uint8(x), uint8(y), uint8(x ^ y), 255})
		}
	}
	var source bytes.Buffer
	if err := jpeg.Encode(&source, photo, &jpeg.Options{Quality: 95}); err != nil {
		t.Fatal(err)
	}
	// A JPEG comment must never survive the decode/re-encode boundary.
	comment := []byte("private-image-metadata")
	input := append([]byte{255, 216, 255, 254, 0, byte(len(comment) + 2)}, comment...)
	input = append(input, source.Bytes()[2:]...)
	clean, err := sanitizeImage(input)
	if err != nil {
		t.Fatal(err)
	}
	if clean.extension != ".jpg" || bytes.Contains(clean.data, comment) {
		t.Fatal("format or metadata boundary failed")
	}
	decoded, format, err := image.Decode(bytes.NewReader(clean.data))
	if err != nil || format != "jpeg" || decoded.Bounds().Dx() != 256 || decoded.Bounds().Dy() != 256 {
		t.Fatalf("invalid output: %s %v", format, err)
	}
	original, _, err := image.Decode(bytes.NewReader(input))
	if err != nil {
		t.Fatal(err)
	}
	var oldPNG bytes.Buffer
	if err := png.Encode(&oldPNG, original); err != nil {
		t.Fatal(err)
	}
	if len(clean.data) >= oldPNG.Len() {
		t.Fatalf("JPEG %d bytes was not smaller than previous PNG %d", len(clean.data), oldPNG.Len())
	}
	t.Logf("synthetic 256x256 fixture: JPEG %d bytes; previous PNG %d bytes", len(clean.data), oldPNG.Len())
}

func TestSanitizePNGPreservesTransparency(t *testing.T) {
	source := image.NewNRGBA(image.Rect(0, 0, 3, 3))
	source.SetNRGBA(1, 1, color.NRGBA{R: 180, G: 80, B: 40, A: 128})
	var input bytes.Buffer
	if err := png.Encode(&input, source); err != nil {
		t.Fatal(err)
	}
	clean, err := sanitizeImage(input.Bytes())
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := png.Decode(bytes.NewReader(clean.data))
	if err != nil {
		t.Fatal(err)
	}
	for y := 0; y < 3; y++ {
		for x := 0; x < 3; x++ {
			want := color.NRGBAModel.Convert(source.At(x, y))
			got := color.NRGBAModel.Convert(decoded.At(x, y))
			if got != want {
				t.Fatalf("pixel %d,%d: got %v want %v", x, y, got, want)
			}
		}
	}
}

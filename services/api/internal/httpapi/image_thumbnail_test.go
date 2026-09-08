package httpapi

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	"testing"
)

func TestThumbnailDimensionsAndNoUpscale(t *testing.T) {
	for _, tc := range []struct{ w, h, wantW, wantH int }{{960, 640, 480, 320}, {640, 960, 320, 480}, {1000, 1, 480, 1}, {32, 16, 32, 16}} {
		source := image.NewRGBA(image.Rect(10, 20, 10+tc.w, 20+tc.h))
		got := thumbnailImage(source)
		if got.Bounds().Dx() != tc.wantW || got.Bounds().Dy() != tc.wantH {
			t.Fatalf("%dx%d: %v", tc.w, tc.h, got.Bounds())
		}
		if tc.w <= 480 && tc.h <= 480 && got != source {
			t.Fatal("small image unnecessarily copied")
		}
	}
}

func TestThumbnailAveragesPremultipliedPixels(t *testing.T) {
	source := image.NewNRGBA(image.Rect(0, 0, 960, 1))
	for x := 0; x < 960; x++ {
		if x%2 == 0 {
			source.SetNRGBA(x, 0, color.NRGBA{R: 255, A: 255})
		} else {
			source.SetNRGBA(x, 0, color.NRGBA{B: 255, A: 0})
		}
	}
	got := thumbnailImage(source)
	r, g, b, a := got.At(0, 0).RGBA()
	if r != 32767 || a != 32767 || g != 0 || b != 0 {
		t.Fatalf("transparent colour leaked into average: %d %d %d %d", r, g, b, a)
	}
}

func TestSanitizationProducesSmallJPEGThumbnail(t *testing.T) {
	source := image.NewRGBA(image.Rect(0, 0, 960, 640))
	for y := 0; y < 640; y++ {
		for x := 0; x < 960; x++ {
			source.SetRGBA(x, y, color.RGBA{R: uint8(x), G: uint8(y), B: uint8(x ^ y), A: 255})
		}
	}
	var input bytes.Buffer
	if err := jpeg.Encode(&input, source, &jpeg.Options{Quality: 95}); err != nil {
		t.Fatal(err)
	}
	clean, err := sanitizeImage(input.Bytes())
	if err != nil {
		t.Fatal(err)
	}
	config, format, err := image.DecodeConfig(bytes.NewReader(clean.thumbnail))
	if err != nil || format != "jpeg" || config.Width != 480 || config.Height != 320 {
		t.Fatalf("invalid thumbnail: %v %s %v", config, format, err)
	}
	if len(clean.thumbnail) >= len(clean.data) {
		t.Fatal("fixture thumbnail is not smaller")
	}
	t.Logf("JPEG full=%d bytes, thumbnail=%d bytes", len(clean.data), len(clean.thumbnail))
}

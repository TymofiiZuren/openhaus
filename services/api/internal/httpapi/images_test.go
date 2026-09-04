package httpapi

import (
	"bytes"
	"image"
	"image/png"
	"testing"
)

func TestSanitizeImage(t *testing.T) {
	var data bytes.Buffer
	png.Encode(&data, image.NewRGBA(image.Rect(0, 0, 4, 4)))
	clean, err := sanitizeImage(data.Bytes())
	if err != nil || len(clean) == 0 {
		t.Fatalf("valid PNG rejected: %v", err)
	}
	for _, invalid := range [][]byte{[]byte("<svg onload='alert(1)'/>"), []byte("not an image"), data.Bytes()[:20]} {
		if _, err := sanitizeImage(invalid); err == nil {
			t.Fatal("invalid image accepted")
		}
	}
}

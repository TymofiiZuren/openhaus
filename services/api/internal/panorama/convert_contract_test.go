package panorama

import (
	"bytes"
	"context"
	"image"
	"image/png"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

// Exercise the subprocess boundary, not just the bounded writer in isolation.
func TestRejectMalformedNativeOutput(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("POSIX shell fixture")
	}
	var input bytes.Buffer
	if err := png.Encode(&input, image.NewRGBA(image.Rect(0, 0, 8, 4))); err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct{ name, output string }{
		{"wrong format", "printf 'P3\\n2 2\\n255\\n'; head -c 12 /dev/zero"},
		{"wrong dimensions", "printf 'P6\\n1 4\\n255\\n'; head -c 12 /dev/zero"},
		{"truncated pixels", "printf 'P6\\n2 2\\n255\\n'; head -c 11 /dev/zero"},
		{"extra pixels", "printf 'P6\\n2 2\\n255\\n'; head -c 13 /dev/zero"},
		{"process failure", "exit 1"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			processor := filepath.Join(t.TempDir(), "processor")
			if err := os.WriteFile(processor, []byte("#!/bin/sh\ncat >/dev/null\n"+tc.output+"\n"), 0700); err != nil {
				t.Fatal(err)
			}
			result, err := Convert(context.Background(), processor, input.Bytes(), "front", 2)
			if err == nil || len(result) != 0 {
				t.Fatalf("invalid native output produced an image: err=%v bytes=%d", err, len(result))
			}
		})
	}
}

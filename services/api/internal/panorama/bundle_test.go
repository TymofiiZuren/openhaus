package panorama

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"image"
	"image/jpeg"
	"os"
	"path/filepath"
	"testing"
)

func TestBundlePublication(t *testing.T) {
	var pixels bytes.Buffer
	if err := jpeg.Encode(&pixels, image.NewRGBA(image.Rect(0, 0, 16, 16)), nil); err != nil {
		t.Fatal(err)
	}
	output := filepath.Join(t.TempDir(), "tour")
	calls := 0
	convert := func(ctx context.Context, executable string, data []byte, face string, size int) ([]byte, error) {
		calls++
		if _, err := os.Stat(filepath.Join(output, "bundle")); !os.IsNotExist(err) {
			t.Fatal("published before all faces finished")
		}
		return pixels.Bytes(), nil
	}
	if err := writeBundle(context.Background(), "native", nil, output, 16, convert); err != nil {
		t.Fatal(err)
	}
	if calls != 6 {
		t.Fatal("not all faces generated")
	}
	manifest, err := os.ReadFile(filepath.Join(output, "bundle", "manifest.json"))
	if err != nil || len(manifest) == 0 {
		t.Fatal("missing manifest", err)
	}
	if err := writeBundle(context.Background(), "native", nil, output, 16, convert); err == nil {
		t.Fatal("existing destination overwritten")
	}
	if calls != 6 {
		t.Fatal("existing destination processed")
	}
}

func TestBundleInvalidImagesNeverPublish(t *testing.T) {
	for _, size := range []int{0, 8} {
		t.Run(fmt.Sprint(size), func(t *testing.T) {
			output := filepath.Join(t.TempDir(), "tour")
			var data bytes.Buffer
			if size > 0 {
				if err := jpeg.Encode(&data, image.NewRGBA(image.Rect(0, 0, size, size)), nil); err != nil {
					t.Fatal(err)
				}
			} else {
				data.WriteString("not JPEG")
			}
			err := writeBundle(context.Background(), "", nil, output, 16, func(context.Context, string, []byte, string, int) ([]byte, error) { return data.Bytes(), nil })
			if err == nil {
				t.Fatal("invalid images published")
			}
			if _, err := os.Stat(output); !os.IsNotExist(err) {
				t.Fatal("failed output remains", err)
			}
		})
	}
}

func TestBundleFailureDoesNotPublish(t *testing.T) {
	output := filepath.Join(t.TempDir(), "tour")
	calls := 0
	failure := errors.New("conversion failed")
	err := writeBundle(context.Background(), "native", nil, output, 16, func(context.Context, string, []byte, string, int) ([]byte, error) {
		calls++
		if calls == 3 {
			return nil, failure
		}
		return []byte("jpeg"), nil
	})
	if !errors.Is(err, failure) {
		t.Fatal(err)
	}
	if _, err := os.Stat(output); !os.IsNotExist(err) {
		t.Fatal("failed bundle left behind", err)
	}
}

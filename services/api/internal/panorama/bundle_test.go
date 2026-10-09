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
	"strings"
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

func TestBundleReportsCleanupFailureWithoutRemovingUnexpectedFiles(t *testing.T) {
	output := filepath.Join(t.TempDir(), "tour")
	failure := errors.New("conversion failed")
	err := writeBundle(context.Background(), "native", nil, output, 16, func(context.Context, string, []byte, string, int) ([]byte, error) {
		// Simulate another actor placing a file in the reserved directory.
		if err := os.WriteFile(filepath.Join(output, "keep.txt"), []byte("keep"), 0600); err != nil {
			t.Fatal(err)
		}
		return nil, failure
	})
	if !errors.Is(err, failure) || !strings.Contains(err.Error(), "clean up output directory") {
		t.Fatalf("expected conversion and cleanup failures, got %v", err)
	}
	data, readErr := os.ReadFile(filepath.Join(output, "keep.txt"))
	if readErr != nil || string(data) != "keep" {
		t.Fatal("unexpected file was removed", readErr)
	}
	entries, readErr := os.ReadDir(output)
	if readErr != nil || len(entries) != 1 {
		t.Fatal("private staging directory was not removed", readErr)
	}
}

func TestBundleCancellationCleansUpAndAllowsRetry(t *testing.T) {
	var pixels bytes.Buffer
	if err := jpeg.Encode(&pixels, image.NewRGBA(image.Rect(0, 0, 16, 16)), nil); err != nil {
		t.Fatal(err)
	}
	for stop := 1; stop <= 6; stop++ {
		t.Run(fmt.Sprint(stop), func(t *testing.T) {
			output := filepath.Join(t.TempDir(), "tour")
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			calls := 0
			err := writeBundle(ctx, "native", nil, output, 16, func(context.Context, string, []byte, string, int) ([]byte, error) {
				calls++
				if calls == stop {
					cancel()
				}
				return pixels.Bytes(), nil
			})
			if !errors.Is(err, context.Canceled) || calls != stop {
				t.Fatalf("cancellation: calls=%d, error=%v", calls, err)
			}
			if _, err := os.Stat(output); !os.IsNotExist(err) {
				t.Fatal("cancelled output remains", err)
			}
			if err := writeBundle(context.Background(), "native", nil, output, 16, func(context.Context, string, []byte, string, int) ([]byte, error) { return pixels.Bytes(), nil }); err != nil {
				t.Fatal("retry failed", err)
			}
			if err := VerifyBundle(filepath.Join(output, "bundle")); err != nil {
				t.Fatal("retry did not publish a valid bundle", err)
			}
		})
	}
}

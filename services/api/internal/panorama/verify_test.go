package panorama

import (
	"bytes"
	"context"
	"encoding/json"
	"image"
	"image/jpeg"
	"os"
	"path/filepath"
	"testing"
)

func testBundle(t *testing.T) string {
	t.Helper()
	var imageBytes bytes.Buffer
	if err := jpeg.Encode(&imageBytes, image.NewRGBA(image.Rect(0, 0, 16, 16)), nil); err != nil {
		t.Fatal(err)
	}
	output := filepath.Join(t.TempDir(), "tour")
	if err := writeBundle(context.Background(), "", nil, output, 16, func(context.Context, string, []byte, string, int) ([]byte, error) { return imageBytes.Bytes(), nil }); err != nil {
		t.Fatal(err)
	}
	return filepath.Join(output, "bundle")
}

func TestVerifyBundle(t *testing.T) {
	directory := testBundle(t)
	if err := VerifyBundle(directory); err != nil {
		t.Fatal(err)
	}
}

func TestVerifyRejectsInvalidManifestContract(t *testing.T) {
	for _, kind := range []string{"duplicate", "dimensions", "checksum", "version"} {
		t.Run(kind, func(t *testing.T) {
			directory := testBundle(t)
			filename := filepath.Join(directory, "manifest.json")
			data, err := os.ReadFile(filename)
			if err != nil {
				t.Fatal(err)
			}
			var manifest bundleManifest
			if err := json.Unmarshal(data, &manifest); err != nil {
				t.Fatal(err)
			}
			switch kind {
			case "duplicate":
				manifest.Faces[1] = manifest.Faces[0]
			case "dimensions":
				manifest.FaceSize = 32
			case "checksum":
				manifest.Faces[0].SHA256 = "wrong"
			case "version":
				manifest.Version = 2
			}
			data, err = json.Marshal(manifest)
			if err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(filename, data, 0600); err != nil {
				t.Fatal(err)
			}
			if err := VerifyBundle(directory); err == nil {
				t.Fatal("invalid manifest accepted")
			}
		})
	}
}

func TestVerifyRejectsCorruption(t *testing.T) {
	for _, kind := range []string{"missing", "corrupt", "manifest", "symlink"} {
		t.Run(kind, func(t *testing.T) {
			directory := testBundle(t)
			face := filepath.Join(directory, "front.jpg")
			switch kind {
			case "missing":
				if err := os.Remove(face); err != nil {
					t.Fatal(err)
				}
			case "corrupt":
				if err := os.WriteFile(face, []byte("broken"), 0600); err != nil {
					t.Fatal(err)
				}
			case "manifest":
				file := filepath.Join(directory, "manifest.json")
				data, err := os.ReadFile(file)
				if err != nil {
					t.Fatal(err)
				}
				data = bytes.Replace(data, []byte("front.jpg"), []byte("../front.jpg"), 1)
				if err := os.WriteFile(file, data, 0600); err != nil {
					t.Fatal(err)
				}
			case "symlink":
				if err := os.Remove(face); err != nil {
					t.Fatal(err)
				}
				if err := os.Symlink(filepath.Join(directory, "right.jpg"), face); err != nil {
					t.Fatal(err)
				}
			}
			if err := VerifyBundle(directory); err == nil {
				t.Fatal("invalid bundle accepted")
			}
		})
	}
}

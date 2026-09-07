package main

import (
	"encoding/json"
	"image"
	"image/color"
	"image/jpeg"
	"os"
	"path/filepath"
	"testing"
)

func TestAuditDetectsIdenticalImagesAndDoesNotOverwrite(t *testing.T) {
	root := t.TempDir()
	img := image.NewGray(image.Rect(0, 0, 90, 80))
	for y := 0; y < 80; y++ {
		for x := 0; x < 90; x++ {
			img.SetGray(x, y, color.Gray{Y: uint8(x * 2)})
		}
	}
	for _, name := range []string{"first.jpg", "second.jpg"} {
		f, err := os.Create(filepath.Join(root, name))
		if err != nil {
			t.Fatal(err)
		}
		if err := jpeg.Encode(f, img, nil); err != nil {
			t.Fatal(err)
		}
		if err := f.Close(); err != nil {
			t.Fatal(err)
		}
	}
	output := filepath.Join(root, "audit.json")
	if err := run(root, output); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(output)
	if err != nil {
		t.Fatal(err)
	}
	var report struct {
		Assets []asset `json:"assets"`
	}
	if err := json.Unmarshal(data, &report); err != nil {
		t.Fatal(err)
	}
	if len(report.Assets) != 2 || len(report.Assets[0].Candidates) != 1 || report.Assets[0].Candidates[0].Distance != 0 || report.Assets[0].SHA256 != report.Assets[1].SHA256 {
		t.Fatalf("unexpected report: %+v", report)
	}
	if err := run(root, output); !os.IsExist(err) {
		t.Fatalf("overwrite allowed: %v", err)
	}
}

func TestAuditRejectsInvalidImageWithoutWritingReport(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "bad.jpg"), []byte("not an image"), 0o600); err != nil {
		t.Fatal(err)
	}
	output := filepath.Join(root, "audit.json")
	if err := run(root, output); err == nil {
		t.Fatal("invalid image accepted")
	}
	if _, err := os.Stat(output); !os.IsNotExist(err) {
		t.Fatal("invalid report published")
	}
}

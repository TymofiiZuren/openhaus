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
		Assets  []asset `json:"assets"`
		Storage struct {
			TotalBytes     int64 `json:"totalBytes"`
			RedundantBytes int64 `json:"redundantBytes"`
			DuplicateFiles int   `json:"duplicateFiles"`
			Groups         []struct {
				Names []string `json:"names"`
			} `json:"exactDuplicateGroups"`
		} `json:"storage"`
	}
	if err := json.Unmarshal(data, &report); err != nil {
		t.Fatal(err)
	}
	if len(report.Assets) != 2 || len(report.Assets[0].Candidates) != 1 || report.Assets[0].Candidates[0].Distance != 0 || report.Assets[0].SHA256 != report.Assets[1].SHA256 {
		t.Fatalf("unexpected report: %+v", report)
	}
	if report.Storage.TotalBytes != report.Assets[0].Bytes*2 || report.Storage.RedundantBytes != report.Assets[0].Bytes || report.Storage.DuplicateFiles != 1 || len(report.Storage.Groups) != 1 {
		t.Fatalf("incorrect duplicate storage summary: %+v", report.Storage)
	}
	if names := report.Storage.Groups[0].Names; len(names) != 2 || names[0] != "first.jpg" || names[1] != "second.jpg" {
		t.Fatalf("duplicate names = %v", names)
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

func TestStorageSummarySeparatesVisualSimilarityFromFileIdentity(t *testing.T) {
	assets := []asset{
		{Name: "a.jpg", SHA256: "digest-a", Bytes: 100, Hash: "same-visual-hash"},
		{Name: "b.jpg", SHA256: "digest-b", Bytes: 200, Hash: "same-visual-hash"},
		{Name: "c.jpg", SHA256: "digest-a", Bytes: 100},
		{Name: "d.jpg", SHA256: "digest-a", Bytes: 100},
		{Name: "e.jpg", SHA256: "digest-b", Bytes: 200},
		{Name: "f.jpg", SHA256: "digest-a", Bytes: 150},
	}
	summary := summarizeStorage(assets)
	if summary.TotalBytes != 850 || summary.RedundantBytes != 400 || summary.DuplicateFiles != 3 || len(summary.ExactDuplicateGroups) != 2 {
		t.Fatalf("summary=%+v", summary)
	}
	if got := summary.ExactDuplicateGroups; got[0].SHA256 != "digest-a" || len(got[0].Names) != 3 || got[1].SHA256 != "digest-b" || len(got[1].Names) != 2 {
		t.Fatalf("groups=%+v", got)
	}
	unique := summarizeStorage(assets[:2])
	if unique.DuplicateFiles != 0 || unique.RedundantBytes != 0 || len(unique.ExactDuplicateGroups) != 0 {
		t.Fatal("visual similarity counted as duplicate bytes")
	}
	if summarizeStorage(nil).ExactDuplicateGroups == nil {
		t.Fatal("empty groups must serialize as an array")
	}
}

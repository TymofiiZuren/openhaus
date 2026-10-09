// media-audit produces a versioned similarity manifest from local JPEG/PNG files.
package main

import (
	"crypto/sha256"
	"encoding/json"
	"flag"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/TymofiiZuren/openhaus/services/api/internal/mediafingerprint"
)

type asset struct {
	Name       string      `json:"name"`
	Width      int         `json:"width"`
	Height     int         `json:"height"`
	Bytes      int64       `json:"bytes"`
	SHA256     string      `json:"sha256"`
	Hash       string      `json:"perceptualHash"`
	Candidates []candidate `json:"candidates"`
}
type candidate struct {
	Name     string `json:"name"`
	Distance int    `json:"distance"`
}

type duplicateGroup struct {
	SHA256       string   `json:"sha256"`
	BytesPerFile int64    `json:"bytesPerFile"`
	Names        []string `json:"names"`
}
type storageSummary struct {
	TotalBytes           int64            `json:"totalBytes"`
	RedundantBytes       int64            `json:"redundantBytes"`
	DuplicateFiles       int              `json:"duplicateFiles"`
	ExactDuplicateGroups []duplicateGroup `json:"exactDuplicateGroups"`
}

func summarizeStorage(assets []asset) storageSummary {
	summary := storageSummary{ExactDuplicateGroups: []duplicateGroup{}}
	// Keep input order (ReadDir is name-sorted), never map iteration order.
	type identity struct {
		digest string
		bytes  int64
	}
	positions := make(map[identity]int)
	var groups []duplicateGroup
	for _, a := range assets {
		summary.TotalBytes += a.Bytes
		key := identity{a.SHA256, a.Bytes}
		if index, found := positions[key]; found {
			groups[index].Names = append(groups[index].Names, a.Name)
			summary.DuplicateFiles++
			summary.RedundantBytes += a.Bytes
		} else {
			positions[key] = len(groups)
			groups = append(groups, duplicateGroup{SHA256: a.SHA256, BytesPerFile: a.Bytes, Names: []string{a.Name}})
		}
	}
	for _, group := range groups {
		if len(group.Names) > 1 {
			summary.ExactDuplicateGroups = append(summary.ExactDuplicateGroups, group)
		}
	}
	return summary
}

func main() {
	input := flag.String("input", "", "local image directory")
	output := flag.String("output", "", "new JSON manifest path (never overwrites)")
	flag.Parse()
	if err := run(*input, *output); err != nil {
		log.Fatal(err)
	}
}
func run(input, output string) error {
	if input == "" || output == "" {
		return fmt.Errorf("input and output are required")
	}
	entries, err := os.ReadDir(input)
	if err != nil {
		return err
	}
	var assets []asset
	var hashes []uint64
	var tree mediafingerprint.Tree
	for _, entry := range entries {
		ext := strings.ToLower(filepath.Ext(entry.Name()))
		if ext != ".jpg" && ext != ".jpeg" && ext != ".png" {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		if !info.Mode().IsRegular() {
			return fmt.Errorf("nonregular image rejected")
		}
		if info.Size() > 10<<20 {
			return fmt.Errorf("image exceeds 10 MiB")
		}
		if len(assets) >= 1000 {
			return fmt.Errorf("audit limited to 1000 images")
		}
		a, h, err := inspect(filepath.Join(input, entry.Name()))
		if err != nil {
			return fmt.Errorf("inspect %s: %w", entry.Name(), err)
		}
		tree.Add(len(assets), h)
		assets = append(assets, a)
		hashes = append(hashes, h)
	}
	if len(assets) == 0 {
		return fmt.Errorf("no images found")
	}
	for i, h := range hashes {
		for _, m := range tree.Search(h, 8) {
			if m.ID != i {
				assets[i].Candidates = append(assets[i].Candidates, candidate{Name: assets[m.ID].Name, Distance: m.Distance})
			}
		}
	}
	report := struct {
		Version     int            `json:"version"`
		Algorithm   string         `json:"algorithm"`
		Radius      int            `json:"radius"`
		Limitations string         `json:"limitations"`
		Assets      []asset        `json:"assets"`
		Storage     storageSummary `json:"storage"`
	}{1, "dhash-box-v1 + BK-tree", 8, "Similarity candidates only, not proof of duplication. Crops, flat images and similar rooms can mislead. Storage groups match SHA-256 and byte size; review before removing files. No automatic deletion.", assets, summarizeStorage(assets)}
	data, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		return err
	}
	file, err := os.OpenFile(output, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return err
	}
	_, writeErr := file.Write(data)
	closeErr := file.Close()
	if writeErr != nil {
		return writeErr
	}
	return closeErr
}
func inspect(path string) (asset, uint64, error) {
	f, err := os.Open(path)
	if err != nil {
		return asset{}, 0, err
	}
	defer f.Close()
	config, _, err := image.DecodeConfig(f)
	if err != nil {
		return asset{}, 0, err
	}
	if config.Width < 9 || config.Height < 8 || config.Width > 24_000_000/config.Height {
		return asset{}, 0, fmt.Errorf("invalid dimensions")
	}
	if _, err = f.Seek(0, io.SeekStart); err != nil {
		return asset{}, 0, err
	}
	img, _, err := image.Decode(f)
	if err != nil {
		return asset{}, 0, err
	}
	h, err := mediafingerprint.Hash(img)
	if err != nil {
		return asset{}, 0, err
	}
	if _, err = f.Seek(0, io.SeekStart); err != nil {
		return asset{}, 0, err
	}
	digest := sha256.New()
	size, err := io.Copy(digest, f)
	if err != nil {
		return asset{}, 0, err
	}
	return asset{Name: filepath.Base(path), Width: config.Width, Height: config.Height, Bytes: size, SHA256: fmt.Sprintf("%x", digest.Sum(nil)), Hash: fmt.Sprintf("%016x", h), Candidates: []candidate{}}, h, nil
}

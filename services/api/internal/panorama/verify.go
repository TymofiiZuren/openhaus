package panorama

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"image/jpeg"
	"io"
	"os"
	"path/filepath"
)

type bundleManifest struct {
	Version    int          `json:"version"`
	Projection string       `json:"projection"`
	FaceSize   int          `json:"faceSize"`
	Faces      []faceRecord `json:"faces"`
}

func readBundleFile(path string, limit int64) ([]byte, error) {
	info, err := os.Lstat(path)
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() || info.Size() > limit {
		return nil, errors.New("expected bounded regular file")
	}
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	opened, err := file.Stat()
	if err != nil {
		return nil, err
	}
	if !os.SameFile(info, opened) {
		return nil, errors.New("bundle changed during verification")
	}
	data, err := io.ReadAll(io.LimitReader(file, limit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > limit {
		return nil, errors.New("file exceeds limit")
	}
	return data, nil
}

// VerifyBundle checks a local, immutable bundle. The owner must prevent writes
// between verification and use; checksums detect corruption, not authenticity.
func VerifyBundle(directory string) error {
	data, err := readBundleFile(filepath.Join(directory, "manifest.json"), 16384)
	if err != nil {
		return fmt.Errorf("manifest: %w", err)
	}
	var manifest bundleManifest
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&manifest); err != nil {
		return fmt.Errorf("manifest: %w", err)
	}
	if decoder.Decode(new(any)) != io.EOF {
		return errors.New("trailing manifest data")
	}
	if manifest.Version != 1 || manifest.Projection != "cubemap-x-right-y-up-z-front" || manifest.FaceSize < 1 || manifest.FaceSize > 2048 || len(manifest.Faces) != 6 {
		return errors.New("unsupported manifest contract")
	}
	seen := map[string]bool{}
	for _, face := range manifest.Faces {
		switch face.Name {
		case "front", "right", "back", "left", "top", "bottom":
		default:
			return errors.New("unknown face")
		}
		if seen[face.Name] || face.File != face.Name+".jpg" || face.Bytes < 1 || face.Bytes > 32<<20 {
			return errors.New("invalid face record")
		}
		seen[face.Name] = true
		pixels, err := readBundleFile(filepath.Join(directory, face.File), int64(face.Bytes))
		if err != nil {
			return fmt.Errorf("%s: %w", face.Name, err)
		}
		digest := sha256.Sum256(pixels)
		if len(pixels) != face.Bytes || hex.EncodeToString(digest[:]) != face.SHA256 {
			return fmt.Errorf("%s: checksum or length mismatch", face.Name)
		}
		config, err := jpeg.DecodeConfig(bytes.NewReader(pixels))
		if err != nil || config.Width != manifest.FaceSize || config.Height != manifest.FaceSize {
			return fmt.Errorf("%s: invalid JPEG dimensions", face.Name)
		}
		if _, err := jpeg.Decode(bytes.NewReader(pixels)); err != nil {
			return fmt.Errorf("%s: invalid JPEG data", face.Name)
		}
	}
	return nil
}

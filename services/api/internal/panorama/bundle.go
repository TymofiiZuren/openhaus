package panorama

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

type faceRecord struct {
	Name   string `json:"name"`
	File   string `json:"file"`
	SHA256 string `json:"sha256"`
	Bytes  int    `json:"bytes"`
}

// WriteBundle reserves a new private output directory. Consumers read only its
// bundle/ child, which appears after every face and the manifest are complete.
// The caller must use a trusted local parent directory.
func WriteBundle(ctx context.Context, executable string, encoded []byte, output string, size int) error {
	var source *preparedSource
	return writeBundle(ctx, executable, encoded, output, size, func(ctx context.Context, executable string, encoded []byte, face string, size int) ([]byte, error) {
		if size < 1 || size > 2048 {
			return nil, errors.New("face size must be 1..2048")
		}
		if source == nil {
			// Reserve the output first, then decode the source once for six faces.
			var err error
			source, err = prepareSource(ctx, encoded)
			if err != nil {
				return nil, err
			}
		}
		return source.convert(ctx, executable, face, size)
	})
}

func writeBundle(ctx context.Context, executable string, encoded []byte, output string, size int,
	convert func(context.Context, string, []byte, string, int) ([]byte, error)) (result error) {
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := os.Mkdir(output, 0700); err != nil {
		return fmt.Errorf("reserve new output directory: %w", err)
	}
	published := false
	defer func() {
		if !published {
			if err := os.Remove(output); err != nil && !os.IsNotExist(err) {
				result = errors.Join(result, fmt.Errorf("clean up output directory: %w", err))
			}
		}
	}()
	staging, err := os.MkdirTemp(output, ".pending-")
	if err != nil {
		return err
	}
	defer func() {
		// Only this invocation's private staging directory, never the output root.
		if err := os.RemoveAll(staging); err != nil {
			result = errors.Join(result, fmt.Errorf("clean up staged bundle: %w", err))
		}
	}()
	manifest := bundleManifest{Version: 1, Projection: "cubemap-x-right-y-up-z-front", FaceSize: size}
	for _, face := range []string{"front", "right", "back", "left", "top", "bottom"} {
		if err := ctx.Err(); err != nil {
			return err
		}
		data, err := convert(ctx, executable, encoded, face, size)
		if err != nil {
			return fmt.Errorf("convert %s: %w", face, err)
		}
		filename := face + ".jpg"
		if err := os.WriteFile(filepath.Join(staging, filename), data, 0600); err != nil {
			return err
		}
		digest := sha256.Sum256(data)
		manifest.Faces = append(manifest.Faces, faceRecord{face, filename, hex.EncodeToString(digest[:]), len(data)})
	}
	data, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(staging, "manifest.json"), data, 0600); err != nil {
		return err
	}
	if err := VerifyBundle(staging); err != nil {
		return fmt.Errorf("verify staged bundle: %w", err)
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := os.Rename(staging, filepath.Join(output, "bundle")); err != nil {
		return err
	}
	published = true
	return nil
}

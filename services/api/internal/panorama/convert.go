// Package panorama bridges bounded JPEG/PNG images to the native cube projector.
// It does not publish files or alter listing records.
package panorama

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"image"
	"image/jpeg"
	_ "image/png"
	"os/exec"
	"strconv"
	"time"
)

type boundedOutput struct {
	bytes.Buffer
	limit int
}

func (b *boundedOutput) Write(p []byte) (int, error) {
	if len(p) > b.limit-b.Len() {
		return 0, errors.New("native output exceeds limit")
	}
	return b.Buffer.Write(p)
}

// Convert returns one JPEG cube face. executable must be an operator-configured
// native binary, never a request-supplied path. Calls must be concurrency-limited
// by the owning worker. Metadata is deliberately not copied into the output.
func Convert(ctx context.Context, executable string, encoded []byte, face string, size int) ([]byte, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if size < 1 || size > 2048 {
		return nil, errors.New("face size must be 1..2048")
	}
	switch face {
	case "front", "right", "back", "left", "top", "bottom":
	default:
		return nil, errors.New("invalid face")
	}
	if len(encoded) == 0 || len(encoded) > 32<<20 {
		return nil, errors.New("image must be between 1 byte and 32 MiB")
	}
	config, format, err := image.DecodeConfig(bytes.NewReader(encoded))
	if err != nil || (format != "jpeg" && format != "png") {
		return nil, errors.New("expected JPEG or PNG")
	}
	if config.Height < 1 || config.Height > 2048 || config.Width != config.Height*2 {
		return nil, errors.New("expected 2:1 panorama up to 4096x2048")
	}
	source, _, err := image.Decode(bytes.NewReader(encoded))
	if err != nil {
		return nil, errors.New("image decoding failed")
	}
	raw := make([]byte, config.Width*config.Height*3)
	for y := 0; y < config.Height; y++ {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		for x := 0; x < config.Width; x++ {
			r, g, b, _ := source.At(x, y).RGBA()
			// Premultiplied channels flatten transparent pixels onto black.
			offset := (y*config.Width + x) * 3
			raw[offset], raw[offset+1], raw[offset+2] = byte(r>>8), byte(g>>8), byte(b>>8)
		}
	}
	nativeCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	header := fmt.Sprintf("P6\n%d %d\n255\n", size, size)
	output := &boundedOutput{limit: len(header) + size*size*3}
	command := exec.CommandContext(nativeCtx, executable, strconv.Itoa(config.Width), strconv.Itoa(config.Height), face, strconv.Itoa(size))
	command.Stdin = bytes.NewReader(raw)
	command.Stdout = output
	command.WaitDelay = time.Second
	if err := command.Run(); err != nil {
		if nativeCtx.Err() != nil {
			return nil, nativeCtx.Err()
		}
		return nil, errors.New("native panorama conversion failed")
	}
	if output.Len() != output.limit || !bytes.HasPrefix(output.Bytes(), []byte(header)) {
		return nil, errors.New("invalid native image output")
	}
	pixels := output.Bytes()[len(header):]
	result := image.NewRGBA(image.Rect(0, 0, size, size))
	for i := 0; i < size*size; i++ {
		copy(result.Pix[i*4:i*4+3], pixels[i*3:i*3+3])
		result.Pix[i*4+3] = 255
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	var jpegOutput bytes.Buffer
	if err := jpeg.Encode(&jpegOutput, result, &jpeg.Options{Quality: 90}); err != nil {
		return nil, err
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	return jpegOutput.Bytes(), nil
}

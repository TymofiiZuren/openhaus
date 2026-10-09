package panorama

import (
	"bytes"
	"context"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestNativeConversion(t *testing.T) {
	compiler, err := exec.LookPath("clang++")
	if err != nil {
		t.Skip("clang++ required for native integration")
	}
	binary := filepath.Join(t.TempDir(), "panorama")
	command := exec.Command(compiler, "-std=c++17", "-O2", "../../../panorama/main.cpp", "-o", binary)
	if output, err := command.CombinedOutput(); err != nil {
		t.Fatalf("compile: %v: %s", err, output)
	}
	t.Run("directional bundle", func(t *testing.T) { testDirectionalBundle(t, binary) })
	input := image.NewNRGBA(image.Rect(0, 0, 8, 4))
	for y := 0; y < 4; y++ {
		for x := 0; x < 8; x++ {
			input.Set(x, y, color.NRGBA{R: 180, G: 70, B: 30, A: 255})
		}
	}
	for _, format := range []string{"png", "jpeg"} {
		var encoded bytes.Buffer
		if format == "png" {
			err = png.Encode(&encoded, input)
		} else {
			err = jpeg.Encode(&encoded, input, nil)
		}
		if err != nil {
			t.Fatal(err)
		}
		expected := make(map[string][]byte)
		for _, face := range []string{"front", "right", "back", "left", "top", "bottom"} {
			result, err := Convert(context.Background(), binary, encoded.Bytes(), face, 16)
			if err != nil {
				t.Fatal(err)
			}
			expected[face] = result
			decoded, err := jpeg.Decode(bytes.NewReader(result))
			if err != nil {
				t.Fatal(err)
			}
			if decoded.Bounds().Dx() != 16 || decoded.Bounds().Dy() != 16 {
				t.Fatal("wrong dimensions")
			}
			r, g, b, _ := decoded.At(8, 8).RGBA()
			if r>>8 < 170 || r>>8 > 190 || g>>8 < 60 || g>>8 > 80 || b>>8 < 20 || b>>8 > 40 {
				t.Fatal("colour not preserved")
			}
		}
		output := filepath.Join(t.TempDir(), "tour")
		if err := WriteBundle(context.Background(), binary, encoded.Bytes(), output, 16); err != nil {
			t.Fatal(err)
		}
		if err := VerifyBundle(filepath.Join(output, "bundle")); err != nil {
			t.Fatal(err)
		}
		for _, face := range []string{"front", "right", "back", "left", "top", "bottom"} {
			data, err := os.ReadFile(filepath.Join(output, "bundle", face+".jpg"))
			if err != nil {
				t.Fatal(err)
			}
			if !bytes.Equal(data, expected[face]) {
				t.Fatalf("%s %s: shared source changed face output", format, face)
			}
			if _, err := jpeg.Decode(bytes.NewReader(data)); err != nil {
				t.Fatal(err)
			}
		}
		ctx, cancel := context.WithCancel(context.Background())
		cancel()
		if _, err := Convert(ctx, binary, encoded.Bytes(), "front", 16); err == nil {
			t.Fatal("cancelled work accepted")
		}
	}
}

// Encode world direction as RGB so swapped faces or axis inversions cannot
// pass by preserving a uniform colour. This exercises both codecs and C++.
func testDirectionalBundle(t *testing.T, binary string) {
	t.Helper()
	input := image.NewNRGBA(image.Rect(0, 0, 128, 64))
	channel := func(value float64) uint8 { return uint8(math.Round((value + 1) * 127.5)) }
	for y := 0; y < 64; y++ {
		latitude := (.5 - (float64(y)+.5)/64) * math.Pi
		for x := 0; x < 128; x++ {
			longitude := ((float64(x)+.5)/128 - .5) * 2 * math.Pi
			input.SetNRGBA(x, y, color.NRGBA{
				R: channel(math.Sin(longitude) * math.Cos(latitude)),
				G: channel(math.Sin(latitude)),
				B: channel(math.Cos(longitude) * math.Cos(latitude)), A: 255,
			})
		}
	}
	for _, format := range []string{"png", "jpeg"} {
		t.Run(format, func(t *testing.T) {
			var encoded bytes.Buffer
			var err error
			if format == "png" {
				err = png.Encode(&encoded, input)
			} else {
				err = jpeg.Encode(&encoded, input, &jpeg.Options{Quality: 95})
			}
			if err != nil {
				t.Fatal(err)
			}
			output := filepath.Join(t.TempDir(), "tour")
			if err := WriteBundle(context.Background(), binary, encoded.Bytes(), output, 65); err != nil {
				t.Fatal(err)
			}
			for face, direction := range map[string][3]float64{
				"front": {0, 0, 1}, "right": {1, 0, 0}, "back": {0, 0, -1},
				"left": {-1, 0, 0}, "top": {0, 1, 0}, "bottom": {0, -1, 0},
			} {
				data, err := os.ReadFile(filepath.Join(output, "bundle", face+".jpg"))
				if err != nil {
					t.Fatal(err)
				}
				decoded, err := jpeg.Decode(bytes.NewReader(data))
				if err != nil {
					t.Fatal(err)
				}
				r, g, b, _ := decoded.At(32, 32).RGBA()
				for axis, actual := range []uint32{r >> 8, g >> 8, b >> 8} {
					// Allow JPEG loss and finite source resolution at the poles.
					if math.Abs(float64(actual)-float64(channel(direction[axis]))) > 10 {
						t.Errorf("%s axis %d: got %d, want near %d", face, axis, actual, channel(direction[axis]))
					}
				}
			}
		})
	}
}

func TestPreparedSourceFlattensTransparency(t *testing.T) {
	input := image.NewNRGBA(image.Rect(0, 0, 2, 1))
	input.SetNRGBA(0, 0, color.NRGBA{R: 255, G: 128, B: 64, A: 0})
	input.SetNRGBA(1, 0, color.NRGBA{R: 255, G: 128, B: 64, A: 128})
	var encoded bytes.Buffer
	if err := png.Encode(&encoded, input); err != nil {
		t.Fatal(err)
	}
	source, err := prepareSource(context.Background(), encoded.Bytes())
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(source.raw, []byte{0, 0, 0, 128, 64, 32}) {
		t.Fatalf("transparency not flattened onto black: %v", source.raw)
	}
}

func TestRejectInvalidInput(t *testing.T) {
	var input bytes.Buffer
	if err := png.Encode(&input, image.NewNRGBA(image.Rect(0, 0, 4, 4))); err != nil {
		t.Fatal(err)
	}
	for _, data := range [][]byte{[]byte("not an image"), input.Bytes()} {
		if _, err := Convert(context.Background(), "/missing", data, "front", 16); err == nil {
			t.Fatal("invalid image accepted")
		}
	}
	if _, err := Convert(context.Background(), "/missing", nil, "front", 2049); err == nil {
		t.Fatal("size accepted")
	}
}

func TestOutputLimit(t *testing.T) {
	output := &boundedOutput{limit: 3}
	if _, err := output.Write([]byte{1, 2}); err != nil {
		t.Fatal(err)
	}
	if _, err := output.Write([]byte{3, 4}); err == nil {
		t.Fatal("overflow accepted")
	}
	if output.Len() != 2 {
		t.Fatal("overflow retained partial bytes")
	}
	if _, err := output.Write([]byte{3}); err != nil {
		t.Fatal(err)
	}
}

func TestPreparedSourcePreservesPixelsAndCancellation(t *testing.T) {
	input := image.NewNRGBA(image.Rect(0, 0, 8, 4))
	for y := 0; y < 4; y++ {
		for x := 0; x < 8; x++ {
			input.SetNRGBA(x, y, color.NRGBA{R: uint8(x * 20), G: uint8(y * 40), B: 90, A: 255})
		}
	}
	var encoded bytes.Buffer
	if err := png.Encode(&encoded, input); err != nil {
		t.Fatal(err)
	}
	source, err := prepareSource(context.Background(), encoded.Bytes())
	if err != nil {
		t.Fatal(err)
	}
	if source.width != 8 || source.height != 4 || len(source.raw) != 8*4*3 {
		t.Fatal("unexpected prepared dimensions")
	}
	for y := 0; y < 4; y++ {
		for x := 0; x < 8; x++ {
			offset := (y*8 + x) * 3
			if !bytes.Equal(source.raw[offset:offset+3], []byte{uint8(x * 20), uint8(y * 40), 90}) {
				t.Fatal("source pixels changed")
			}
		}
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := prepareSource(ctx, encoded.Bytes()); err != context.Canceled {
		t.Fatalf("prepare cancellation: %v", err)
	}
	if _, err := source.convert(ctx, "/missing", "front", 16); err != context.Canceled {
		t.Fatalf("projection cancellation: %v", err)
	}
	if _, err := source.convert(context.Background(), "/missing", "front", 2049); err == nil {
		t.Fatal("oversized face accepted")
	}
	if _, err := source.convert(context.Background(), "/missing", "unknown", 16); err == nil {
		t.Fatal("unknown face accepted")
	}
}

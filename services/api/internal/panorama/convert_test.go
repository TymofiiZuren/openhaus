package panorama

import (
	"bytes"
	"context"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
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
		for _, face := range []string{"front", "right", "back", "left", "top", "bottom"} {
			result, err := Convert(context.Background(), binary, encoded.Bytes(), face, 16)
			if err != nil {
				t.Fatal(err)
			}
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

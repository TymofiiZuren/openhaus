package main

import (
	"bytes"
	"image"
	"image/png"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestCommandEndToEnd(t *testing.T) {
	compiler, err := exec.LookPath("clang++")
	if err != nil {
		t.Skip("native compiler required")
	}
	directory := t.TempDir()
	native := filepath.Join(directory, "native")
	cli := filepath.Join(directory, "panorama")
	for _, command := range []*exec.Cmd{
		exec.Command(compiler, "-std=c++17", "-O2", "../../../panorama/main.cpp", "-o", native),
		exec.Command("go", "build", "-o", cli, "."),
	} {
		if output, err := command.CombinedOutput(); err != nil {
			t.Fatalf("build: %v: %s", err, output)
		}
	}
	var encoded bytes.Buffer
	if err := png.Encode(&encoded, image.NewRGBA(image.Rect(0, 0, 8, 4))); err != nil {
		t.Fatal(err)
	}
	input := filepath.Join(directory, "source.png")
	if err := os.WriteFile(input, encoded.Bytes(), 0600); err != nil {
		t.Fatal(err)
	}
	output := filepath.Join(directory, "tour")
	args := []string{"-input", input, "-output", output, "-native", native, "-size", "16"}
	message, err := exec.Command(cli, args...).CombinedOutput()
	if err != nil || !strings.Contains(string(message), "bundle ready") {
		t.Fatalf("convert: %v: %s", err, message)
	}
	manifest := filepath.Join(output, "bundle", "manifest.json")
	before, err := os.ReadFile(manifest)
	if err != nil {
		t.Fatal(err)
	}
	if message, err := exec.Command(cli, args...).CombinedOutput(); err == nil {
		t.Fatalf("overwrite accepted: %s", message)
	}
	after, err := os.ReadFile(manifest)
	if err != nil || !bytes.Equal(before, after) {
		t.Fatal("existing manifest changed")
	}
	message, err = exec.Command(cli, "-verify", filepath.Join(output, "bundle")).CombinedOutput()
	if err != nil || !strings.Contains(string(message), "bundle verified") {
		t.Fatalf("verify: %v: %s", err, message)
	}
	if err := os.WriteFile(filepath.Join(output, "bundle", "front.jpg"), []byte("corrupt"), 0600); err != nil {
		t.Fatal(err)
	}
	if message, err := exec.Command(cli, "-verify", filepath.Join(output, "bundle")).CombinedOutput(); err == nil {
		t.Fatalf("corruption accepted: %s", message)
	}
}

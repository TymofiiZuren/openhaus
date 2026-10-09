package main

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestCheckEncoderRejectsMissingAndBrokenExecutable(t *testing.T) {
	root := t.TempDir()
	broken := filepath.Join(root, "broken")
	if err := os.WriteFile(broken, []byte("#!/bin/sh\necho private-diagnostic >&2\nexit 1\n"), 0o700); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{filepath.Join(root, "missing"), broken} {
		_, err := checkEncoder(context.Background(), path)
		if err == nil {
			t.Fatal("unusable encoder passed preflight")
		}
		if strings.Contains(err.Error(), "private-diagnostic") || strings.Contains(err.Error(), root) {
			t.Fatal("preflight leaked private diagnostics")
		}
	}
}

func TestCheckEncoderHonoursCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := checkEncoder(ctx, "unused")
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("error = %v", err)
	}
}

func TestCheckEncoderStopsAHungProbe(t *testing.T) {
	path := filepath.Join(t.TempDir(), "waiting-encoder")
	if err := os.WriteFile(path, []byte("#!/bin/sh\nexec sleep 30\n"), 0o700); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	start := time.Now()
	if _, err := checkEncoder(ctx, path); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("error = %v", err)
	}
	if time.Since(start) > 3*time.Second {
		t.Fatal("encoder probe did not stop promptly")
	}
}

func TestCheckOutputDirectory(t *testing.T) {
	root := t.TempDir()
	if err := checkOutputDirectory(root); err != nil {
		t.Fatal(err)
	}
	entries, err := os.ReadDir(root)
	if err != nil || len(entries) != 0 {
		t.Fatal("preflight left output artifacts")
	}
	file := filepath.Join(root, "not-a-directory")
	if err := os.WriteFile(file, []byte("keep"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := checkOutputDirectory(file); err == nil {
		t.Fatal("file accepted as output directory")
	}
	if data, err := os.ReadFile(file); err != nil || string(data) != "keep" {
		t.Fatal("preflight changed existing file")
	}
}

func TestCheckRealEncoder(t *testing.T) {
	if os.Getenv("MEDIA_TEST_FFMPEG") != "1" {
		t.Skip("set MEDIA_TEST_FFMPEG=1 for encoder preflight")
	}
	if _, err := checkEncoder(context.Background(), "ffmpeg"); err != nil {
		t.Fatal(err)
	}
}

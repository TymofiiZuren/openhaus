package mediajob_test

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"testing"

	"github.com/TymofiiZuren/openhaus/services/api/internal/mediajob"
)

type cancellingUploadReader struct {
	reader          *bytes.Reader
	cancel          context.CancelFunc
	reads, cancelAt int
}

func (reader *cancellingUploadReader) Read(p []byte) (int, error) {
	reader.reads++
	n, err := reader.reader.Read(p)
	if reader.reads == reader.cancelAt {
		reader.cancel()
	}
	return n, err
}

func TestAcceptUploadCancellationDoesNotQueueOrRetainMedia(t *testing.T) {
	for _, cancelAt := range []int{0, 1, 2, 3} {
		t.Run(fmt.Sprintf("read-%d", cancelAt), func(t *testing.T) {
			root := t.TempDir()
			creator := &creatorStub{}
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			payload := append([]byte("\x00\x00\x00\x18ftypqt  "), bytes.Repeat([]byte("video"), 200)...)
			reader := &cancellingUploadReader{reader: bytes.NewReader(payload), cancel: cancel, cancelAt: cancelAt}
			if cancelAt == 0 {
				cancel()
			}
			_, err := mediajob.NewUploadService(root, creator).AcceptUpload(ctx, "property-1", "tour.mov", reader)
			if !errors.Is(err, context.Canceled) {
				t.Fatalf("error = %v, want cancellation", err)
			}
			if creator.job.ID != "" {
				t.Fatal("cancelled upload created a job")
			}
			entries, err := os.ReadDir(root)
			if err != nil {
				t.Fatal(err)
			}
			if len(entries) != 0 {
				t.Fatalf("retained %d files", len(entries))
			}
			if reader.reads != cancelAt {
				t.Fatalf("read %d times, cancellation at %d", reader.reads, cancelAt)
			}
		})
	}
}

type creatorStub struct {
	job mediajob.Job
	err error
}

func (stub *creatorStub) Create(_ context.Context, job mediajob.Job) error {
	stub.job = job
	return stub.err
}

func TestAcceptUploadStreamsVideoToDiskAndCreatesPendingJob(t *testing.T) {
	root := t.TempDir()
	creator := &creatorStub{}
	service := mediajob.NewUploadService(root, creator)
	payload := append([]byte("\x00\x00\x00\x18ftypqt  "), bytes.Repeat([]byte("video"), 100)...)

	job, err := service.AcceptUpload(context.Background(), "property-1", "tour.mov", bytes.NewReader(payload))
	if err != nil {
		t.Fatalf("accept upload: %v", err)
	}
	if job.Status != mediajob.StatusPending {
		t.Fatalf("status = %q, want %q", job.Status, mediajob.StatusPending)
	}
	if creator.job.ID != job.ID || creator.job.PropertyID != "property-1" {
		t.Fatalf("created job = %#v, want returned job for property-1", creator.job)
	}
	stored, err := os.ReadFile(job.SourcePath)
	if err != nil {
		t.Fatalf("read stored video: %v", err)
	}
	if !bytes.Equal(stored, payload) {
		t.Fatal("stored video does not match upload")
	}
	if filepath.Dir(job.SourcePath) != root {
		t.Fatalf("source directory = %q, want %q", filepath.Dir(job.SourcePath), root)
	}
}

func TestAcceptUploadRejectsNonVideo(t *testing.T) {
	service := mediajob.NewUploadService(t.TempDir(), &creatorStub{})

	_, err := service.AcceptUpload(context.Background(), "property-1", "notes.txt", bytes.NewBufferString("not a video"))
	if !errors.Is(err, mediajob.ErrUnsupportedMedia) {
		t.Fatalf("error = %v, want ErrUnsupportedMedia", err)
	}
}

func TestAcceptUploadRejectsEmptyAndTruncatedHeadersWithoutQueueing(t *testing.T) {
	for _, payload := range [][]byte{nil, []byte("ftyp"), []byte("\x00\x00\x00\x18ftyp")} {
		root := t.TempDir()
		creator := &creatorStub{}
		_, err := mediajob.NewUploadService(root, creator).AcceptUpload(context.Background(), "property-1", "tour.mp4", bytes.NewReader(payload))
		if !errors.Is(err, mediajob.ErrUnsupportedMedia) {
			t.Fatalf("error = %v; want unsupported media", err)
		}
		if creator.job.ID != "" {
			t.Fatal("invalid upload created a job")
		}
		entries, err := os.ReadDir(root)
		if err != nil {
			t.Fatal(err)
		}
		if len(entries) != 0 {
			t.Fatal("invalid upload retained files")
		}
	}
}

type brokenUploadReader struct{ err error }

func (reader brokenUploadReader) Read([]byte) (int, error) { return 0, reader.err }

func TestAcceptUploadPreservesReadFailureAndRemovesPartialFile(t *testing.T) {
	for _, bodyFailure := range []bool{false, true} {
		root := t.TempDir()
		creator := &creatorStub{}
		failure := errors.New("transport interrupted")
		var source io.Reader = brokenUploadReader{failure}
		if bodyFailure {
			header := make([]byte, 512)
			copy(header, []byte("\x00\x00\x00\x18ftypqt  "))
			source = io.MultiReader(bytes.NewReader(header), source)
		}
		_, err := mediajob.NewUploadService(root, creator).AcceptUpload(context.Background(), "property-1", "tour.mov", source)
		if !errors.Is(err, failure) {
			t.Fatalf("error = %v; want original read failure", err)
		}
		if errors.Is(err, mediajob.ErrUnsupportedMedia) {
			t.Fatal("transport failure misreported as invalid media")
		}
		if creator.job.ID != "" {
			t.Fatal("interrupted upload created a job")
		}
		entries, err := os.ReadDir(root)
		if err != nil {
			t.Fatal(err)
		}
		if len(entries) != 0 {
			t.Fatal("interrupted upload retained files")
		}
	}
}

func TestAcceptUploadRemovesFileWhenJobCreationFails(t *testing.T) {
	root := t.TempDir()
	service := mediajob.NewUploadService(root, &creatorStub{err: errors.New("database unavailable")})
	payload := []byte("\x00\x00\x00\x18ftypisomvideo")

	_, err := service.AcceptUpload(context.Background(), "property-1", "tour.mp4", bytes.NewReader(payload))
	if err == nil {
		t.Fatal("accept upload succeeded, want error")
	}
	entries, readErr := os.ReadDir(root)
	if readErr != nil {
		t.Fatalf("read upload directory: %v", readErr)
	}
	if len(entries) != 0 {
		t.Fatalf("upload directory contains %d files, want none", len(entries))
	}
}

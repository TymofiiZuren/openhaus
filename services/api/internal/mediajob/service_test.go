package mediajob_test

import (
	"bytes"
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/TymofiiZuren/openhaus/services/api/internal/mediajob"
)

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

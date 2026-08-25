package mediajob_test

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/TymofiiZuren/openhaus/services/api/internal/mediajob"
)

type queueStub struct {
	job            mediajob.Job
	claimErr       error
	completedJobID string
	completedURL   string
	failedJobID    string
	failureMessage string
}

func (stub *queueStub) ClaimNext(context.Context) (mediajob.Job, error) {
	return stub.job, stub.claimErr
}
func (stub *queueStub) Complete(_ context.Context, jobID, outputURL, _ string) error {
	stub.completedJobID, stub.completedURL = jobID, outputURL
	return nil
}
func (stub *queueStub) Fail(_ context.Context, jobID, message string) error {
	stub.failedJobID, stub.failureMessage = jobID, message
	return nil
}

func TestProcessorPublishesCompletedVideoAndRemovesSource(t *testing.T) {
	root := t.TempDir()
	source := filepath.Join(root, "source.mov")
	if err := os.WriteFile(source, []byte("source"), 0o600); err != nil {
		t.Fatal(err)
	}
	ffmpeg := writeExecutable(t, root, "ffmpeg-ok", "#!/bin/sh\nfor last; do :; done\nprintf processed > \"$last\"\n")
	queue := &queueStub{job: mediajob.Job{ID: "job-1", SourcePath: source}}
	processor := mediajob.NewProcessor(queue, ffmpeg, filepath.Join(root, "output"), "/media/uploads")

	if err := processor.ProcessNext(context.Background()); err != nil {
		t.Fatalf("process next: %v", err)
	}
	if queue.completedJobID != "job-1" || queue.completedURL != "/media/uploads/job-1.mp4" {
		t.Fatalf("completion = %q %q", queue.completedJobID, queue.completedURL)
	}
	if _, err := os.Stat(source); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("source still exists: %v", err)
	}
}

func TestProcessorRecordsSanitizedFailure(t *testing.T) {
	root := t.TempDir()
	ffmpeg := writeExecutable(t, root, "ffmpeg-fail", "#!/bin/sh\necho sensitive-path >&2\nexit 1\n")
	queue := &queueStub{job: mediajob.Job{ID: "job-2", SourcePath: filepath.Join(root, "source.mov")}}
	processor := mediajob.NewProcessor(queue, ffmpeg, filepath.Join(root, "output"), "/media/uploads")

	err := processor.ProcessNext(context.Background())
	if err == nil {
		t.Fatal("process succeeded, want failure")
	}
	if queue.failedJobID != "job-2" || queue.failureMessage != "video processing failed" {
		t.Fatalf("recorded failure = %q %q", queue.failedJobID, queue.failureMessage)
	}
}

func writeExecutable(t *testing.T, root, name, contents string) string {
	t.Helper()
	path := filepath.Join(root, name)
	if err := os.WriteFile(path, []byte(contents), 0o700); err != nil {
		t.Fatal(err)
	}
	return path
}

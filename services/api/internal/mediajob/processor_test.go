package mediajob_test

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/TymofiiZuren/openhaus/services/api/internal/mediajob"
)

type queueStub struct {
	job            mediajob.Job
	claimErr       error
	completedJobID string
	completedURL   string
	failedJobID    string
	failureMessage string
	completeErr    error
}

// Opt in with a local fixture; copies it before the worker consumes the upload.
func TestProcessorRealFFmpeg(t *testing.T) {
	fixture := os.Getenv("MEDIA_TEST_VIDEO")
	if fixture == "" {
		t.Skip("set MEDIA_TEST_VIDEO to run real encoder validation")
	}
	ffmpeg, err := exec.LookPath("ffmpeg")
	if err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(fixture)
	if err != nil {
		t.Fatal(err)
	}
	root := t.TempDir()
	source := filepath.Join(root, "source.mp4")
	if err := os.WriteFile(source, data, 0o600); err != nil {
		t.Fatal(err)
	}
	queue := &queueStub{job: mediajob.Job{ID: "real", SourcePath: source}}
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	if err := mediajob.NewProcessor(queue, ffmpeg, root, "/media").ProcessNext(ctx); err != nil {
		t.Fatal(err)
	}
	if queue.completedURL != "/media/real.mp4" {
		t.Fatalf("completion = %q", queue.completedURL)
	}
	// Decode the whole published output, not merely its container header.
	if output, err := exec.CommandContext(ctx, ffmpeg, "-v", "error", "-xerror", "-i", filepath.Join(root, "real.mp4"), "-f", "null", "-").CombinedOutput(); err != nil || len(output) != 0 {
		t.Fatalf("decode failed: %v (diagnostic bytes: %d)", err, len(output))
	}
}

func (stub *queueStub) ClaimNext(context.Context) (mediajob.Job, error) {
	return stub.job, stub.claimErr
}
func (stub *queueStub) Complete(_ context.Context, jobID, outputURL, _ string) error {
	if stub.completeErr != nil {
		return stub.completeErr
	}
	stub.completedJobID, stub.completedURL = jobID, outputURL
	return nil
}
func (stub *queueStub) Fail(ctx context.Context, jobID, message string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	stub.failedJobID, stub.failureMessage = jobID, message
	return nil
}

func TestProcessorDoesNotExposePartialVideo(t *testing.T) {
	root := t.TempDir()
	output := filepath.Join(root, "output")
	ffmpeg := writeExecutable(t, root, "atomic", "#!/bin/sh\nfor last; do :; done\nprintf partial > \"$last\"\nif [ -e \""+filepath.Join(output, "job.mp4")+"\" ]; then exit 1; fi\nprintf complete > \"$last\"\n")
	queue := &queueStub{job: mediajob.Job{ID: "job"}}
	if err := mediajob.NewProcessor(queue, ffmpeg, output, "/media").ProcessNext(context.Background()); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(filepath.Join(output, "job.mp4"))
	if err != nil || string(data) != "complete" {
		t.Fatalf("published = %q, %v", data, err)
	}
}

func TestProcessorRejectsEmptyEncoderOutput(t *testing.T) {
	root := t.TempDir()
	ffmpeg := writeExecutable(t, root, "empty", "#!/bin/sh\nexit 0\n")
	queue := &queueStub{job: mediajob.Job{ID: "job"}}
	if err := mediajob.NewProcessor(queue, ffmpeg, filepath.Join(root, "output"), "/media").ProcessNext(context.Background()); err == nil {
		t.Fatal("empty video accepted")
	}
	if queue.completedJobID != "" || queue.failedJobID != "job" {
		t.Fatalf("queue = %+v", queue)
	}
}

func TestProcessorRecordsCancellationAndCleansPartialOutput(t *testing.T) {
	root := t.TempDir()
	ffmpeg := writeExecutable(t, root, "wait", "#!/bin/sh\nfor last; do :; done\nprintf partial > \"$last\"\nexec sleep 30\n")
	queue := &queueStub{job: mediajob.Job{ID: "job"}}
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	output := filepath.Join(root, "output")
	err := mediajob.NewProcessor(queue, ffmpeg, output, "/media").ProcessNext(ctx)
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("error = %v", err)
	}
	if queue.failedJobID != "job" || queue.completedJobID != "" {
		t.Fatalf("queue = %+v", queue)
	}
	entries, err := os.ReadDir(output)
	if err != nil || len(entries) != 0 {
		t.Fatalf("partial artifacts = %v, %v", entries, err)
	}
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
	if strings.Contains(err.Error(), "sensitive-path") {
		t.Fatal("encoder diagnostics leaked")
	}
	if queue.failedJobID != "job-2" || queue.failureMessage != "video processing failed" {
		t.Fatalf("recorded failure = %q %q", queue.failedJobID, queue.failureMessage)
	}
}

func TestProcessorRetainsArtifactsWhenCompletionIsUncertain(t *testing.T) {
	root := t.TempDir()
	source := filepath.Join(root, "source.mp4")
	if err := os.WriteFile(source, []byte("original"), 0o600); err != nil {
		t.Fatal(err)
	}
	ffmpeg := writeExecutable(t, root, "encode", "#!/bin/sh\nfor last; do :; done\nprintf encoded > \"$last\"\n")
	databaseErr := errors.New("completion unavailable")
	queue := &queueStub{job: mediajob.Job{ID: "job", SourcePath: source}, completeErr: databaseErr}
	err := mediajob.NewProcessor(queue, ffmpeg, root, "/media").ProcessNext(context.Background())
	if !errors.Is(err, databaseErr) || queue.failedJobID != "" {
		t.Fatalf("uncertain commit overwritten: %v", err)
	}
	for _, path := range []string{source, filepath.Join(root, "job.mp4")} {
		if _, err := os.Stat(path); err != nil {
			t.Fatalf("recovery artifact missing: %v", err)
		}
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

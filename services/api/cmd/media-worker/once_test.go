package main

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/TymofiiZuren/openhaus/services/api/internal/mediajob"
)

type singleJobQueue struct {
	job                       mediajob.Job
	claimErr                  error
	completeErr               error
	claims, completed, failed int
}

func (q *singleJobQueue) ClaimNext(context.Context) (mediajob.Job, error) {
	q.claims++
	return q.job, q.claimErr
}
func (q *singleJobQueue) Complete(context.Context, string, int16, string, string) error {
	q.completed++
	return q.completeErr
}
func (q *singleJobQueue) Fail(context.Context, string, int16, string) error {
	q.failed++
	return nil
}

func TestProcessOnce(t *testing.T) {
	unavailable := errors.New("queue unavailable")
	for _, tc := range []struct {
		name              string
		claimErr          error
		completeErr       error
		encoder           string
		wantErr           bool
		completed, failed int
	}{
		{name: "empty", claimErr: mediajob.ErrNotFound},
		{name: "queue failure", claimErr: unavailable, wantErr: true},
		{name: "one success", encoder: "#!/bin/sh\nfor last; do :; done\nprintf video > \"$last\"\n", completed: 1},
		{name: "encoding failure", encoder: "#!/bin/sh\nexit 1\n", wantErr: true, failed: 1},
		{name: "missing job during completion", encoder: "#!/bin/sh\nfor last; do :; done\nprintf video > \"$last\"\n", completeErr: mediajob.ErrNotFound, wantErr: true, completed: 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			root := t.TempDir()
			source := filepath.Join(root, "source.mov")
			if err := os.WriteFile(source, []byte("original"), 0o600); err != nil {
				t.Fatal(err)
			}
			encoder := filepath.Join(root, "encoder")
			if err := os.WriteFile(encoder, []byte(tc.encoder), 0o700); err != nil {
				t.Fatal(err)
			}
			queue := &singleJobQueue{job: mediajob.Job{ID: "job", Attempts: 1, SourcePath: source}, claimErr: tc.claimErr, completeErr: tc.completeErr}
			processor := mediajob.NewProcessor(queue, encoder, filepath.Join(root, "output"), "/media")
			err := processOnce(context.Background(), processor)
			if (err != nil) != tc.wantErr {
				t.Fatalf("error=%v, wantErr=%v", err, tc.wantErr)
			}
			if tc.claimErr == unavailable && !errors.Is(err, unavailable) {
				t.Fatal("queue failure hidden")
			}
			if queue.claims != 1 || queue.completed != tc.completed || queue.failed != tc.failed {
				t.Fatalf("claims=%d completed=%d failed=%d", queue.claims, queue.completed, queue.failed)
			}
		})
	}
}

func TestProcessOncePreservesCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	queue := &singleJobQueue{}
	processor := mediajob.NewProcessor(queue, "unused", t.TempDir(), "/media")
	if err := processOnce(ctx, processor); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancellation hidden: %v", err)
	}
	if queue.claims != 0 {
		t.Fatal("claimed after cancellation")
	}
}

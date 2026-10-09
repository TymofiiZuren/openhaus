package mediajob_test

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"testing"
	"testing/synctest"
	"time"

	"github.com/TymofiiZuren/openhaus/services/api/internal/mediajob"
)

type drainingQueue struct {
	claims              int
	completed           []string
	cancel              context.CancelFunc
	stopAfterCompletion bool
}

func (q *drainingQueue) ClaimNext(context.Context) (mediajob.Job, error) {
	q.claims++
	if q.claims > 2 {
		q.cancel()
		return mediajob.Job{}, mediajob.ErrNotFound
	}
	return mediajob.Job{ID: fmt.Sprintf("job-%d", q.claims), Attempts: 1}, nil
}
func (q *drainingQueue) Complete(_ context.Context, id string, _ int16, _, _ string) error {
	q.completed = append(q.completed, id)
	if q.stopAfterCompletion {
		q.cancel()
	}
	return nil
}
func (*drainingQueue) Fail(context.Context, string, int16, string) error {
	return errors.New("unexpected encoding failure")
}

func TestRunnerDrainsSuccessfulJobsWithoutPollingDelay(t *testing.T) {
	for _, stopAfterCompletion := range []bool{false, true} {
		t.Run(fmt.Sprintf("shutdownAfterCompletion=%t", stopAfterCompletion), func(t *testing.T) {
			root := t.TempDir()
			encoder := writeExecutable(t, root, "encoder", "#!/bin/sh\nfor last; do :; done\nprintf video > \"$last\"\n")
			// Less than the idle polling interval: queued work must progress without
			// sleeping for that interval after each successful encode.
			ctx, cancel := context.WithTimeout(context.Background(), 750*time.Millisecond)
			defer cancel()
			queue := &drainingQueue{cancel: cancel, stopAfterCompletion: stopAfterCompletion}
			if err := mediajob.NewProcessor(queue, encoder, filepath.Join(root, "output"), "/media").Run(ctx); err != nil {
				t.Fatal(err)
			}
			wantClaims, wantCompleted := 3, 2
			if stopAfterCompletion {
				wantClaims, wantCompleted = 1, 1
			}
			if queue.claims != wantClaims || len(queue.completed) != wantCompleted {
				t.Fatalf("claims=%d, completed=%v; want %d claims and %d completed jobs", queue.claims, queue.completed, wantClaims, wantCompleted)
			}
			for i, id := range queue.completed {
				if id != fmt.Sprintf("job-%d", i+1) {
					t.Fatalf("job repeated or skipped: %v", queue.completed)
				}
			}
		})
	}
}

type pollingQueue struct {
	times  []time.Time
	cancel context.CancelFunc
}

type stalledQueue struct{ pollingQueue }

func (*stalledQueue) ClaimNext(ctx context.Context) (mediajob.Job, error) {
	select {
	case <-ctx.Done():
		return mediajob.Job{}, ctx.Err()
	case <-time.After(6 * time.Second):
		return mediajob.Job{}, errors.New("claim did not receive a bounded context")
	}
}

func TestClaimDeadlineAndParentCancellation(t *testing.T) {
	for _, parentTimeout := range []time.Duration{time.Minute, time.Second} {
		t.Run(parentTimeout.String(), func(t *testing.T) {
			root := t.TempDir()
			synctest.Test(t, func(t *testing.T) {
				ctx, cancel := context.WithTimeout(context.Background(), parentTimeout)
				defer cancel()
				start := time.Now()
				err := mediajob.NewProcessor(&stalledQueue{}, "unused", root, "/media").ProcessNext(ctx)
				if !errors.Is(err, context.DeadlineExceeded) {
					t.Fatalf("claim error = %v", err)
				}
				if elapsed := time.Since(start); elapsed != min(parentTimeout, 5*time.Second) {
					t.Fatalf("claim waited %v", elapsed)
				}
				if parentTimeout == time.Minute && ctx.Err() != nil {
					t.Fatal("claim deadline cancelled the worker context")
				}
			})
		})
	}
}

func (queue *pollingQueue) ClaimNext(context.Context) (mediajob.Job, error) {
	queue.times = append(queue.times, time.Now())
	if len(queue.times) <= 7 {
		return mediajob.Job{}, errors.New("queue unavailable")
	}
	if len(queue.times) == 8 {
		return mediajob.Job{}, mediajob.ErrNotFound
	}
	queue.cancel()
	return mediajob.Job{}, mediajob.ErrNotFound
}
func (*pollingQueue) Complete(context.Context, string, int16, string, string) error {
	panic("unexpected completion")
}
func (*pollingQueue) Fail(context.Context, string, int16, string) error {
	panic("unexpected failure transition")
}

func TestRunnerBackoffCapsAndResetsAfterHealthyEmptyQueue(t *testing.T) {
	root := t.TempDir()
	synctest.Test(t, func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()
		queue := &pollingQueue{cancel: cancel}
		if err := mediajob.NewProcessor(queue, "unused", root, "/media").Run(ctx); err != nil {
			t.Fatal(err)
		}
		want := []time.Duration{0, 1, 3, 7, 15, 31, 61, 91, 92}
		if len(queue.times) != len(want) {
			t.Fatalf("claims = %d", len(queue.times))
		}
		for i, seconds := range want {
			if got := queue.times[i].Sub(queue.times[0]); got != seconds*time.Second {
				t.Fatalf("claim %d at %v; want %v", i, got, seconds*time.Second)
			}
		}
	})
}

func TestRunnerShutdownInterruptsBackoff(t *testing.T) {
	root := t.TempDir()
	synctest.Test(t, func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()
		queue := &pollingQueue{cancel: cancel}
		done := make(chan error, 1)
		go func() { done <- mediajob.NewProcessor(queue, "unused", root, "/media").Run(ctx) }()
		time.Sleep(40 * time.Second)
		synctest.Wait()
		began := time.Now()
		cancel()
		if err := <-done; err != nil {
			t.Fatal(err)
		}
		if time.Since(began) != 0 {
			t.Fatal("shutdown waited for backoff")
		}
		if len(queue.times) != 6 {
			t.Fatalf("unexpected claims: %d", len(queue.times))
		}
	})
}

func TestRunnerDoesNotClaimAfterShutdown(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	queue := &pollingQueue{cancel: cancel}
	processor := mediajob.NewProcessor(queue, "unused", t.TempDir(), "/media")
	if err := processor.Run(ctx); err != nil {
		t.Fatal(err)
	}
	if len(queue.times) != 0 {
		t.Fatal("claimed work after shutdown")
	}
	if err := processor.ProcessNext(ctx); !errors.Is(err, context.Canceled) {
		t.Fatalf("ProcessNext = %v", err)
	}
}

package mediajob

import (
	"context"
	"errors"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Use session-local copies of the real tables. search_path excludes public so
// a lost connection cannot accidentally write to application data.
func isolatedStore(t *testing.T) (*Store, *pgxpool.Pool) {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL required for database integration")
	}
	config, err := pgxpool.ParseConfig(url)
	if err != nil {
		t.Fatal("invalid test database configuration")
	}
	config.MaxConns = 1
	config.ConnConfig.RuntimeParams["search_path"] = "pg_temp"
	pool, err := pgxpool.NewWithConfig(context.Background(), config)
	if err != nil {
		t.Fatal("could not open test database")
	}
	t.Cleanup(pool.Close)
	_, err = pool.Exec(context.Background(), `
		CREATE TEMP TABLE properties (id uuid PRIMARY KEY);
		CREATE TEMP TABLE media_jobs (LIKE public.media_jobs INCLUDING ALL);
		CREATE TEMP TABLE property_media (LIKE public.property_media INCLUDING ALL);
		INSERT INTO properties VALUES ('10000000-0000-4000-8000-000000000001');
		INSERT INTO media_jobs (id, property_id, source_path, status)
		VALUES ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'test-source', 'processing');
	`)
	if err != nil {
		t.Fatal("could not create isolated tables; verify migrations")
	}
	return NewStore(pool), pool
}

func TestStoreCompletionReplay(t *testing.T) {
	store, pool := isolatedStore(t)
	ctx := context.Background()
	job := "20000000-0000-4000-8000-000000000001"
	for _, mediaID := range []string{"30000000-0000-4000-8000-000000000001", "30000000-0000-4000-8000-000000000002"} {
		if err := store.Complete(ctx, job, 0, "/media/test.mp4", mediaID); err != nil {
			t.Fatal(err)
		}
	}
	var count int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM property_media`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("completion replay published %d videos, want one", count)
	}
	if err := store.Complete(ctx, job, 0, "/media/conflict.mp4", "30000000-0000-4000-8000-000000000003"); err == nil {
		t.Fatal("conflicting completion accepted")
	}
	if err := store.Fail(ctx, job, 0, "late failure"); err == nil {
		t.Fatal("late failure overwrote ready job")
	}
	got, err := store.Get(ctx, job)
	if err != nil {
		t.Fatal(err)
	}
	if got.Status != StatusReady || got.OutputPath != "/media/test.mp4" {
		t.Fatal("terminal result changed")
	}
}

func TestQueueStatusIsReadOnlyAndSeparatesRecoverableJobs(t *testing.T) {
	store, pool := isolatedStore(t)
	ctx := context.Background()
	if _, err := pool.Exec(ctx, `
		UPDATE media_jobs SET attempts = 1, started_at = NOW() - INTERVAL '26 minutes';
		INSERT INTO media_jobs (id, property_id, source_path, status, attempts, created_at, started_at)
		VALUES
		('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'private-source', 'pending', 0, NOW() - INTERVAL '2 minutes', NULL),
		('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'private-source', 'processing', 3, NOW(), NOW() - INTERVAL '26 minutes'),
		('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 'private-source', 'processing', 1, NOW(), NOW()),
		('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', 'private-source', 'ready', 1, NOW(), NOW()),
		('20000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000001', 'private-source', 'failed', 1, NOW(), NOW());
	`); err != nil {
		t.Fatal(err)
	}
	for range 2 {
		status, err := store.QueueStatus(ctx)
		if err != nil {
			t.Fatal(err)
		}
		if status.Pending != 1 || status.Processing != 3 || status.Ready != 1 || status.Failed != 1 || status.Recoverable != 1 || status.Exhausted != 1 {
			t.Fatalf("unexpected status: %+v", status)
		}
		if status.OldestPendingSeconds == nil || *status.OldestPendingSeconds < 120 || status.ObservedAt.IsZero() {
			t.Fatal("missing queue age or observation time")
		}
	}
	job, err := store.Get(ctx, "20000000-0000-4000-8000-000000000001")
	if err != nil || job.Status != StatusProcessing || job.Attempts != 1 {
		t.Fatal("queue inspection changed a claim")
	}
}

func TestQueueStatusWithoutPendingWork(t *testing.T) {
	store, _ := isolatedStore(t)
	status, err := store.QueueStatus(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if status.OldestPendingSeconds != nil || status.Pending != 0 || status.Processing != 1 || status.Recoverable != 1 {
		t.Fatalf("unexpected status: %+v", status)
	}
}

func TestQueueStatusPendingExhaustionAndFutureTimestamp(t *testing.T) {
	store, pool := isolatedStore(t)
	ctx := context.Background()
	if _, err := pool.Exec(ctx, `UPDATE media_jobs SET status = 'pending', attempts = 3, created_at = NOW() + INTERVAL '1 minute'`); err != nil {
		t.Fatal(err)
	}
	status, err := store.QueueStatus(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if status.Pending != 1 || status.Exhausted != 1 || status.Recoverable != 0 || status.OldestPendingSeconds == nil || *status.OldestPendingSeconds != 0 {
		t.Fatalf("unexpected pending status: %+v", status)
	}
}

func TestStoreRecoversExpiredClaimAndFencesPreviousAttempt(t *testing.T) {
	store, pool := isolatedStore(t)
	ctx := context.Background()
	if _, err := pool.Exec(ctx, `UPDATE media_jobs SET attempts = 1, started_at = NOW() - INTERVAL '26 minutes'`); err != nil {
		t.Fatal(err)
	}
	job, err := store.ClaimNext(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if job.Attempts != 2 || job.Status != StatusProcessing {
		t.Fatalf("reclaimed job = %+v", job)
	}
	if _, err := store.ClaimNext(ctx); !errors.Is(err, ErrNotFound) {
		t.Fatalf("live claim was stolen: %v", err)
	}
	if err := store.Complete(ctx, job.ID, 1, "/media/old.mp4", "30000000-0000-4000-8000-000000000001"); !errors.Is(err, ErrInvalidTransition) {
		t.Fatalf("stale completion = %v", err)
	}
	if err := store.Fail(ctx, job.ID, 1, "stale failure"); !errors.Is(err, ErrInvalidTransition) {
		t.Fatalf("stale failure = %v", err)
	}
	if err := store.Complete(ctx, job.ID, job.Attempts, "/media/new.mp4", "30000000-0000-4000-8000-000000000002"); err != nil {
		t.Fatal(err)
	}
	var count int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM property_media`).Scan(&count); err != nil || count != 1 {
		t.Fatalf("published count = %d, error = %v", count, err)
	}
}

func TestStoreCapsCrashRecoveryAttempts(t *testing.T) {
	store, pool := isolatedStore(t)
	ctx := context.Background()
	if _, err := pool.Exec(ctx, `UPDATE media_jobs SET attempts = 3, started_at = NOW() - INTERVAL '26 minutes'`); err != nil {
		t.Fatal(err)
	}
	if _, err := store.ClaimNext(ctx); !errors.Is(err, ErrNotFound) {
		t.Fatalf("exhausted job reclaimed: %v", err)
	}
	job, err := store.Get(ctx, "20000000-0000-4000-8000-000000000001")
	if err != nil {
		t.Fatal(err)
	}
	if job.Status != StatusFailed || job.CompletedAt == nil || job.Attempts != 3 || job.ErrorMessage == "" {
		t.Fatalf("exhausted job not settled: %+v", job)
	}
}

func TestStoreClaimRecoveryBoundary(t *testing.T) {
	for _, test := range []struct {
		name, status, started string
		attempts              int16
		claim                 bool
	}{
		{"pending", StatusPending, "NULL", 0, true},
		{"active", StatusProcessing, "NOW() - INTERVAL '24 minutes'", 1, false},
		{"legacy missing timestamp", StatusProcessing, "NULL", 1, true},
		{"last recovery", StatusProcessing, "NOW() - INTERVAL '26 minutes'", 2, true},
		{"ready", StatusReady, "NOW() - INTERVAL '26 minutes'", 1, false},
		{"failed", StatusFailed, "NOW() - INTERVAL '26 minutes'", 1, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			store, pool := isolatedStore(t)
			ctx := context.Background()
			// Only constant expressions from the test table enter this SQL.
			if _, err := pool.Exec(ctx, `UPDATE media_jobs SET status = $1, attempts = $2, started_at = `+test.started, test.status, test.attempts); err != nil {
				t.Fatal(err)
			}
			job, err := store.ClaimNext(ctx)
			if !test.claim {
				if !errors.Is(err, ErrNotFound) {
					t.Fatalf("unexpected claim: %v", err)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if job.Attempts != test.attempts+1 || job.StartedAt == nil {
				t.Fatal("claim did not advance attempt and timestamp")
			}
		})
	}
}

func TestStoreRejectsInvalidTransitions(t *testing.T) {
	for _, status := range []string{StatusPending, StatusFailed} {
		t.Run(status, func(t *testing.T) {
			store, pool := isolatedStore(t)
			ctx := context.Background()
			job := "20000000-0000-4000-8000-000000000001"
			if _, err := pool.Exec(ctx, `UPDATE media_jobs SET status = $1`, status); err != nil {
				t.Fatal(err)
			}
			if err := store.Complete(ctx, job, 0, "/media/test.mp4", "30000000-0000-4000-8000-000000000001"); err == nil {
				t.Fatal("completed an unclaimed or failed job")
			}
			if status == StatusPending && store.Fail(ctx, job, 0, "failure") == nil {
				t.Fatal("failed an unclaimed job")
			}
			var count int
			if err := pool.QueryRow(ctx, `SELECT count(*) FROM property_media`).Scan(&count); err != nil {
				t.Fatal(err)
			}
			if count != 0 {
				t.Fatal("invalid transition published media")
			}
		})
	}
}

func TestStoreFailureReplayAndMissingJob(t *testing.T) {
	store, pool := isolatedStore(t)
	ctx := context.Background()
	job := "20000000-0000-4000-8000-000000000001"
	if err := store.Fail(ctx, job, 0, "original failure"); err != nil {
		t.Fatal(err)
	}
	if err := store.Fail(ctx, job, 0, "replayed failure"); err != nil {
		t.Fatal(err)
	}
	got, err := store.Get(ctx, job)
	if err != nil {
		t.Fatal(err)
	}
	if got.Status != StatusFailed || got.ErrorMessage != "original failure" {
		t.Fatal("failure replay changed the original outcome")
	}
	missing := "20000000-0000-4000-8000-000000000099"
	if !errors.Is(store.Fail(ctx, missing, 0, "missing"), ErrNotFound) {
		t.Fatal("missing failure did not return not found")
	}
	if !errors.Is(store.Complete(ctx, missing, 0, "/media/test.mp4", "30000000-0000-4000-8000-000000000001"), ErrNotFound) {
		t.Fatal("missing completion did not return not found")
	}
	var count int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM property_media`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatal("failure published media")
	}
}

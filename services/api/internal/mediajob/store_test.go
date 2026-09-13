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
		if err := store.Complete(ctx, job, "/media/test.mp4", mediaID); err != nil {
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
	if err := store.Complete(ctx, job, "/media/conflict.mp4", "30000000-0000-4000-8000-000000000003"); err == nil {
		t.Fatal("conflicting completion accepted")
	}
	if err := store.Fail(ctx, job, "late failure"); err == nil {
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

func TestStoreRejectsInvalidTransitions(t *testing.T) {
	for _, status := range []string{StatusPending, StatusFailed} {
		t.Run(status, func(t *testing.T) {
			store, pool := isolatedStore(t)
			ctx := context.Background()
			job := "20000000-0000-4000-8000-000000000001"
			if _, err := pool.Exec(ctx, `UPDATE media_jobs SET status = $1`, status); err != nil {
				t.Fatal(err)
			}
			if err := store.Complete(ctx, job, "/media/test.mp4", "30000000-0000-4000-8000-000000000001"); err == nil {
				t.Fatal("completed an unclaimed or failed job")
			}
			if status == StatusPending && store.Fail(ctx, job, "failure") == nil {
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
	if err := store.Fail(ctx, job, "original failure"); err != nil {
		t.Fatal(err)
	}
	if err := store.Fail(ctx, job, "replayed failure"); err != nil {
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
	if !errors.Is(store.Fail(ctx, missing, "missing"), ErrNotFound) {
		t.Fatal("missing failure did not return not found")
	}
	if !errors.Is(store.Complete(ctx, missing, "/media/test.mp4", "30000000-0000-4000-8000-000000000001"), ErrNotFound) {
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

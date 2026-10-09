package mediajob

import (
	"context"
	"errors"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Unlike session-local fixtures, a unique schema lets independent connections
// exercise real row locks. No queries in this pool can resolve public tables.
func concurrentStore(t *testing.T) (*Store, *pgxpool.Pool) {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL required for database integration")
	}
	config, err := pgxpool.ParseConfig(url)
	if err != nil {
		t.Fatal("invalid test database configuration")
	}
	id, err := newUUID()
	if err != nil {
		t.Fatal(err)
	}
	schema := pgx.Identifier{"media_queue_test_" + strings.ReplaceAll(id, "-", "")}.Sanitize()
	config.MaxConns = 3
	config.ConnConfig.RuntimeParams["search_path"] = schema
	pool, err := pgxpool.NewWithConfig(context.Background(), config)
	if err != nil {
		t.Fatal("could not open test database")
	}
	t.Cleanup(pool.Close)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if _, err := pool.Exec(ctx, "CREATE SCHEMA "+schema); err != nil {
		t.Fatal("could not create isolated concurrency schema")
	}
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		// Only the freshly generated test schema is eligible for cleanup.
		if _, err := pool.Exec(ctx, "DROP SCHEMA "+schema+" CASCADE"); err != nil {
			t.Error("could not clean isolated concurrency schema")
		}
	})
	if _, err := pool.Exec(ctx, `CREATE TABLE media_jobs (LIKE public.media_jobs INCLUDING ALL)`); err != nil {
		t.Fatal("could not create isolated queue table; verify migrations")
	}
	return NewStore(pool), pool
}

func TestClaimSkipsLockedExhaustedJob(t *testing.T) {
	store, pool := concurrentStore(t)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	const exhausted = "20000000-0000-4000-8000-000000000001"
	const pending = "20000000-0000-4000-8000-000000000002"
	if _, err := pool.Exec(ctx, `
		INSERT INTO media_jobs (id, property_id, source_path, status, attempts, started_at) VALUES
		($1, '10000000-0000-4000-8000-000000000001', 'test-source', 'processing', 3, NOW() - INTERVAL '26 minutes'),
		($2, '10000000-0000-4000-8000-000000000001', 'test-source', 'pending', 0, NULL)
	`, exhausted, pending); err != nil {
		t.Fatal(err)
	}
	locked, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer locked.Rollback(context.Background())
	if _, err := locked.Exec(ctx, `SELECT id FROM media_jobs WHERE id = $1 FOR UPDATE`, exhausted); err != nil {
		t.Fatal(err)
	}
	claimCtx, cancelClaim := context.WithTimeout(ctx, time.Second)
	defer cancelClaim()
	job, err := store.ClaimNext(claimCtx)
	if err != nil || job.ID != pending || job.Attempts != 1 {
		t.Fatalf("unrelated upload blocked by locked exhausted job: id=%q, attempts=%d, error=%v", job.ID, job.Attempts, err)
	}
	if err := locked.Rollback(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := store.ClaimNext(ctx); !errors.Is(err, ErrNotFound) {
		t.Fatalf("unexpected subsequent claim: %v", err)
	}
	settled, err := store.Get(ctx, exhausted)
	if err != nil || settled.Status != StatusFailed || settled.CompletedAt == nil {
		t.Fatalf("unlocked exhausted job was not settled: status=%q, error=%v", settled.Status, err)
	}
}

func TestConcurrentWorkersClaimOneJobOnlyOnce(t *testing.T) {
	store, pool := concurrentStore(t)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	const id = "20000000-0000-4000-8000-000000000001"
	if _, err := pool.Exec(ctx, `INSERT INTO media_jobs (id, property_id, source_path, status)
		VALUES ($1, '10000000-0000-4000-8000-000000000001', 'test-source', 'pending')`, id); err != nil {
		t.Fatal(err)
	}
	type result struct {
		job Job
		err error
	}
	start := make(chan struct{})
	results := make(chan result, 2)
	for range 2 {
		go func() {
			<-start
			job, err := store.ClaimNext(ctx)
			results <- result{job, err}
		}()
	}
	close(start)
	claimed, empty := 0, 0
	for range 2 {
		got := <-results
		switch {
		case errors.Is(got.err, ErrNotFound):
			empty++
		case got.err == nil && got.job.ID == id && got.job.Attempts == 1:
			claimed++
		default:
			t.Errorf("unexpected claim: id=%q, attempts=%d, error=%v", got.job.ID, got.job.Attempts, got.err)
		}
	}
	if claimed != 1 || empty != 1 {
		t.Fatalf("claimed=%d, empty=%d; want one winner and one empty queue", claimed, empty)
	}
}

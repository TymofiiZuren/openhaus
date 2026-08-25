package mediajob

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Store struct{ database *pgxpool.Pool }

func NewStore(database *pgxpool.Pool) *Store { return &Store{database: database} }

func (store *Store) Create(ctx context.Context, job Job) error {
	_, err := store.database.Exec(ctx, `
		INSERT INTO media_jobs (id, property_id, source_path, status)
		VALUES ($1, $2, $3, $4)
	`, job.ID, job.PropertyID, job.SourcePath, job.Status)
	return err
}

func (store *Store) Get(ctx context.Context, id string) (Job, error) {
	var job Job
	err := store.database.QueryRow(ctx, `
		SELECT id::text, property_id::text, source_path, COALESCE(output_path, ''),
		       status::text, attempts, COALESCE(error_message, ''), created_at, started_at, completed_at
		FROM media_jobs WHERE id = $1
	`, id).Scan(&job.ID, &job.PropertyID, &job.SourcePath, &job.OutputPath, &job.Status,
		&job.Attempts, &job.ErrorMessage, &job.CreatedAt, &job.StartedAt, &job.CompletedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Job{}, ErrNotFound
	}
	return job, err
}

func (store *Store) ClaimNext(ctx context.Context) (Job, error) {
	var job Job
	err := store.database.QueryRow(ctx, `
		UPDATE media_jobs SET status = 'processing', attempts = attempts + 1,
		       started_at = NOW(), error_message = NULL
		WHERE id = (
			SELECT id FROM media_jobs WHERE status = 'pending'
			ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
		)
		RETURNING id::text, property_id::text, source_path, status::text, attempts, created_at, started_at
	`).Scan(&job.ID, &job.PropertyID, &job.SourcePath, &job.Status, &job.Attempts, &job.CreatedAt, &job.StartedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Job{}, ErrNotFound
	}
	return job, err
}

func (store *Store) Complete(ctx context.Context, jobID, outputURL, mediaID string) error {
	tx, err := store.database.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var propertyID string
	if err := tx.QueryRow(ctx, `SELECT property_id::text FROM media_jobs WHERE id = $1 FOR UPDATE`, jobID).Scan(&propertyID); err != nil {
		return err
	}
	// Serialize completions for one property so two workers cannot choose the
	// same gallery position concurrently.
	if err := tx.QueryRow(ctx, `SELECT id::text FROM properties WHERE id = $1 FOR UPDATE`, propertyID).Scan(&propertyID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO property_media (id, property_id, kind, url, alt_text, position)
		SELECT $1, $2, 'video', $3, 'Video tour of the property', COALESCE(MAX(position), -1) + 1
		FROM property_media WHERE property_id = $2
	`, mediaID, propertyID, outputURL); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		UPDATE media_jobs SET status = 'ready', output_path = $2, completed_at = NOW() WHERE id = $1
	`, jobID, outputURL); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (store *Store) Fail(ctx context.Context, jobID, message string) error {
	_, err := store.database.Exec(ctx, `
		UPDATE media_jobs SET status = 'failed', error_message = $2, completed_at = NOW() WHERE id = $1
	`, jobID, message)
	return err
}

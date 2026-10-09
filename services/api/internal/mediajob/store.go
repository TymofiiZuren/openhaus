package mediajob

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Store struct{ database *pgxpool.Pool }

const recoveryAfterMinutes = 25
const maxProcessingAttempts = 3

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
	// A fixed lease exceeds the encoder's 20-minute deadline. Attempts serve as
	// fencing tokens; every terminal transition must carry the claimed attempt.
	// Cleanup must also skip locked rows, otherwise a terminal transition can
	// block unrelated pending work before the non-blocking claim query runs.
	if _, err := store.database.Exec(ctx, `
		UPDATE media_jobs SET status = 'failed', completed_at = NOW(),
		       error_message = 'worker recovery attempt limit reached'
		WHERE id IN (
			SELECT id FROM media_jobs
			WHERE attempts >= $2 AND (status = 'pending' OR
			      (status = 'processing' AND (started_at IS NULL OR started_at < NOW() - $1::int * INTERVAL '1 minute')))
			FOR UPDATE SKIP LOCKED
		)
	`, recoveryAfterMinutes, maxProcessingAttempts); err != nil {
		return Job{}, err
	}
	var job Job
	err := store.database.QueryRow(ctx, `
		UPDATE media_jobs SET status = 'processing', attempts = attempts + 1,
		       started_at = NOW(), completed_at = NULL, error_message = NULL
		WHERE id = (
			SELECT id FROM media_jobs WHERE attempts < $2 AND
			(status = 'pending' OR (status = 'processing' AND
			(started_at IS NULL OR started_at < NOW() - $1::int * INTERVAL '1 minute')))
			ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
		)
		RETURNING id::text, property_id::text, source_path, status::text, attempts, created_at, started_at
	`, recoveryAfterMinutes, maxProcessingAttempts).Scan(&job.ID, &job.PropertyID, &job.SourcePath, &job.Status, &job.Attempts, &job.CreatedAt, &job.StartedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Job{}, ErrNotFound
	}
	return job, err
}

func (store *Store) Complete(ctx context.Context, jobID string, attempt int16, outputURL, mediaID string) error {
	tx, err := store.database.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var propertyID, status, savedOutput string
	var currentAttempt int16
	if err := tx.QueryRow(ctx, `SELECT property_id::text, status::text, COALESCE(output_path, ''), attempts FROM media_jobs WHERE id = $1 FOR UPDATE`, jobID).Scan(&propertyID, &status, &savedOutput, &currentAttempt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		return err
	}
	if attempt != currentAttempt {
		return ErrInvalidTransition
	}
	// A lost commit response can be retried without publishing another gallery
	// item. The row lock serializes replay with completion and failure.
	if status == StatusReady && savedOutput == outputURL {
		return nil
	}
	if status != StatusProcessing {
		return ErrInvalidTransition
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

func (store *Store) Fail(ctx context.Context, jobID string, attempt int16, message string) error {
	result, err := store.database.Exec(ctx, `
		UPDATE media_jobs SET status = 'failed', error_message = $2, completed_at = NOW() WHERE id = $1 AND status = 'processing' AND attempts = $3
	`, jobID, message, attempt)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 1 {
		return nil
	}
	var status string
	var currentAttempt int16
	if err := store.database.QueryRow(ctx, `SELECT status::text, attempts FROM media_jobs WHERE id = $1`, jobID).Scan(&status, &currentAttempt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		return err
	}
	if status == StatusFailed && currentAttempt == attempt {
		return nil
	}
	return ErrInvalidTransition
}

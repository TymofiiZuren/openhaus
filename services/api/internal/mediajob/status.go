package mediajob

import (
	"context"
	"time"
)

// QueueStatus contains aggregate operational data, never source paths or identities.
type QueueStatus struct {
	ObservedAt           time.Time `json:"observedAt"`
	Pending              int64     `json:"pending"`
	Processing           int64     `json:"processing"`
	Ready                int64     `json:"ready"`
	Failed               int64     `json:"failed"`
	Recoverable          int64     `json:"recoverable"`
	Exhausted            int64     `json:"exhausted"`
	OldestPendingSeconds *int64    `json:"oldestPendingSeconds"`
}

// QueueStatus reads one database snapshot without claiming or settling jobs.
// Recoverable and exhausted are subsets, not extra jobs to add to status totals.
func (store *Store) QueueStatus(ctx context.Context) (QueueStatus, error) {
	var status QueueStatus
	err := store.database.QueryRow(ctx, `
		SELECT NOW(),
		 count(*) FILTER (WHERE status = 'pending'),
		 count(*) FILTER (WHERE status = 'processing'),
		 count(*) FILTER (WHERE status = 'ready'),
		 count(*) FILTER (WHERE status = 'failed'),
		 count(*) FILTER (WHERE status = 'processing' AND attempts < $2 AND
		   (started_at IS NULL OR started_at < NOW() - $1::int * INTERVAL '1 minute')),
		 count(*) FILTER (WHERE attempts >= $2 AND (status = 'pending' OR
		   (status = 'processing' AND (started_at IS NULL OR started_at < NOW() - $1::int * INTERVAL '1 minute')))),
		 CASE WHEN count(*) FILTER (WHERE status = 'pending') = 0 THEN NULL ELSE
		   GREATEST(0, FLOOR(EXTRACT(EPOCH FROM NOW() - min(created_at) FILTER (WHERE status = 'pending'))))::bigint END
		FROM media_jobs
	`, recoveryAfterMinutes, maxProcessingAttempts).Scan(&status.ObservedAt, &status.Pending,
		&status.Processing, &status.Ready, &status.Failed, &status.Recoverable,
		&status.Exhausted, &status.OldestPendingSeconds)
	return status, err
}

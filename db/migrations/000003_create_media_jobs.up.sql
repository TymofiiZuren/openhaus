CREATE TYPE media_job_status AS ENUM (
    'pending',
    'processing',
    'ready',
    'failed'
);

CREATE TABLE media_jobs (
    id UUID PRIMARY KEY,
    property_id UUID NOT NULL
        REFERENCES properties(id)
        ON DELETE CASCADE,

    source_path TEXT NOT NULL,
    output_path TEXT,
    status media_job_status NOT NULL DEFAULT 'pending',
    attempts SMALLINT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

CREATE INDEX media_jobs_pending_idx
    ON media_jobs (created_at)
    WHERE status = 'pending';

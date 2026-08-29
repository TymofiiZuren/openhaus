CREATE TABLE manager_users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL,
    password_hash text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (email = lower(email)),
    CHECK (char_length(email) BETWEEN 3 AND 320)
);

CREATE UNIQUE INDEX manager_users_email_idx ON manager_users (email);

CREATE TABLE manager_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    manager_user_id uuid NOT NULL REFERENCES manager_users(id) ON DELETE CASCADE,
    token_hash bytea NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX manager_sessions_expires_at_idx ON manager_sessions (expires_at);

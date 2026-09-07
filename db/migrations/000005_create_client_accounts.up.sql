CREATE TABLE client_users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL UNIQUE CHECK (email = lower(trim(email)) AND char_length(email) BETWEEN 3 AND 320),
    password_hash text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE client_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_user_id uuid NOT NULL REFERENCES client_users(id) ON DELETE CASCADE,
    token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX client_sessions_expiry_idx ON client_sessions(expires_at);

CREATE TABLE client_auth_limits (
    key_hash bytea PRIMARY KEY CHECK (octet_length(key_hash) = 32),
    attempts integer NOT NULL CHECK (attempts > 0),
    reset_at timestamptz NOT NULL
);
CREATE INDEX client_auth_limits_expiry_idx ON client_auth_limits(reset_at);

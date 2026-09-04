#!/usr/bin/env bash
# Local-only client-account API. Existing processes are never stopped.
set +x
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ ! -f .env ]]; then
  echo 'Create the local .env described in README.md first.' >&2
  exit 1
fi
set -a
source .env
set +a
export PGHOST="${POSTGRES_HOST:-127.0.0.1}" PGPORT="${POSTGRES_PORT:?Missing POSTGRES_PORT}"
export PGUSER="${POSTGRES_USER:?Missing POSTGRES_USER}" PGPASSWORD="${POSTGRES_PASSWORD:?Missing POSTGRES_PASSWORD}" PGDATABASE="${POSTGRES_DB:?Missing POSTGRES_DB}"
export PGCONNECT_TIMEOUT=5
case "$PGHOST" in localhost|127.0.0.1) ;; *) echo 'This launcher only connects to the local development database.' >&2; exit 1 ;; esac
if ! psql -X -v ON_ERROR_STOP=1 -c 'SELECT id,email,password_hash FROM client_users LIMIT 0; SELECT client_user_id,token_hash,expires_at FROM client_sessions LIMIT 0; SELECT key_hash,attempts,reset_at FROM client_auth_limits LIMIT 0; SELECT client_user_id,property_id,created_at FROM client_saved_properties LIMIT 0;' >/dev/null 2>&1; then
  echo 'Client database is unavailable or migrations 000005–000006 are missing. Apply the documented migrations before starting.' >&2
  exit 1
fi
# pgx uses the PG* environment above, avoiding credentials in process arguments.
export DATABASE_URL='sslmode=disable'
export APP_ENV=development ENABLE_CLIENT_ACCOUNTS=true
export CLIENT_ORIGIN="${CLIENT_ORIGIN:-http://127.0.0.1:5177}"
export HTTP_ADDR="127.0.0.1:${CLIENT_API_PORT:-8083}"
case "$CLIENT_ORIGIN" in http://127.0.0.1:*|http://localhost:*) ;; *) echo 'Use a loopback HTTP origin for local client testing.' >&2; exit 1 ;; esac
cd services/api
exec go run ./cmd/api

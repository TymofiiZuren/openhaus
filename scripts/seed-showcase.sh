#!/usr/bin/env bash
# Loopback-only, additive showcase import. Dry run is the default.
set +x
set -euo pipefail
cd "$(dirname "$0")/.."
apply=false
seed=db/seeds/000005_showcase.sql
case "${2:-}" in --expansion) seed=db/seeds/000006_showcase_expansion.sql ;; '') ;; *) echo 'Optional second argument: --expansion' >&2; exit 1 ;; esac
case "${1:---dry-run}" in --apply) apply=true ;; --dry-run) ;; *) echo 'Use --dry-run or --apply' >&2; exit 1 ;; esac
if [[ ! -f .env ]]; then echo 'Local .env is required.' >&2; exit 1; fi
set -a
source .env
set +a
export PGHOST="${POSTGRES_HOST:-127.0.0.1}" PGPORT="${POSTGRES_PORT:?Missing POSTGRES_PORT}"
export PGUSER="${POSTGRES_USER:?Missing POSTGRES_USER}" PGPASSWORD="${POSTGRES_PASSWORD:?Missing POSTGRES_PASSWORD}" PGDATABASE="${POSTGRES_DB:?Missing POSTGRES_DB}"
export PGCONNECT_TIMEOUT=5
case "$PGHOST" in localhost|127.0.0.1) ;; *) echo 'Only the loopback development database is supported.' >&2; exit 1 ;; esac
for pack in coastal courtyard harbour; do
 for suffix in exterior.jpg interior.jpg study.mp4; do
  test -s "apps/web/public/media-demo/$pack-$suffix" || { echo "Missing showcase asset: $pack-$suffix" >&2; exit 1; }
 done
done
psql -X -v ON_ERROR_STOP=1 -v apply="$apply" -f "$seed"

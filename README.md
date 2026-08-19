# OpenHaus

OpenHaus is a web marketplace for discovering residential properties across
Ireland. The first milestone is a vertical slice from a React client through a
Go HTTP API to PostgreSQL/PostGIS.

## Repository layout

```text
apps/web/                 React and TypeScript client
services/api/             Go HTTP API
services/media-worker/    Go asynchronous media worker
native/panorama/          C++ panorama processor
api/                      OpenAPI contract
db/migrations/            Database migrations
db/seeds/                 Local development seed data
infra/                    Local infrastructure configuration
docs/                     Architecture and product documentation
```

The repository is currently a scaffold. Build and development commands will be
added with the first runnable vertical slice.

## Local database

Copy `.env.example` to `.env` if you want to override the development defaults,
then start PostgreSQL/PostGIS:

```sh
docker compose -f infra/docker-compose.yml up -d
docker compose -f infra/docker-compose.yml ps
```

Stop the service without deleting its named data volume:

```sh
docker compose -f infra/docker-compose.yml down
```

## Property catalogue API

Create a local `.env`, load its development values, then apply the initial
schema and seed data:

```sh
cp .env.example .env
set -a
. ./.env
set +a
export DATABASE_URL="postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:${POSTGRES_PORT}/${POSTGRES_DB}?sslmode=disable"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/000001_create_properties.up.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/seeds/000001_properties.sql
```

Run the API from its Go module:

```sh
cd services/api
go run ./cmd/api
```

The API exposes process health, database readiness, and the first published
property catalogue:

```sh
curl http://localhost:8080/healthz
curl http://localhost:8080/readyz
curl http://localhost:8080/api/v1/properties
```

Run unit tests from `services/api`. Set `TEST_DATABASE_URL` to include the
PostgreSQL integration tests against a migrated and seeded local database:

```sh
go test ./...
TEST_DATABASE_URL="$DATABASE_URL" go test -count=1 ./...
```

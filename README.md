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

The repository contains a runnable React property explorer, Go API, and local
PostgreSQL/PostGIS development stack.

## Run the application

From the repository root, start the database and API in one terminal:

```sh
docker compose -f infra/docker-compose.yml up -d
set -a
. ./.env
set +a
export DATABASE_URL="postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:${POSTGRES_PORT}/${POSTGRES_DB}?sslmode=disable"
cd services/api
go run ./cmd/api
```

In a second terminal, start the web client:

```sh
cd apps/web
npm install # first clone, or whenever package-lock.json changes
npm run dev
```

If port 8080 is already occupied by another API process, run the replacement API
from `services/api` on an unused port:

```sh
HTTP_ADDR=127.0.0.1:8081 go run ./cmd/api
```

Then run Vite from `apps/web` with its proxy pointed at that API:

```sh
OPENHAUS_API_PROXY_TARGET=http://127.0.0.1:8081 npm run dev -- --port 5174
```

Open `http://localhost:5173`. Copy `apps/web/.env.example` to
`apps/web/.env.local` and add a browser-restricted Google Maps key before
starting Vite if the file is not configured yet. The migration and seed steps
below are required only for a new or empty local database.

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
migrate -path db/migrations -database "$DATABASE_URL" up
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/seeds/000001_properties.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/seeds/000002_property_media.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/seeds/000003_second_property.sql
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

Limit the public catalogue to the visible WGS84 map bounds with
`west,south,east,north` coordinates:

```bash
curl "http://localhost:8080/api/v1/properties?bbox=-11,51,-5,56"
```

The spatial query uses the GiST index on `properties.location`. Invalid,
out-of-range, or reversed bounds return `400 invalid_bbox`.

The public client has one location explorer built around buyer decisions rather
than map controls. Buyers can search the available counties and towns, open a
county, select a home, and keep the map and catalogue on the same selection.
The county selection is stored in the URL and works even if the map provider is
unavailable.

The production renderer uses Google Maps for geographic and street data. Its
visible experience is custom OpenHaus UI: warm neutral cartography, grouped
home-count markers, map/satellite switching, reframe controls, location search,
and a persistent property grid. Copy the web environment example and add a
browser-restricted Maps JavaScript API key:

```bash
cp apps/web/.env.example apps/web/.env.local
```

Then set `VITE_GOOGLE_MAPS_API_KEY` in `apps/web/.env.local` and restart Vite.
Restrict the key to the local and deployed OpenHaus origins in Google Cloud.
The browser key is intentionally public; referrer restrictions and API
restrictions are what protect it. Google Maps requires a billing-enabled Google
Cloud project, so usage and budget alerts must be configured before deployment.

The explorer uses an explicit Ireland → county → council-area flow. The
national view shows county boundaries and aggregated county home counts;
zooming alone never changes the selected county. Selecting a county centers it,
replaces the national layer with its council areas, and groups its homes by
town. The current council-area
GeoJSON is a small, attributed client-side MVP slice for the two published
counties; it is not the authoritative persistence hierarchy. The existing
PostGIS bounding-box query remains the foundation for the later viewport-search
API. See [`docs/MAP_IMPLEMENTATION_PLAN.md`](docs/MAP_IMPLEMENTATION_PLAN.md)
for the production data gates and next phases.

## Manager authentication

Manager routes use an opaque session cookie. Passwords are bcrypt hashes and
only SHA-256 digests of session tokens are stored in PostgreSQL. Apply migration
`000004`, then create the first local manager without writing credentials to a
tracked file:

```bash
cd services/api
DATABASE_URL="$DATABASE_URL" \
MANAGER_EMAIL="manager@example.com" \
MANAGER_PASSWORD="use-a-long-local-password" \
go run ./cmd/create-manager
```

Login with `POST /api/v1/manager/session`; logout with `DELETE` on the same
route. `GET /api/v1/manager/properties` requires the returned HttpOnly cookie
and includes draft, published, and archived listings. Set `APP_ENV=production`
in production so the cookie is also marked `Secure`.

The web manager workspace is available at `http://localhost:5173/manager/login`.
It restores an existing cookie-backed session and lets managers create drafts,
edit listing details, and move listings between draft, published, and archived
states without exposing the session token to JavaScript. Media uploads and job
polling are also restricted to authenticated manager sessions.

## Asynchronous video processing

The upload endpoint streams MP4 or MOV bodies to local storage and returns a
durable PostgreSQL job immediately. It does not hold the complete video in Go
memory. From the repository root:

```sh
curl -X POST \
  -F "video=@/path/to/tour.mov" \
  http://localhost:8080/api/v1/manager/properties/PROPERTY_ID/videos
```

The response is `202 Accepted` and includes a job ID. Run the separate worker
from `services/api`; it claims pending work with `FOR UPDATE SKIP LOCKED`, runs
FFmpeg, publishes an MP4, and atomically adds it to the property gallery:

```sh
go run ./cmd/media-worker
curl http://localhost:8080/api/v1/manager/media-jobs/JOB_ID
```

Local defaults place source uploads in `services/api/.data/uploads` and public
outputs in `apps/web/public/media/uploads`. Override them with
`MEDIA_SOURCE_DIR`, `MEDIA_OUTPUT_DIR`, `MEDIA_PUBLIC_PREFIX`, and
`FFMPEG_PATH`. `HTTP_ADDR` changes the API listen address when port 8080 is
already occupied. Production storage and a CDN remain a later milestone.

In local Vite development, each property card also exposes **Listing tools ·
Local demo**. This interface selects a video, starts the upload, follows the
processing job, and refreshes the gallery when the worker finishes. Vite omits
this control from production builds because authentication and manager
permissions have not been implemented yet.

Run unit tests from `services/api`. Set `TEST_DATABASE_URL` to include the
PostgreSQL integration tests against a migrated and seeded local database:

```sh
go test ./...
TEST_DATABASE_URL="$DATABASE_URL" go test -count=1 ./...
```

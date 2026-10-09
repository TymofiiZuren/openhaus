# Production deployment proposal

Status: proposal, not provisioned or deployed. Provider constraints rechecked
2026-10-09. The owner selected preparation of the managed-hosting proposal
(Render + managed PostgreSQL + R2); provisioning, domain, budget and public
capability profile remain unconfirmed.

## Public portfolio launch decision

Choose one capability profile before provisioning:

- **Recommended first release: hardened portfolio demo.** Preserve search, maps,
  comparison/CSV, local notes, match/area tools and local native-bundle inspection.
  Keep real registration and simulated viewing/notification delivery explicitly
  disabled or labelled. Keep staff upload/processing private until storage and
  operational gates are proven. This does not remove development features.
- **Full public account/media workflow.** Complete verification/recovery, delivery,
  cross-service media storage, retention and recovery acceptance before enabling
  those capabilities. Do not use development mode to bypass production guards.

The selected Render + managed PostgreSQL + R2 proposal below is not an implemented
stack. Render documents PostGIS support and URL destinations for
static rewrites, but those docs are not evidence that our credentialed API writes,
uploads and error routing work through the chosen deployment. Validate that
boundary before the SPA fallback: GET/POST, query strings, cookies, exact Origin,
CSRF rejection, upload limits and upstream failures must reach the API correctly.
The local Vite proxy smoke test is only a fixture test, not hosted acceptance.

Render also confirms that disks cannot be shared between services; therefore the
current API/worker filesystem contract still blocks separate-service processing.
R2 remains proposed storage, not connected storage. A location hint alone does not
guarantee EU placement; use the jurisdiction mechanism if that requirement is
chosen. Provider references are linked below. No prices or compliance guarantees
are inferred.

Next owner inputs: staging/public domain, monthly budget ceiling, and capability
profile. Only then confirm provider configuration and implement the storage/routing
contract for that target. Staging must prove HTTPS/Secure cookies, disabled public
registration, restricted map-key origins, database restore, media recovery/retention
where enabled, worker failure handling, rollback and mobile/performance acceptance.
These are acceptance gates, not a claim that the present build has passed them.

## Recommended first production target

- Source: a private GitHub repository; exclude credentials and user uploads.
- React frontend: Render static site. Preserve same-origin `/api` routing, session
  cookies and CSRF checks through a verified proxy setup. Test cookie forwarding,
  request limits and API errors before opening registration. Never serve API misses
  with the SPA HTML fallback.
- Go API and FFmpeg worker: separate paid Render services, in the same Frankfurt
  region as managed Render Postgres. Enable the PostGIS extension required by the
  schema. Keep the database private and restrict service credentials.
- Photos, source videos and processed derivatives: Cloudflare R2. Use explicit EU
  jurisdiction where appropriate, not merely a location hint. Private originals
  and quarantine; only approved derivatives are publicly deliverable. Object keys
  are opaque identifiers, never user filenames. Do not store uploads in Git or the
  frontend build directory.
- Transactional email: Resend is a candidate, subject to approval, domain ownership
  verification and retention/provider review. Implement a durable outbox, delivery
  status and replay protection; do not equate provider acceptance with delivery.
- Secrets: service secret settings, separate staging/production credentials. The
  browser gets only deliberately public configuration such as a restricted Maps
  key; no database credentials or storage signing secrets.

Alternative: AWS container hosting with managed PostgreSQL and object storage if
the owner prioritizes broader infrastructure control over a simpler first launch.
The managed Render proposal is the selected direction; AWS is not a parallel build.
Confirm a monthly budget before provider-specific implementation.
No price estimate is a quote; media volume, encoding CPU and retention are unknown.

## Managed-hosting preparation worksheet

This worksheet maps current code to proposed services. It is not executable
deployment configuration, and none of the commands below provisions a service.
No deployment settings were persisted to `CLAUDE.md`.

| Component | Proposed home | Existing contract | Required acceptance |
| --- | --- | --- | --- |
| React catalogue and buyer tools | Render static site | `apps/web`: `npm ci` then `npm run build`; publish `dist` | Deep links, missing assets, readable mobile forms, map navigation and realistic load measurements |
| Go API | Render web service, Frankfurt | `services/api`: `go build -o api ./cmd/api`; start `./api`; `HTTP_ADDR` controls the listener | Same-origin API boundary, exact Origin/CSRF checks, cookies, upstream failures and `/readyz` |
| Database and job queue | Paid managed Render PostgreSQL in the same region | `DATABASE_URL`; ordered `db/migrations/*.up.sql`; PostGIS | Isolated migration rehearsal and backup restore; no development credentials or unreviewed seed data |
| Private media originals and approved derivatives | R2, with explicit jurisdiction if required | Not integrated; jobs currently carry filesystem paths | Immutable object keys, bounded access, quarantine, retention and recovery; no shared-disk assumption |
| Media processing | Separate Render background worker, after storage acceptance | `services/api`: `go build -o media-worker ./cmd/media-worker`; `--check`, `--status`, `--once` exist | FFmpeg H.264/AAC runtime, cross-service processing, worker crash/retry/fencing and orphan reconciliation |

Render expects a listener on `0.0.0.0` and normally supplies `PORT`. The API
currently reads `HTTP_ADDR`, not `PORT`. For the proposed fixed-port configuration,
explicitly set both platform `PORT` and application `HTTP_ADDR` to matching port
settings (for example, `10000` and `:10000`). Do not assume an environment value
containing `$PORT` will be expanded by the application. This mapping must be tested
on staging. See [Render port binding](https://render.com/docs/web-services#port-binding).

Keep `APP_ENV=production` and `ENABLE_CLIENT_ACCOUNTS=false` for the first public
portfolio. The API intentionally refuses public client accounts in production;
changing the environment to development is not a launch workaround. Configure the
exact public `CLIENT_ORIGIN` for write checks, and keep database/storage credentials
in provider secret settings, never browser variables. `VITE_GOOGLE_MAPS_API_KEY`
is deliberately browser-visible and needs restrictions for the approved origins.
R2 settings are not listed as existing application variables because that adapter
does not exist yet.

Choose the routing implementation only after a staging spike:

1. **Recommended if verified:** static-site `/api` rewrites to the API, before the
   SPA fallback. Assert POST bodies, query strings, cookies, Origin, CSRF rejection,
   upload limits and JSON failures. A documented URL rewrite is not proof of all
   these behaviours in this application.
2. **Fallback:** a same-origin web gateway serving the built frontend and forwarding
   `/api` without changing its security contract. This requires new implementation
   and a separately reviewed runtime configuration; it is not present today.

API health routes are `/healthz` (process liveness) and `/readyz` (database probe).
Use readiness for API traffic admission, with a separate catalogue/SPA synthetic
check through the public origin. Neither route proves worker, R2 or email health.
The worker has no HTTP health route: use its preflight and queue status plus an
operational heartbeat and oldest-job-age alert before enabling processing.

For a cost review, itemize API compute, database/backup plan, worker encoding time,
object bytes/operations, bandwidth, domain and any email service. Measure sample
encoding workloads before choosing worker size. Do not silently add Redis: the
existing PostgreSQL queue remains the first target.

Preparation order: approve domain/budget/profile, validate routing in isolated
staging, implement the storage contract when uploads are enabled, run operational
acceptance, then review the exact deploy configuration and launch approval.
Automatic deploy triggers and any CI/CD remain unconfigured; no public service,
database, bucket, pipeline or dependency was created by this proposal.

## Current incompatibilities to resolve

The API queues a local filesystem path. The worker reads that path and writes into
the frontend's public directory. Separate service instances cannot share that
assumption. Render disks are accessible by one service instance only. Replace this
contract with immutable object keys and bounded downloads to worker scratch space;
retain local-disk mode for development. This is an explicit architecture change,
not a deployment configuration trick.

Prefer the existing PostgreSQL queue initially. Redis is not a prerequisite for a
fast app and does not solve filesystem sharing or job correctness. Add caching only
after measuring a slow query/path, with explicit invalidation and no caching of
private account responses in shared caches.

## Gates in execution order

September 18 update: fixed 25-minute stale-claim recovery, three-attempt limits,
attempt-fenced transitions and per-attempt output filenames are implemented using
existing columns. Drain older workers before deploying the new API/worker pair;
older binaries lack fencing. This is not full operational recovery: validate
multi-process crash scenarios on staging and add orphan reconciliation/retention.
The remaining gates below still apply.

1. Crash-safe worker: schema-backed lease owner/expiry and fencing token, bounded
   retry attempts, immutable attempt outputs, idempotent completion, reconciliation.
   Prove worker death, lease expiry, concurrent claims, stale completion and lost
   commit response do not lose jobs or publish duplicate/incorrect media.
2. Storage contract: private uploads with size/type limits and validation, signed
   short-lived access, bounded multipart upload, cancellation/cleanup and quotas.
   Prove API and worker operate without a shared filesystem. Review SDK dependency
   approval before adding one. Roll out schema additively, then writers/workers,
   then migrate old media with checksums; retain old sources until verified.
3. Accounts and delivery: expiring single-use hashed verification/recovery tokens,
   rate limits, session revocation, durable email outbox and actual viewing workflow.
   Retain the production account gate until these tests pass.
4. Security and data: HTTPS, Secure/HttpOnly cookies, origin/CSRF enforcement,
   ownership checks, secret scan and dependency audit; operator identity, verified
   listing content, consent and retention decisions. No compliance claim by default.
5. Operations: restore a database backup into an isolated environment; exercise
   object recovery, worker failure alerts, disk/quota alarms and rollback. Backups
   existing is not proof they can be restored. Agree recovery objectives first.
6. Launch acceptance: test key flows on mobile/desktop, accessibility and realistic
   media sizes; record load/interaction measures and fix the large map bundle.
   Staging first, then owner-approved public launch. A Vite development server is
   not the production server.

## Provider references

- [Render service types](https://render.com/docs/service-types)
- [Render regions](https://render.com/docs/regions)
- [Postgres extensions](https://render.com/docs/postgresql-extensions)
- [Disk restrictions](https://render.com/docs/disks)
- [TLS and HTTP redirects](https://render.com/docs/tls)
- [Static routing](https://render.com/docs/redirects-rewrites)
- [Database backups](https://render.com/docs/postgresql-backups)
- [R2 S3 compatibility](https://developers.cloudflare.com/r2/how-r2-works/)
- [R2 data jurisdiction](https://developers.cloudflare.com/r2/reference/data-location/)
- [R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- [Resend regions](https://resend.com/docs/dashboard/domains/regions)

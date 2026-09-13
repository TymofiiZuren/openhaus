# Production deployment proposal

Status: proposal, not provisioned or deployed. Reviewed 2026-09-09.

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
Choose the platform and a monthly budget before provider-specific implementation.
No price estimate is a quote; media volume, encoding CPU and retention are unknown.

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

# OpenHaus launch readiness

## October 9 health and managed-hosting checkpoint

Stage remains feature-rich portfolio demo / pre-beta, not deployment-ready. The
owner selected preparation of Render + managed PostgreSQL + R2, not provisioning.
The deployment worksheet now maps service commands, port configuration, public
account gating, routing alternatives and acceptance requirements to current code.
Domain, budget and capability profile still need confirmation.

Primary signal **partially validated** for overall release readiness. The existing
checks ran without persisting tool settings: 451 frontend tests, TypeScript,
production build, built-preview fixture smoke test, Go tests/vet, native C++
sanitizer/CLI checks and real FFmpeg stream/dimension checks passed. Frontend lint
exited successfully with three map fast-refresh warnings. ShellCheck exited **1**:
one intentional fixed-argument split (`SC2086`) and two unresolved `.env` source
references (`SC1091`). No `.env` values were inspected or source fixes made during
this report-only health run.

The health skill's weighted available-tool score is **8.9/10**, not a production
readiness percentage or security/coverage audit. Dead-code and GBrain checks were
unavailable and excluded. Database pipeline tests were skipped: no
`TEST_DATABASE_URL` was available. The large map bundle warning remains. Hosted
cookie/proxy behaviour, separate-service media storage, backup restore, worker
recovery and whole-product browser/accessibility/performance acceptance are still
release gates. No commit, push, service provisioning or deployment occurred.

## October 9 UI and comparison acceptance checkpoint

Stage: feature-rich public portfolio demo / pre-beta. Not production-approved or
deployed. The local app remains available on port 5177 and proxied `/readyz`
reports ready; that is local readiness, not a public deployment check.

Impeccable guided a quieter homepage and a more readable comparison workspace.
The comparison now has a compact centered heading, 16px fact labels/values,
consistent spacing, thin themed scrolling and a single-column mobile layout.
CSV downloads contain explicit public listing fields only, exact EUR prices and
property links. Quoting and formula-prefix protection cover spreadsheet imports;
Irish characters, embedded quotes/newlines, retry and empty selection are tested.
Nothing is uploaded and private notes are not exported.

Primary signal **met for this increment**: the running browser showed both selected
homes and correct prices at 1280px and 390px, with no horizontal overflow. A real
CSV downloaded and its rows matched those homes. Escape closed the dialog and
returned focus to the comparison opener. Fact text measured 16px; secondary text
contrast against the light surface measured 6.05:1. Dark-theme/cross-browser
acceptance and a whole-product accessibility audit were not performed.

Fresh checks passed: 451 frontend tests across 56 files, `npm run build`,
`npm run lint`, built-preview routing/proxy smoke test, `go test -count=1 ./...`,
`go vet ./...`, real FFmpeg stream-policy and dimension-bound tests, native C++
sanitizer tests and CLI checks, and `git diff --check`. Three existing map
fast-refresh lint warnings and the 1,127.65 KB map chunk (752.29 KB gzip) remain.
Database opt-in tests were skipped because `TEST_DATABASE_URL` was unavailable;
this run does not establish PostgreSQL pipeline/recovery or deployed backup proof.

The next release decision is the confirmed hosting/domain and public capability
profile in `DEPLOYMENT_PLAN.md`. Full public accounts remain deliberately blocked
in production; shared/object media storage, operational recovery and realistic
browser/performance acceptance remain unresolved. No new dependency, deployment
configuration, public service, commit or push was created in this checkpoint.

## September 19 local acceptance checkpoint

Stage: feature-rich portfolio demo / pre-beta, not production-approved.
Docker/PostgreSQL, the local API and Vite have been restarted. Frontend and
proxied catalogue requests return 200; API readiness reports ready. Local buyer
accounts remain development-only. A persistent video worker was not started.

New HTTP integration coverage uses the real upload service with a recording
queue: authenticated multipart uploads preserve the submitted bytes, return the
queued job identity, use non-cacheable responses and omit private storage paths.
Anonymous uploads cannot reach storage or the queue. The separate real
PostgreSQL/FFmpeg pipeline test passed in the preceding checkpoint, including
decode validation, failed-source retention and completion replay.

Fresh validation: 437 frontend tests across 55 files, production build,
`go test ./...`, the targeted HTTP upload test with race detection, and
`go vet ./internal/httpapi` passed. Database/FFmpeg opt-in integration suites
were not rerun in this checkpoint. The build still warns about the approximately
1.13 MB map JavaScript chunk (752 KB gzip). Automated checks do not replace
browser/mobile upload acceptance or deployed operational testing.

The next launch gates remain shared/object media storage and retention,
backup/restore and deployed recovery checks, browser/accessibility/performance
acceptance, and safe staff access. Public buyer accounts additionally require
verification/recovery. A public portfolio can keep registration and simulated
viewing/notification delivery clearly disabled or labelled as demonstrations.
No hosting, public deployment, commit or push was performed in this checkpoint.

## September 18 queue visibility

`media-worker --status` now provides an aggregate, read-only database snapshot
without requiring an encoder or output storage. It reports state totals,
recoverable stale claims, exhausted claims, and oldest pending age. Recovery and
status queries share timeout/attempt policy constants. It does not expose job
paths or identities, retry work, or replace a worker heartbeat/production alerting.

## September 18 worker startup checks

The worker now validates database connectivity/schema, output-directory writes,
and H.264/AAC encoding before claiming jobs. `go run ./cmd/media-worker --check`
runs those checks and exits without processing uploads. Missing/broken encoders,
cancelled or hung probes, output cleanup and existing-file preservation have
regression coverage. The real local database/FFmpeg preflight passed. This does
not certify deployment permissions, cross-host storage or production recovery.

## September 18 media recovery increment

Still pre-beta, not production-approved. The worker now reclaims processing jobs
whose database `started_at` is older than 25 minutes (or absent), with a maximum
of three attempts. The existing attempt counter fences completion and failure;
a superseded worker cannot change the newer attempt. Each attempt writes a
different output filename. The manager reports recovered processing attempts,
and validates attempt metadata before rendering it.

Deploy API and worker code together after draining old workers: old binaries do
not enforce attempt fencing. No database migration is required. Recovery requires
a running updated worker; it is not an external scheduler. The 25-minute window
exceeds the existing 20-minute encoding deadline. Normal encoder failures remain
terminal rather than repeatedly processing invalid input. Exhausted crash recovery
becomes a visible failed job. Sources are retained unless completion succeeds;
uncertain commits and superseded attempts can leave unreferenced output files.

Storage separation, orphan reconciliation/retention, deployed multi-worker crash
tests, account verification/recovery, backup restoration and browser acceptance
remain launch gates. Historical notes below describe earlier code, not the current
recovery implementation. This increment does not provision or deploy services.

Validation: all 427 frontend tests across 54 files passed; build and lint passed
with existing map-bundle and fast-refresh warnings. `go test ./...` and
`go vet ./...` passed with the local test database configured. Media store tests
use isolated temporary tables; they cover stale/live claims, attempt limits,
stale transitions and completion replay. Targeted media/HTTP race checks and
real FFmpeg stream/dimension tests passed. This is not a live multi-worker crash
drill or a browser verification of the new status message.

## September 14 local development checkpoint

Stage remains advanced portfolio demo / pre-beta, not production-approved.
The working tree now includes a local native-bundle inspector and an opt-in
experimental CSS 3D panorama viewer. This previews already-processed output;
it does not connect panorama uploads to the media queue or replace Kuula.
The inspector accepts the complete seven-file bundle through either its accessible
file picker or drag and drop; both paths use the same local verification boundary.
Rendered orientation, seams and supported-browser acceptance remain unverified.

This checkpoint strengthens regression coverage for late bundle success/failure,
replacement cancellation and image-URL cleanup. No new runtime feature or
production deployment was added in this checkpoint.

Validation: 407 frontend tests across 54 files passed; production build and lint
passed with the existing large-map-chunk warning and three fast-refresh warnings.
`go test ./...` and `go vet ./...` passed (some Go results were cached).
`TEST_DATABASE_URL` was not configured, so this run does not establish database
integration coverage. Local proxied `/readyz` returned ready. Browser visual
acceptance and production operations were not verified by these checks.

Code-backed gates remain the development-only buyer-account guard, media claims
without expiring worker leases, and local filesystem media storage. Keep public
registration gated until verification/recovery is complete. A portfolio launch
can omit registration, but still needs supported-browser checks, safe staff
access, deployment configuration and recovery validation for enabled services.

## September 13 pull-request checkpoint

Stage: advanced portfolio demonstration / pre-beta, not production-approved.
This increment includes county-to-area map navigation, shared property dialogs,
buyer shortlist insights and a browser-local viewing checklist. The native C++
panorama converter and Go bundle CLI are standalone tools, not integrated with
the upload queue or public panorama viewer.

Fresh checks: 378 frontend tests passed on the full rerun; build and lint passed
with the existing large-map-chunk warning and three fast-refresh warnings. The
first run failed one manager-navigation test (377 passed); that test passed both
in isolation and in the full rerun. Treat this as an unresolved intermittent test
signal, not a proven production defect or a silently clean first run.

All Go tests and vet passed, as did targeted race checks, real FFmpeg encoding
tests, and media-job store tests using isolated PostgreSQL temporary tables.
Native C++ warning-as-error compilation, AddressSanitizer/UndefinedBehaviorSanitizer
tests and CLI rejection tests passed. New Go contract tests reject malformed,
truncated, oversized and failed native-processor output. This does not establish
complete database integration, crash recovery, real-device accessibility or
production performance coverage. No aggregate coverage percentage is claimed.

No public deployment, new production dependency or schema migration is part of
this checkpoint. Release gates below remain open, particularly worker leases,
object storage, account verification/recovery and delivery-backed workflows.

## September 9 production-hardening increment

Still pre-beta, not cleared for public production. `mediajob.Store.Complete` now
locks and checks job state before publication. Repeating a ready completion with
the same output URL succeeds without another gallery row; conflicting output or
completion of pending/failed jobs is rejected. Failure only transitions a processing
job, preserves an already-failed result on replay, and cannot overwrite ready media.

Validation: real PostgreSQL tests reproduce duplicate publication before the fix
and exercise completion replay, conflicting completion, invalid transitions, late
failure, repeated failure and missing jobs after it. Tests use session-local copies
of the actual table definitions with a `pg_temp`-only search path, not application
records. This is not a multi-worker crash/lease test or full migration test.

No schema changes, new dependencies, public deployment or account-gate bypass.
The worker still needs fenced leases, reclaim limits, object storage, and crash
reconciliation. Same-output replay does not verify object bytes; immutable,
attempt-scoped object keys and checksums belong to the storage/lease increment.
See [deployment proposal](DEPLOYMENT_PLAN.md) for the proposed hosting split and
approval-dependent choices.

Current working stage (2026-09-08): advanced demonstration / pre-beta, not approved for public production use. Historical percentages below are planning estimates, not a current readiness score. Feature count and passing unit tests do not establish operational readiness.

Latest focused review: signed-in account navigation no longer uses signed-out copy. Media Lab has bounded local analysis and tested distribution algorithms, and the server has upload sanitisation, orientation correction, thumbnails and atomic video publication. These are separate verified slices, not an end-to-end launch audit. Priority gates remain verified email/recovery, worker leases and crash recovery with idempotent completion, delivery-backed notifications/enquiries, backup restoration and retention procedures, and supported-device performance/accessibility testing. The map bundle remains large. Do not imply recent source changes have been deployed merely because tests and builds pass.

## September 8 checkpoint and remaining launch gates

The accumulated map recovery, account presentation, image derivatives and Media Lab work was committed locally as `750ae6c`. It was not pushed or deployed. Validation included the full frontend suite (342 tests at that checkpoint), build/lint, `go test ./...`, `go vet ./...`, race checks for `internal/mediajob` and `internal/httpapi`, and the real FFmpeg encoding-boundary test with small, portrait, 4K, odd-sized and anamorphic fixtures. Existing map bundle and fast-refresh warnings remain. `TEST_DATABASE_URL` was not configured, so this checkpoint does not establish database integration readiness.

Code-backed blockers remain:

- `services/api/cmd/api/main.go` refuses enabled buyer accounts outside development pending email verification and recovery. Keep this gate; do not bypass it to launch.
- `services/api/internal/mediajob/store.go` claims only pending jobs. A worker crash after claiming can leave a processing job stranded. Leases, reclaim rules and idempotent completion need a coordinated schema/worker design and failure-injection tests.
- Saved-search delivery and real viewing/enquiry delivery remain unfinished product integrations, not demonstrated by persistence alone.
- Backup restoration, retention enforcement, production security/accessibility checks and supported-device performance still require evidence before public launch.

The next consequential backend increment should be crash-safe media-job recovery, followed by verified account recovery and delivery-backed workflows. These require explicit design decisions; no production infrastructure or external service has been provisioned by this checkpoint.

## Delivered foundations

- County/local-area discovery, property pages and map links.
- Media galleries, hosted panorama entry and full-window tours.
- Manager authentication, property editing, media upload and preview workflows.
- Browser-local buyer notes and comparisons remain available without an account.
- Account-owned saved homes, saved searches and private property notes, with a deliberate browser-comparison import. Saved-search notification delivery remains future work.
- Browser-local, explainable home matching and a catalogue-derived county index. These decision tools use visible listing facts and make no investment or suitability prediction.
- About, Contact, searchable Help and draft Privacy information routes. Contact identity is deliberately unconfigured pending operator details.
- Services, buyer, seller, accessibility, draft terms and public roadmap pages, plus a demonstration selling-agent directory linked from listings.
- Confirmed deletion of browser-local notes/comparisons from the Privacy page, plus re-authenticated deletion of a buyer identity and its cascading application records. This is not a complete GDPR erasure workflow: uploads, logs, backups and provider copies still need retention and erasure procedures.
- Manager profiles now expose the authenticated email and account identifier. Managers can change their password or revoke every manager session; both actions clear the current session, and password changes verify the existing password first.

## Next product increments, in order

1. Development registration, login/logout and account pages are now verified against the migrated local database. Add verified email, recovery and expiry cleanup before public use. Keep manager and buyer permissions separate; test ownership on every account-owned record. Anonymous notes and comparisons remain browser-local.
2. Extend the delivered account-owned saved homes, direct property-page save control, saved searches and private notes into viewing history and real alert delivery. Browser comparison import is explicit rather than automatic.
3. Real viewing requests, staff availability, email delivery, cancellation and status tracking. Saved searches persist criteria but do not send notifications; viewing requests remain demonstrations.
4. Verified contact channel and enquiry delivery with anti-abuse controls and data-minimising forms. Replace the demonstration Services, buyer and seller guidance with operator-approved offerings and support routes.
5. Terms of use, finalized Privacy and cookies/storage information, and accessibility statement based on an actual audit. Unknown frontend routes now have a useful not-found view; production hosting/status behavior still needs verification.
6. Optional assistant only after a provider/data review: grounded help answers, visible AI disclosure, no private notes by default, minimal retention, human escalation and no invented property/legal/financial advice. Searchable Help is the current non-AI alternative.

## Privacy launch gates — not complete

- Identify controller/legal name and public rights-request contact; establish lawful basis for each processing purpose.
- Inventory cookies, local storage, hosting logs, media, maps and external providers; assess which storage/access requires prior consent. Configured Google Maps currently loads automatically.
- Record retention periods and enforce deletion, including uploads, logs, sessions and backup lifecycle.
- Review processor contracts, international transfers and security controls. Verify third-party iframe/SDK behavior in each supported production browser.
- Implement and test access/export/correction/deletion workflows with identity verification and timely responses.
- Document breach handling and assess whether a DPIA is required. Conduct security and accessibility checks before public launch.
- Review notices against actual processing, not planned capabilities. Do not market the demonstration as GDPR-compliant.

## Selling-agent identity boundary — demonstration only

Property pages now identify a sample selling-agent profile and link to a public directory so the buyer-facing information architecture is testable. These profiles are explicitly marked as demonstrations and do not publish invented phone numbers, email addresses or regulatory licence numbers. Before launch, replace this local directory with verified agent records owned by the API, add staff assignment and audit history, and require operator review before an identity becomes public.

## Public information and agent increment — 2026-09-05

- Services, buyer, seller, accessibility, draft terms and roadmap pages are routed, deep-linkable and covered by frontend tests.
- The agent directory, individual profile routes and county-to-agent presentation are visible in the running browser; the property page exposes the assigned profile and viewing action in one labelled region.
- Frontend: 188 tests across 29 files passed, the production build passed, and lint passed with the three existing map fast-refresh warnings. The build still reports the previously known large map and administrative-area chunks.
- No deployment, database mutation, real contact publication or external provider change was made. The 58% estimate remains a planning measure, not a legal, security, accessibility or launch certification.

Authoritative starting points: [DPC transparency guidance](https://www.dataprotection.ie/en/individuals/know-your-rights/right-be-informed-transparency-article-13-14-gdpr), [DPC self-assessment](https://www.dataprotection.ie/en/organisations/resources-organisations/self-assessment-checklist), and [DPC cookies guidance](https://www.dataprotection.ie/sites/default/files/uploads/2020-04/Guidance%20note%20on%20cookies%20and%20other%20tracking%20technologies.pdf).

## Visual/performance follow-up

The cover/upload backing decorations have been removed. The concept illustration itself remains a labelled example. Information pages reuse existing typography and semantic light/dark colors, restrained underlines and responsive layouts. Public pages now share direct navigation, with a separate account menu and responsive property-section offsets. Detailed map bundles remain large and need real-device performance checks and per-county loading.

## Verified navigation increment — 2026-09-04

- Headless Chromium checks at 320, 375, 768, 1024 and 1440px: all primary links visible, no horizontal page overflow, sticky header correctly positioned. Desktop and mobile screenshots reviewed.
- Direct Contact/Help navigation, current-page indicator, keyboard sign-in menu/Escape focus return, light/dark switching and reduced-motion switching passed.
- Unknown route recovery and property rendering with malformed browser notes passed. Rejected storage writes now retain the note draft and offer an error/retry path; browser retry passed with zero uncaught errors in the checked flow.
- Frontend: 146 tests across 24 files passed, the production build passed, and lint passed with three existing map fast-refresh warnings. Build still reports large map chunks.
- API: `go test ./...` and `go vet ./...` passed. The client-account flow was also verified against the migrated local database as recorded below. Database-backed property tests, including the migration `000007` single-panorama constraint, were skipped in the final clean run because `TEST_DATABASE_URL` was unavailable; the migration was inspected but still needs an integration run.
- No deployment or live data changes were made. Formal design-review/QA commit workflows were paused because the workspace contains uncommitted work; these are focused checks, not a full security, accessibility or production-readiness audit.

## Local client login activation — 2026-09-04

Migration 000005 was applied to the local development database and a separate loopback API/web pair runs at ports 8083/5177. Existing processes were left untouched. A reusable local API launcher verifies the schema and enables development-only client accounts. Live browser registration, login, reload, logout revocation, wrong-password rejection, foreign-origin rejection and manager isolation passed. The client-store PostgreSQL integration test, eight frontend auth tests, frontend build, Go tests and Go vet passed. One generated test-client record remains in the local database. These checks do not complete the privacy, recovery, verified-email or public-launch gates above.

## Account-owned property notes — 2026-09-05

- Migration 000008 adds buyer- and property-scoped private notes with cascading account/property deletion, bounded note and question storage, and no sharing field.
- Authenticated note reads and writes derive ownership exclusively from the revocable client session. Same-origin mutation checks, strict JSON decoding, published-property checks and input limits apply before storage. Anonymous or temporarily unavailable account services keep the existing browser-local flow usable.
- A browser note is not described as synced until the buyer explicitly saves it while authenticated. Successful account storage removes the stale browser copy on a best-effort basis.
- The local database is at migration 8. Frontend 213/213 tests, the production build, lint, all Go tests, Go vet, and the full PostgreSQL-backed suite passed. Lint retains the three known map fast-refresh warnings and the build retains the two known large map/data chunk warnings.
- A two-session local API check registered a temporary buyer, wrote a private note in one session and read it in a separately authenticated session. All requests succeeded and the temporary account was removed afterward. This validates local behavior, not public-launch security, recovery, retention or privacy readiness.

## Account-owned saved searches — 2026-09-05

- Migration `000009` stores buyer-owned catalogue criteria and alert cadence with cascading account deletion and a 50-search limit. It was applied to the explicitly configured loopback development database.
- Create, list and delete routes derive ownership only from the revocable client session, require same-origin mutations, reject unknown or invalid fields, and do not expose or accept an owner identifier.
- The catalogue saves the active geography, query, bedroom, property-type, price and 360° filters. The buyer account can load, revisit and remove saved searches. Notification delivery is explicitly not enabled.
- Frontend 220/220 tests, the production build, lint, all Go tests and Go vet passed. The PostgreSQL ownership test and a temporary-account live API create/list/delete flow also passed; the temporary account was removed. Existing map fast-refresh and large chunk warnings remain.

## Buyer account data export — 2026-09-06

- Signed-in buyers can download a no-cache JSON export from the account page. It contains account identity, saved-property identifiers, saved searches and private property notes.
- The server derives the export owner from the revocable HttpOnly session. Password hashes, raw passwords, session tokens, session hashes and authentication rate-limit records are excluded by contract.
- API contract tests, the real PostgreSQL cross-account ownership test, all Go tests, Go vet, the client-page tests, production build and lint passed. A temporary-account live download against the isolated `8085/5179` pair returned the attachment and expected private records; the temporary account was removed.

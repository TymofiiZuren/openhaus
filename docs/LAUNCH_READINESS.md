# OpenHaus launch readiness

Working estimate: approximately 58% of the planned public product, based on the product roadmap and implementation review, not an audited score or legal certification.

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

# OpenHaus launch readiness

Working estimate: approximately 55% of the planned public product, based on the product roadmap and implementation review, not an audited score or legal certification.

## Delivered foundations

- County/local-area discovery, property pages and map links.
- Media galleries, hosted panorama entry and full-window tours.
- Manager authentication, property editing, media upload and preview workflows.
- Browser-local buyer notes and comparisons.
- Account-owned saved homes with a deliberate browser-comparison import; account-owned notes and searches remain future work.
- About, Contact, searchable Help and draft Privacy information routes. Contact identity is deliberately unconfigured pending operator details.
- Confirmed deletion of browser-local notes/comparisons from the Privacy page. This is not server-side account deletion or a complete GDPR erasure workflow.

## Next product increments, in order

1. Development registration, login/logout and account pages are now verified against the migrated local database. Add verified email, recovery and expiry cleanup before public use. Keep manager and buyer permissions separate; test ownership on every account-owned record. Notes and comparisons currently remain browser-local.
2. Extend the delivered account-owned saved homes and direct property-page save control into account-owned notes, searches and viewing history. Browser comparison import is explicit rather than automatic.
3. Real viewing requests, staff availability, email delivery, cancellation and status tracking. Current viewing and saved-search forms are demonstrations.
4. Verified contact channel and enquiry delivery with anti-abuse controls and data-minimising forms. Add Services and a buyer guide once the offered services are confirmed.
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

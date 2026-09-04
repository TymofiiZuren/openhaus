<!-- /autoplan restore point: /Users/thomas/.gstack/projects/TymofiiZuren-openhaus/feat-manager-auth-autoplan-restore-20260902-142956.md -->

# OpenHaus design and product roadmap

Status: living implementation plan
Last updated: 2026-09-04

## Product position

OpenHaus should scale as a property decision workspace, not as a conventional listing feed. The core product promise is that location, photography, film, measured plans, 360-degree media, finance, environmental context, notes and viewing actions remain attached to the same home.

The public experience serves buyers. The staff workspace serves agents, photographers and listing managers. Both should use the same property, media and location contracts so new channels do not require a parallel content model.

## Research translated into product decisions

- Zillow Showcase connects interactive plans, room imagery and exterior context. OpenHaus should therefore let a room, plan region and media item reference one another rather than presenting disconnected galleries. See [Zillow Showcase](https://www.zillow.com/news/zillow-showcase-brings-listings-to-life/) and [Zillow interactive floor plans](https://www.zillow.com/3d-home/floor-plans/).
- Matterport supports guided tours, tags, measurement, audience-specific views and schematic plans. OpenHaus should model these as optional media capabilities, not assumptions baked into the page. See [Matterport digital twin features](https://matterport.com/en-gb/digital-twin-features).
- Rightmove keeps search criteria editable from the results surface. OpenHaus should preserve location and filters while buyers inspect media, save searches or return from property detail. See [Rightmove search guidance](https://faq.rightmove.co.uk/support/solutions/articles/7000048777-how-to-start-your-search-on-rightmove).

## Experience architecture

### Layer 0 — atmospheric background

Use warm paper texture, sparse dot fields, broad clay-coloured light blooms, occasional technical grid fragments and restrained handwritten annotations. Script typography is decorative editorial notation only: never use it for controls, prices, property facts or essential headings. Decoration must never sit behind dense text, maps, charts or form controls. Effects are CSS-only, pointer-inert, low contrast and removed or simplified under reduced motion and constrained devices.

### Layer 1 — durable navigation and context

The header, location selection, active filters and buyer-workspace entry remain predictable. County and area choices are URL-addressable. Account-saved homes survive navigation and devices; comparisons, notes and sample searches currently remain browser-local.

### Layer 2 — primary working surfaces

- Explore: map, grouped supply counts, location hierarchy and filters.
- Catalogue: equal-size media, property facts, shortlist and comparison actions.
- Property: spatial media, financial context, notes, questions and viewing request.
- Staff: listing pipeline, media completeness, publishing checks and enquiry activity.

### Layer 3 — overlays and popups

Use overlays only for short, reversible tasks that preserve page context: save search, add a note, compare homes, request a viewing, inspect a room tag and confirm publication. Longer workflows belong on routes.

Overlay contract:

- one shared overlay root above the site shell;
- labelled dialog semantics and modal state;
- visible focus, initial focus and Escape/backdrop dismissal;
- 44px minimum controls and no hover-only actions;
- mobile bottom-sheet layout, desktop edge panel;
- no important information hidden exclusively inside a popup;
- URL-backed overlays only when the content is shareable or restorable.

## Scalable domain model

The next API contract should separate these resources:

1. `Property` — identity, address, geometry, facts, price and publication state.
2. `MediaAsset` — image, video, panorama, plan, model or document with dimensions and processing state.
3. `Space` — floor, room, exterior zone or site area.
4. `MediaLink` — connects an asset to a space, plan coordinate, panorama heading or sequence.
5. `Insight` — finance, market, energy, transport, school or environmental metric with source and freshness.
6. `SavedSearch` — location geometry, filters, cadence and delivery channel.
7. `ShortlistEntry` — user, property, status, note and comparison group.
8. `Viewing` — participants, proposed times, status and staff owner.
9. `ListingTask` — staff checklist item, owner, deadline and evidence.
10. `AuditEvent` — actor, action, entity and timestamp for publication trust.

Every derived or illustrative value must carry `source`, `observedAt`, `confidence` and `isIllustrative` where appropriate.

## Staff workspace

The staff surface should grow around a listing pipeline rather than a generic dashboard:

- Draft → media capture → review → published → under offer → archived.
- Completeness score covering facts, coordinates, alt text, plans, video and 360 media.
- Media processing queue with failure/retry states.
- Plan and room-tag editor using the same `Space` and `MediaLink` records the buyer sees.
- Enquiry and viewing inbox grouped by property.
- Publication preview at desktop, tablet and mobile widths.
- Role boundaries for manager, editor, photographer and viewer.
- Audit history for price, status and content changes.

## Analytics and finance

Phase analytics should remain decision-support rather than financial advice:

- monthly payment scenarios with editable deposit, term and rate;
- price per square metre against a clearly named benchmark;
- listing supply and days-on-market distribution;
- energy rating and estimated improvement opportunities;
- commute scenarios and proximity bands;
- comparison table for 2–4 shortlisted homes;
- visible source, timestamp and explanatory fallback for every chart.

Use compact line and bullet charts. Never encode good/bad with colour alone. A text/table equivalent must accompany interactive chart detail.

## Delivery phases

### Phase A — interaction foundation (current)

- [x] County/area discovery and grouped map markers.
- [x] Consistent property media slider and plans.
- [x] Spatial-media showcase and illustrative analytics.
- [x] Reusable visual overlay treatment.
- [x] Contextual saved-search prototype.
- [x] Focus-managed reusable overlay foundation shared by saved search and comparison.
- [x] Persist county and area selection in the URL and browser history.
- [x] Split the 271 KB administrative-boundary dataset from the application entry bundle.
- [x] Defer the spatial-media and market-intelligence showcase until it approaches the viewport, with a stable reserved layout.

### Phase B — buyer workspace

The development account foundation keeps buyer identity and sessions separate from manager accounts. Registration, sign-in/sign-out, database-backed expiring HttpOnly sessions, generic credential responses, shared-database rate limiting and ownership-protected saved homes are implemented and tested. Buyers never inherit listing-edit or media-upload permissions. Anonymous browsing remains available, and importing the browser comparison is explicit. Email verification, recovery, expiry cleanup, account export/deletion, saved searches and private notes remain required before public account launch.

- [x] Development-only buyer registration, session restoration and sign-out.
- [x] Account-owned saved homes with explicit browser-comparison import.
- Saved searches backed by authenticated accounts.
- [x] Local MVP shortlist and four-home comparison tray.
- Persist shortlist and comparison groups for authenticated accounts.
- [x] Local MVP notes and viewing questions per property with browser persistence.
- Persist notes and questions for authenticated accounts with optional sharing.
- [x] Local viewing-request overlay prototype with sample availability and no personal-data persistence.
- Connect viewing requests to authenticated buyers and live staff availability.
- Notification preferences and alert history.
- [x] Privacy-first catalogue concierge that translates natural-language buyer briefs into existing filters and grounded listing matches without sending prompts to a third party.
- Provider-backed assistant only after a documented data-processing, retention, disclosure and evaluation review; the local catalogue remains the deterministic fallback.

### Phase C — spatial media

- [x] Provider-neutral, lazy-loaded native panorama/embed viewer foundation.
- Extend the viewer contract with provider IDs, poster media, room links and processing state from the API.
- Room/plan/media relationship model.
- Hotspots, measurements and guided tour chapters.
- Processing states, privacy blur and non-3D fallback.

### Phase D — staff operations

2026-09-03 visual increment: shared Light / Dark / System appearance control on public and staff headers, browser-local preference persistence, cross-tab updates, and system-colour tracking. Dark mode uses charcoal surfaces and warm clay accents; images, floor plans and third-party map/tour content retain their original colours. Manager toolbar fields now align on a shared grid and collapse on mobile, summary metrics use quieter separators, and the sign-in page has a two-column introduction/form layout. Failed sign-in retains the form; password visibility and pending feedback are available. No client authentication or database changes are included in this increment.

- Listing pipeline and completeness scoring.
- Media upload/processing queue.
- Room and plan linking tools.
- Enquiry/viewing management.
- Publication preview, roles and audit events.

Implemented staff increment: listing readiness now expands into the eight checks behind its score, with missing-content guidance and a property-facts edit action. Saved 360° media can be previewed inside the manager workspace, including draft listings, using the shared consent-based viewer. Completed video processing refreshes saved video media and readiness without reloading the workspace; a failed refresh can be retried without uploading again. This does not publish a listing or verify its content. Dashboard JPEG/PNG photography and floor-plan upload, saved previews, cover selection and photo ordering are implemented; see [Manager images](MANAGER_IMAGES.md) for limits and verification. Authenticated publication preview now reuses the public property page at desktop, tablet and mobile widths; see [Publication preview](PUBLICATION_PREVIEW.md). Fine-grained roles, audit events and live signed-in visual QA remain pending.

### Phase E — intelligence

- Sourced market series and comparable-home selection.
- Mortgage scenarios and affordability guardrails.
- Energy, commute and neighbourhood datasets.
- Portfolio-level staff analytics.

## Technical boundaries

2026-09-03 route-loading increment: public and manager entry points load on demand. The initial public route no longer imports manager tools. A shared, theme-aware loading state and error boundary provide a full-page reload and home link if a route fails to load. Manager authentication remains unchanged; splitting the bundle is a performance boundary, not an authorization mechanism. Route tests cover public/staff selection, loading feedback and failure recovery. Shared property presentation is still reused by staff preview.

- Keep route-level features lazy-loaded; map, staff and immersive viewers must not inflate the initial catalogue bundle.
- Treat large geographic and media datasets as independent cached chunks. UI code may depend on a small typed adapter, but should not statically import the source payload into the entry route.
- Use capability adapters for Google Maps and future 360/model providers.
- Store media metadata in the API; serve large assets from object storage/CDN with responsive formats.
- Use optimistic UI only for reversible buyer actions. Publication and staff workflow changes require server confirmation.
- Preserve loading, empty, error, stale and success states at every data boundary.
- Add contract tests before changing API shapes and browser tests for every critical overlay workflow.

## Next implementation sequence

1. [Complete] Reuse the focus-managed overlay foundation for saved search, comparison, notes and viewing flows.
2. [Complete] Add browser-local shortlist state and a bottom comparison tray limited to four homes.
3. [Complete] Deep-link county and area state.
4. [Foundation complete] Define provider-neutral panorama and spatial-link contracts.
5. Build the staff listing pipeline against those contracts.
6. Replace illustrative analytics one source at a time, always exposing provenance.

## Spatial viewer contract

The web viewer currently accepts two deliberately small source variants:

- `native`: an image URL, title, alt text and optional initial heading. It supplies drag, arrow-button and keyboard interaction without a third-party runtime.
- `embed`: an HTTPS provider URL and title rendered in a lazy, sandboxed iframe with fullscreen and spatial-tracking capability.

The UI depends on this local contract rather than Matterport-specific parameters. A future API adapter may map Matterport, Kuula or another hosted-tour record into `embed`, while first-party panoramas map into `native`. Provider authorization, allowed-host validation and signed embed URLs belong at the server boundary before external URLs are accepted from staff input.

## Production 360-degree implementation plan

The current native viewer is an accessible flat-image interaction prototype, not a spherical renderer. Production delivery should use this sequence:

1. **Hosted launch — Kuula.** Store a validated Kuula share identifier as provider metadata and render it through the lazy embed adapter. Kuula is an interchangeable delivery provider; OpenHaus owns the room, plan, note, comparison and enquiry context around the tour. Kuula documents HTTPS share-link validation, responsive iframe embeds and device-orientation/VR permissions: <https://kuula.co/help/embed-integration>.
2. **Digital twins — Matterport.** Add Matterport for listings with an existing model, or agency volume that justifies capture and SDK costs. Keep it behind the same capability boundary; use the Embed SDK only when guided navigation, Mattertags, dollhouse or floor-plan control creates measurable value: <https://matterport.github.io/developer-docs/>.
3. **Self-hosted escape hatch.** Marzipano was archived on 20 April 2026 and is no longer a candidate. Evaluate Photo Sphere Viewer or Pannellum only when vendor cost, privacy, branding, offline access or media ownership becomes a demonstrated constraint. Acceptance requires active maintenance, touch and keyboard support, multiresolution delivery, hotspots, React compatibility, measured bundle impact and a suitable commercial licence.

The API record for a tour should include `provider`, `providerAssetId`, `processingState`, `posterUrl`, `projection`, dimensions, room links, hotspots, source, timestamps and an illustrative flag. Never accept an arbitrary embed URL from staff input: normalize provider IDs on the server and construct URLs from an allowlist.

Implementation slices:

- [x] Provider-neutral native/embed boundary, lazy loading and keyboard controls.
- [x] Processing/error presentation and room-to-heading navigation metadata.
- [x] Kuula URL normalization and allowlisting at both API and buyer-view boundaries.
- [~] Persisted spatial media: property-linked panorama records and contract tests shipped; room/space entities remain future work.
- [x] Kuula adapter, manager attach/replace/remove workflow and illustrative tour across seeded demonstration listings.
- [x] Dedicated full-window property tour with browser-fullscreen, viewing action and property-to-map deep linking.
- [ ] Approved spherical renderer integration for self-hosted 2:1 equirectangular images.
- [ ] Hotspot-to-room and hotspot-to-floor-plan navigation.
- [ ] Multiresolution derivatives, privacy blur, poster generation and retryable processing jobs.
- [ ] Browser QA for pointer, touch, keyboard, reduced motion, WebGL fallback and constrained networks.

### Reviewed delivery sequence

The first production slice is manager attach → server normalization → preview → publish → consent-based buyer load → engagement event → removal. A hosted iframe is not the product outcome; the differentiator is that every room stays connected to verified plans, property facts, financial context, notes and viewing actions.

Release gates: arbitrary hosts and unsafe schemes rejected; CSP `frame-src` restricted to configured providers; a poster and non-third-party fallback remain usable; tour failures do not block the listing; manager attach success and time-to-publish are measured. Within 30 days, compare tour entry, room navigation and enquiry conversion against listings without tours before funding hotspots, measurements or self-hosted processing.

## Success measures

- Search-to-property-open rate.
- Property-open-to-media-completion rate.
- Saved-search and shortlist creation rate.
- Viewing-request completion rate.
- Percentage of published listings passing media/fact completeness.
- Staff time from draft to publish.
- Core Web Vitals and accessibility regressions by release.

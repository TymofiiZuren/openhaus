# Changelog

## [0.1.0.0] - 2026-09-04

### Added

- Client registration, sign-in, session handling, and private saved-property collections.
- Public information, contact, help, privacy, and account routes with a consistent responsive header.
- Fast indexed property search, improved county and local-area exploration, and more precise Ireland boundary data.
- Manager photography, floor-plan, video, and 360-degree tour workflows.
- A catalogue-grounded OpenHaus Guide, property matching, selling-agent profiles, and manager portfolio analytics.
- Authenticated manager account profiles with email, identifier, password changes, and all-session sign-out.

### Changed

- Refined the property map, listings, galleries, navigation, theme transitions, responsive layouts, and motion system.
- Improved map failure states so unavailable providers no longer expose a broken fallback surface.
- Preserved listing media through manager edits and made cover previews consistent across listings.
- Reworked the public discovery and listing surfaces into a faster black/white product system, with stable media heights, clearer slider controls, and borderless Guide/account layouts.

### Fixed

- Removed orphaned image files when a database attachment fails.
- Serialized panorama replacement and enforced one panorama per property at the database layer.
- Kept comparison controls usable when browser storage is unavailable.
- Required a valid manager identity before rendering authenticated workspace navigation and removed placeholder profile values.

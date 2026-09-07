# Manager photos and floor plans

In the manager dashboard, each listing has a **Photos & floor plans** section. Choose Photo or Floor plan, enter an image description, choose a JPEG/PNG, and upload. Saved images appear as thumbnails; click one to open the full image. The first photograph in the media order is the cover. Use Make cover or Earlier/Later to save a new photo order. Changes to published listings are immediately public; uploading does not change publication status.

Limits: one image per request, 10 MiB input, 24 million pixels, description up to 500 characters. PDFs, SVGs, HEIC and WebP are not supported by this increment. Images are decoded and re-encoded as PNG before storage. This strips embedded metadata but can increase JPEG storage size.

Use **Edit description** under any saved photo or plan to correct its label without re-uploading. Save updates the database and gallery; Cancel leaves the saved description unchanged. Failed saves preserve typed text for retry. The server enforces a 500-byte UTF-8 description limit. Descriptions are also used as image alternative text; describe the room or view rather than repeating the filename.

## API and storage

- `POST /api/v1/manager/properties/{id}/images`: authenticated multipart fields `image`, `kind` (`image` or `floor_plan`), `description`; returns saved media.
- `PUT /api/v1/manager/properties/{id}/image-order`: authenticated JSON `{ "urls": [...] }` containing every photograph exactly once; returns all media in saved order. Invalid/stale lists return 409. Non-photo media retain their relative positions.
- `PATCH /api/v1/manager/properties/{id}/image-description`: authenticated JSON `{ "url": "/photo.png", "description": "Garden entrance" }`; updates only matching photos/plans belonging to that property. Returns the saved media item. Order and publication status are unchanged.
- `/api/v1/property-images/{name}` serves an uploaded image only while its listing is published.
- `/api/v1/manager/property-images/{name}` serves previews behind manager authentication, including drafts.

Files live under `MEDIA_SOURCE_DIR/images`, defaulting to `.data/uploads/images` relative to the API working directory. Preserve this directory across restarts and deployments; back it up alongside the database. No image-specific schema migration or new dependency is required. Do not expose this directory as a public static directory: the API enforces draft privacy.

Remaining work: image deletion, bulk uploads, responsive image derivatives, object storage, and periodic reconciliation for files orphaned by crashes or manual database changes. If database attachment fails during a normal upload, the API removes the newly written file. Reordering and publication use existing manager permissions, not per-listing ownership.

Verification covers image sanitization, authenticated upload/preview, public draft denial, cleanup after attachment failure, persisted database ordering and duplicate-order rejection, and frontend upload/order callbacks. Browser-native file selection and visual layout still need manual QA.

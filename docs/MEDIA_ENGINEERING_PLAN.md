# Media engineering: a demonstrable portfolio plan

## Design boundary

Use neutral white/grey and charcoal for the main surfaces. Reserve champagne for selective emphasis, not page-wide ivory washes. Keep images and controls stationary during interaction. Any diagnostic visualization must represent real data and explain its limitations.

## Working foundations, verified against code

- React/TypeScript, lazy route loading and the shared account/navigation system.
- Trigram candidate indexing plus exact county recognition in `propertySearch.ts`.
- Go authenticated image decode/re-encode and protected draft previews; see `MANAGER_IMAGES.md`.
- Go video worker invokes FFmpeg for 30 fps, 1920px-wide H.264/AAC MP4 with fast-start metadata. This currently scales every input to that width, including smaller inputs; avoiding upscaling is follow-up work.
- PostgreSQL queue claims use `FOR UPDATE SKIP LOCKED`. Claiming exists; robust stale-job recovery, progress reporting and operational metrics must not be advertised as complete without further verification.
- `/media-lab`: Canvas sampling, transferable RGBA buffers, a dedicated TypeScript Worker, 32-bin luma histogram and 3×3 Sobel edge magnitude. O(width × height) time and memory, bounded to a 640px-wide sample in this UI. Source algorithm caps input at one megapixel. No third-party analysis upload. This demo is not yet wired into manager upload validation.
- Six generated JPEGs and three 7-second H.264/24 fps dissolve sequences across three fictional packs. They are concept assets, not real listing photography, video capture or reconstructed 3D.
- Go `media-audit`: box-averaged dHash, BK-tree Hamming-radius candidate retrieval, SHA-256 identity and a versioned JSON report consumed by Media Lab. Offline only; manager-upload integration remains future work. See `SHOWCASE_MEDIA.md` for limits and tests.

## Delivery order and acceptance evidence

### 1. Media Lab — implemented first slice

Make processing visible without invented quality scores. Show histogram, near-black/near-white counts, edge view, sample dimensions and compute-only duration. Keep sample changes cancellable by terminating the previous worker; show decode/worker errors. Test flat fields, contrasting edges and invalid buffers. Visually check the worker and controls in a real browser.

Versioned JSON report export is implemented, including sample identity, dimensions, histogram, metrics and limitations without the large pixel buffer. Remaining: local-file analysis with bounded decode dimensions and explicit privacy copy; RGB channels; measured main-thread versus worker comparison. Do not interpret edge strength as calibrated sharpness or clipping counts as proof of missing detail.

### 2. Connect the actual services

Add manager-upload media diagnostics as advisory metadata, calculated server-side as the authoritative result. Preserve the original asset and existing publication permissions. Store algorithm version, source hash, sample dimensions and processing timestamp. Client previews may be quick estimates, never publication gates.

Implemented reliability slice: FFmpeg writes to a unique staging file on the output filesystem and publishes by atomic rename only after successful encoding and a nonempty regular-file check. Encoding has a 20-minute deadline. Encoder output is discarded rather than buffered or leaked into logs; failures retain process exit/context errors. Cancellation records a sanitized failed state using a separate five-second database context, and removes staging output. Successful publication uses a separate five-second completion context. Source deletion still happens only after confirmed completion.

Failure boundary: this is atomic file visibility, not a filesystem/database transaction or crash recovery. If database completion is uncertain, source and published output are retained and the error is surfaced; do not mark failed or delete potentially committed media. A process crash can still leave processing jobs and staging files. Disk quotas, stale artifact reconciliation, no-upscale encoding and authoritative media probing remain open.

Next extend the pipeline with stage-specific progress, retry policy, lease/heartbeat and stale-job recovery. Test duplicate claims, worker crashes and idempotent completion before adding more workers. Begin with polling; consider Server-Sent Events for progress only after the job contract is stable. No new broker is needed just to demonstrate concurrency.

Validation: `go test -race ./internal/mediajob` covers atomic publication, empty output, cancellation cleanup, sanitized failures and uncertain database completion. Set `MEDIA_TEST_VIDEO` to an absolute local video path to additionally run a real FFmpeg encode and decode the entire output. The fixture is copied; the original is never consumed. Download follow-up: authenticated range requests, resumable client downloads and content-integrity checks must preserve draft-media access controls; arbitrary remote URL downloading needs an explicit SSRF-safe source policy first.

### 3. Strong photo/video algorithms

- Aspect-preserving responsive image derivatives, measured byte savings and quality comparisons. Do not replace originals with PNG for every JPEG.
- Representative video posters and contact sheets using FFmpeg's thumbnail/scene filters. Persist timestamps and expose a keyboard-accessible filmstrip.
- Perceptual duplicate detection: dHash with Hamming-distance candidates, followed by visual review. Label false-positive risks from crops and similar rooms.
- Laplacian variance as a detail heuristic, evaluated on a labelled test set. Do not call it an absolute blur score across resolutions or image subjects.

### 4. Reproducible showcase inventory

Implemented three fictional packs with stable IDs, explicit demo titles and not-for-sale addresses, provenance, two images and a slideshow each. A loopback-only insert-only seed supports dry-run rollback and preserves the existing 26 records. Re-running inserts zero records. Independently generated interiors/exteriors are thematic concepts, not verified geometric matches. No invented floor plans were added. More extensive room sets and authoritative media metadata remain future work.

### 5. Lower-level acceleration only when justified

Benchmark TypeScript Worker first. A Rust/WASM implementation of the same Sobel or perceptual-hash kernel is a good comparative exercise when it uses the identical fixtures and accounts for copying/initialization overhead. Add SIMD only after measuring the baseline. WebGPU compute is a later option for batch image kernels, with feature detection and CPU fallback; it is not a reason to make ordinary navigation GPU-dependent. OpenCV is useful for calibrated experiments and richer vision tasks, but not required for this small kernel.

## Employer demonstration

Walk through: choose a sample → inspect real diagnostics → inspect tested kernel → upload to a development listing → trace an actual job through queued/processing/complete → compare source/output size, duration and quality. Clearly distinguish the browser lab from the production-oriented server path. Show failed-job recovery and auth tests, not only the happy-path video.

Record repeatable p50/p95 timings with hardware, browser, sample dimensions, warmup count, algorithm version and inclusion/exclusion of decoding. Publish actual results only. No invented speedup, AI claims or processing badges.

## Primary references

- [MDN: transferable objects](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects) — transferable ownership, including detached source buffers.
- [MDN: OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas) — possible future off-main-thread canvas rendering; not used in the first slice.
- [FFmpeg filters](https://ffmpeg.org/ffmpeg-filters.html) — thumbnail, select/scene and transform filters.
- [OpenCV image gradients](https://docs.opencv.org/4.13.0/d5/d0f/tutorial_py_gradients.html) — Sobel, Scharr and Laplacian derivatives.

No additional production dependencies or paid services were installed for this first slice.

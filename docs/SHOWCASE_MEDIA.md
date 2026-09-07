# Fictional catalogue and media similarity audit

## What is connected

Three labelled demonstration homes use the existing PostgreSQL → Go property API → React catalogue path. Each has two generated concept JPEGs and one seven-second H.264 still-image sequence. The prior 26 listings are preserved. New titles begin “Demo listing”; addresses say “Fictional concept — not for sale”. Coordinates and asking prices are illustrative. These are not verified exterior/interior reconstructions or filmed walkthroughs.

The Go `media-audit` command reads local JPEG/PNG assets and produces `audit-v1.json`. Media Lab requests this file over HTTP and displays the selected image's fingerprint, candidate matches and SHA-256 file identity. This is a versioned offline report, not a live analysis API, and manager uploads do not yet update it.

## Reproduce safely

From the repository root:

```sh
bash scripts/build-showcase-videos.sh
bash scripts/seed-showcase.sh --dry-run
bash scripts/seed-showcase.sh --apply
```

The seed launcher uses local `.env` configuration without printing credentials, rejects non-loopback hosts, checks required assets, and defaults to a rolled-back transaction. Import uses insert-only IDs. Existing properties and their media are not changed, even if a demo property was edited. Never run older seeds as a substitute: some overwrite existing data.

From `services/api`, generate a new report filename:

```sh
go run ./cmd/media-audit -input ../../apps/web/public/media-demo -output ../../apps/web/public/media-demo/audit-v2.json
go test -race ./internal/mediafingerprint ./cmd/media-audit
```

The tool refuses to overwrite output. Updating the UI to another report filename is an explicit versioned change. Image decoding is bounded to 10 MiB / 24 megapixels and 1000 input files. Symlinks/nonregular image entries are rejected. This is an offline trusted-directory tool, not an upload endpoint or a sandbox against concurrent filesystem mutation.

## Algorithmic substance

1. Box-average all source pixels into a 9×8 grayscale grid: O(width × height) time, constant scratch space.
2. Compare each horizontal neighbour to produce a 64-bit dHash (`dhash-box-v1`).
3. Index hashes in a BK-tree; retain separate file IDs for equal hashes.
4. Query radius eight using Hamming distance and triangle-inequality pruning. Results are sorted by distance then stable file ID. Query performance depends on the dataset; worst-case remains O(n). No speedup is claimed from six samples.
5. Compute SHA-256 separately for exact file identity. Perceptual similarity is not cryptographic identity.

Tests compare BK-tree queries against exhaustive search at radii 0, 1, 8, 32 and 64, including equal hashes. CLI tests verify identical-file candidates, invalid-image rejection and overwrite protection. The current six generated photographs have no candidates within eight bits; the UI reports that honestly rather than fabricating matches. Similar rooms, flat images and cropping can produce false positives/negatives. No automatic deletion or publication decision uses the result.

## Next integration boundary

For live manager diagnostics, put analysis behind authenticated uploads and persist algorithm version, file hash and dimensions with the asset; invalidate reports when media changes. Keep bounded worker concurrency and introduce lease-based recovery before distributed processing. Resumable downloads need authenticated range requests and integrity checks. External provider imports need an explicit approved source, credentials held server-side, rate limits and an SSRF-safe fetch policy; none are enabled here.

Generated-image prompts and provenance: `apps/web/public/media-demo/PROVENANCE.md` and `EXPANSION_PROVENANCE.md`. Built-in image generation was used; no new production dependency or third-party account was installed.

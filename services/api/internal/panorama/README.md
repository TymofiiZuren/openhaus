# Native panorama adapter

`Convert(ctx, executable, encoded, face, size)` decodes a JPEG or PNG panorama,
runs the C++ projector with raw RGB24 on stdin, validates its exact PPM response,
and returns a JPEG face. Only Go standard-library packages are used.

The executable is trusted operator configuration, not a client parameter. The
function does not write files, publish media, or modify database records.
`WriteBundle` uses it sequentially for six faces, writing a private local bundle
and a versioned manifest with SHA-256 checksums. No HTTP endpoint or queue
consumer calls it yet. Existing Kuula tours are unchanged.

## Local bundle command

Build the native executable as described in `services/panorama/README.md`.
Then, from `services/api`:

```sh
go run ./cmd/panorama -native ../../.scratch/panorama/convert -input /absolute/path/panorama.jpg -output ../../.scratch/my-tour -size 1024
```

Use a new output path whose parent exists. The command never overwrites an
existing destination. It checks the face-size range and native executable
availability before reading the input or creating output. These setup checks
do not establish trust in the executable; use only your own compiled converter.
It creates that directory with owner-only permissions,
converts in private staging, verifies the complete bundle, then renames it to `bundle/`.
Only `bundle/manifest.json` signals readiness. Normal errors clean up the staging
directory. Cleanup failures are returned alongside the original error, preserving
`errors.Is` checks such as cancellation. An unexpected file in the output root
is not recursively deleted; the cleanup error explains why that path cannot be
reused yet. Abrupt termination may leave a private `.pending-*` directory. No
crash recovery or power-loss durability guarantee is provided. Files are local,
not publicly served or uploaded. Ctrl-C cancels; the command has a three-minute
overall deadline, subject to the synchronous codec limitation below.

Verify a completed bundle without changing any files:

```sh
go run ./cmd/panorama -verify ../../.scratch/my-tour/bundle
```

Verification is a separate mode: do not combine `-verify` with conversion
flags, including an explicitly supplied `-size`.

Verification checks manifest version/projection, exactly six distinct known
faces, fixed local filenames, byte counts, SHA-256 digests, matching dimensions
and full JPEG decoding. Manifest/file reads are bounded; symlink face files are
rejected. This detects corruption, not authenticity: a party able to replace
both files and checksums can create a new valid bundle. Keep the directory
immutable between verification and use. Bundle generation always runs this check
before local publication; `-verify` can recheck an existing bundle. This is not
yet an HTTP upload validator.

Bounds: 32 MiB encoded image, 4096×2048 maximum source, 2:1 aspect ratio,
2048×2048 maximum face, exact-size native output, 30-second native-process
deadline (or earlier caller deadline). Image decoding and JPEG encoding are
synchronous: cancellation is checked around them, not interruptible inside the
standard-library codecs. Source metadata is not preserved; alpha is flattened
onto black. Colour profiles and EXIF orientation are not applied.

The source image, RGB input, native source buffer and output buffers coexist.
This is not a low-memory public upload endpoint. The future worker must limit
concurrency and enforce process-level memory/CPU limits. A bundle decodes and
prepares its RGB source once, reusing it sequentially for all six faces without
caching across requests. Each face still starts a native process and transfers
the RGB source; native batch processing remains a later optimization.

From `services/api`, run:

```sh
go test -race ./internal/panorama
go test -race ./cmd/panorama
go vet ./internal/panorama
```

The native integration test builds the real C++ executable using `clang++`, then
checks all six faces from both PNG and JPEG input. It skips if clang++ is absent;
that skip is not successful integration verification. Tests do not use the DB.

The command test builds both executables, converts a PNG to a six-face bundle,
verifies it, checks overwrite refusal, and rejects an intentionally corrupted
face. Publication tests also reject non-JPEG and wrong-sized converter output.

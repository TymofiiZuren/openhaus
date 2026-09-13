# Native panorama projection prototype

Dependency-free C++17 equirectangular-to-cubemap conversion. This is a standalone
processor, **not yet wired to the Go queue, uploads, Kuula tours or web viewer**.
It processes an existing 2:1 panorama; it does not stitch ordinary photographs.

The Go adapter in `services/api/internal/panorama` now accepts JPEG/PNG input
and returns JPEG faces through this executable. It is integration-tested but
not yet called by the application's media queue or an upload endpoint.

## Build and verify

From the repository root:

```sh
mkdir -p .scratch/panorama
clang++ -std=c++17 -O2 -Wall -Wextra -Werror services/panorama/main.cpp -o .scratch/panorama/convert
clang++ -std=c++17 -Wall -Wextra -Werror -fsanitize=address,undefined services/panorama/tests.cpp -o .scratch/panorama/tests
.scratch/panorama/tests
bash services/panorama/cli.test.sh .scratch/panorama/convert
```

## Interface

`convert WIDTH HEIGHT FACE SIZE` reads exactly one packed RGB24 frame on standard
input and writes one binary PPM (P6) face to standard output. Diagnostics go to
standard error; invalid input returns a nonzero exit code. Call once per face:
`front`, `right`, `back`, `left`, `top`, `bottom`.

The existing FFmpeg executable can decode images to RGB24 and encode PPM output
to a browser image format. Dimensions must match the decoded frame. Do not pass
JPEG or PNG bytes directly. Only use trusted local inputs for this prototype.

## Algorithm and conventions

- Each output pixel centre becomes a cube-face direction vector.
- Longitude uses `atan2(x,z)`; latitude uses `atan2(y,hypot(x,z))`.
- Bilinear interpolation wraps horizontally at the panorama seam and clamps
  vertically at the poles. RGB channels interpolate in their supplied encoding;
  no linear-light or colour-profile conversion is implemented.
- Coordinate system: +X right, +Y up, +Z front. Row coordinates increase down.
  Front centre reads panorama midpoint; right centre reads three-quarter width.
- Runtime is O(face size squared). The CLI uses `projectRows`, reusing one
  floating-point row and one encoded RGB row: memory is O(input pixels + face
  width). `project` remains available for callers needing a complete image and
  still uses O(input pixels + face pixels) memory. Row callbacks borrow a reused
  buffer and must copy retained data; throwing stops processing immediately.
  RGB channels use doubles. Maximum 8192×4096 input consumes 768 MiB alone;
  a 4096-wide output needs about 108 KiB of row buffers. These bounds are not a public-service
  resource policy: the eventual worker must enforce a smaller memory budget,
  process deadline and concurrency limit.

Tests cover cardinal orientations, poles, seam wrapping, constant-channel
preservation, dimensions and malformed image rejection. Multi-resolution tiles,
edge gutters, anti-aliasing for downsampling, cancellation, queue integration,
object storage, visual viewer verification and performance measurement remain
future work. Do not advertise progressive panorama streaming yet.

## Row-streaming verification (2026-09-12)

Compared the previous full-face CLI with the streaming CLI, compiled locally
with Apple clang, C++17 and `-O2`. All six 31×31 faces from a deterministic 8×4
RGB input matched byte-for-byte. Sanitized tests also verify row order, buffer
length, equality with the image API and immediate propagation of sink failures.

A single local `/usr/bin/time -l` run using an 8×4 black input, 4096×4096 front
face and output discarded to `/dev/null` reported:

| CLI | Peak resident bytes | Wall seconds |
| --- | ---: | ---: |
| Previous full-face output | 404,193,280 | 0.85 |
| Row-streamed output | 1,622,016 | 0.35 |

This deliberately tiny input isolates output-buffer cost. It is not a realistic
end-to-end panorama benchmark, repeated statistical measurement, or a claim
about upload/viewer speed. Large inputs still require substantial memory.
Output can be partial after a write failure; callers must stage files and publish
only after a successful exit. Row streaming is not network tile streaming.

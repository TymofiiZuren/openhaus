# Lossless shared county boundaries

The county map previously shipped each county's complete rings independently. Neighbours repeat shared borders in opposite directions. The checked-in source contains 215,398 edge occurrences and 191,616 distinct undirected edges.

## Representation and algorithm

`apps/web/src/boundaryTopology.ts` builds an adjacency graph from exact six-decimal coordinates. It cuts rings into arcs at graph junctions and at every original ring start. Including all starts prevents neighbouring rings with different starting points from creating incompatible cuts. Each arc is encoded forwards and backwards; the lexicographically smaller encoding becomes its canonical dictionary entry. Ring references use a non-negative index for forwards traversal and `-index-1` for backwards traversal.

Packing is build-time work with expected O(V + E) time and memory using hash maps. Runtime reconstruction decodes each unique arc once, joins adjacent arcs without duplicating seam vertices, and restores every ring's original starting point, direction and coordinate sequence. Runtime work remains linear in the reconstructed coordinates. No simplification, coordinate rounding, hole removal or approximate hit-testing is introduced. Inputs finer than six decimals are rejected rather than silently rounded.

The generated file has 9,949 arcs. Source geometry, attribution and existing viewport behaviour are retained. The existing Google Maps consumer receives the same paths and calculates its bounds as before. The packer is excluded from the production runtime by tree shaking; no new dependency or service is needed.

## Regeneration

From `apps/web`, run `node scripts/pack-county-boundaries.mjs`. It reads `src/data/irelandCounties.json` and writes `src/data/irelandCountyTopology.json`. The upstream county-download script invokes it too. Do not hand-edit the derived file.

Before writing, the generator reconstructs and compares the entire dataset with the source, then checks that gzip size actually improves. A mismatch or size regression fails without writing the packed output. The original source remains checked in for reproducibility and tests, but is not imported by the production map.

## Measured result and tradeoff

- Standalone data, same Node gzip settings: 787,078 → 738,578 bytes; 48,500 bytes saved (6.2%).
- Production map bundle: 798.19 → 751.72 KB gzip, including reconstruction code; about 46 KB saved.
- Local preview browser resource entries: 798,048 → 749,981 transfer bytes. Compression settings/HTTP overhead differ from the build report.
- Alternating local Node decode benchmark, four warm-up rounds then ten measured rounds: median 15.7 ms before, 22.1 ms with topology. This adds roughly 6.4 ms of decoding in that local sample. It is a bandwidth tradeoff, **not evidence of an across-the-board latency improvement**. Mobile CPU and constrained-network end-to-end timings remain unmeasured.

The map bundle still exceeds the build's 500 KB warning threshold. This step reduces its size without trading away geographic fidelity; it does not eliminate all map performance work.

## Verification

Tests cover opposite shared borders, ring-start differences, holes/islands, duplicate vertices, four-way junctions, invalid arc references, disconnected rings, open rings and overprecise inputs. A complete source comparison checks every original county, path and coordinate against the generated reconstruction, then against the actual map consumer's paths.

Browser checks on `http://127.0.0.1:5195/`: All Ireland loads, selecting Dublin narrows the map/results, and the Pembroke area deep link works at 390×844 with document width 390. Existing processes and previews were left running.

Final validation: `npm test` passed 245 tests, `npm run lint` passed with three existing Fast Refresh export warnings, `npm run build -- --outDir .scratch/topology-after` passed with the remaining large-map-chunk warning, and `git diff --check` passed. The production JavaScript was checked to exclude the build-time packer's unique validation string. Primary lossless-reconstruction and download-reduction signals are met. Benchmark status: DONE_WITH_CONCERNS because decoding is slower in the local sample and end-to-end mobile timings remain unmeasured.

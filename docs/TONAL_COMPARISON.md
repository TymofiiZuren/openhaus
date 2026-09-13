# Tonal comparison workbench

The Media Lab now lets a visitor pin a sample as a reference, select another sample, inspect cumulative brightness curves and export a reproducible JSON comparison. References retain only a 32-bin histogram and the sample label/path, not another pixel buffer. Loading another image keeps the reference but hides the old comparison until analysis completes. No production dependency or third-party processing service is added.

## Algorithm and interpretation

`compareTones` normalizes two nonnegative 32-bin histograms independently, builds their cumulative distribution functions, and sums their absolute differences across the 31 intervals between bin centres. Each interval is eight luma units wide. This is exact Wasserstein-1 optimal transport for these **binned discrete distributions**, not the original unquantized pixels. Complexity is O(B) time and O(B) space, B=32. The existing pixel analysis stays in its Web Worker; this small comparison runs synchronously without copying RGBA buffers.

The CDF formulation follows the [SciPy Wasserstein documentation](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.wasserstein_distance.html). We implement it directly in TypeScript; SciPy is not a dependency. The distance ranges from 0 to 248 luma units. Zero means identical normalized binned distributions, not identical images. The measure discards spatial arrangement and colour; it cannot establish image quality, duplication or scene identity.

The chart interpolates the displayed cumulative bin values; the calculation uses the discrete interval sum. Solid/dashed curves, a numeric distance and an expandable table provide alternatives to colour-only comparison. The export includes both source histograms, CDFs, distance, units, version and limitations; it excludes pixel buffers.

## Verification

`npm test -- src/tonalComparison.test.ts src/TonalComparison.test.tsx` checks known exact costs, normalization, symmetry, invalid inputs and comparison/export interactions. Eighty seeded distribution pairs also compare the CDF result against an independent implementation: expand equally sized samples, sort them and calculate mean pairwise absolute luma displacement.

All examples are fictional generated property imagery. This feature is an exploratory browser workbench, not an automated listing acceptance gate. No quality thresholds or automatic media deletion are introduced.

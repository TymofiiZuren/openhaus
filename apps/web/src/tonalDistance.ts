function cumulative(histogram: readonly number[]) {
  if (histogram.length !== 32) throw new Error('Invalid tonal histogram')
  for (let i = 0; i < 32; i++) {
    if (!Number.isFinite(histogram[i]) || histogram[i] < 0) throw new Error('Invalid tonal histogram')
  }
  const total = histogram.reduce((sum, value) => sum + value, 0)
  if (!Number.isFinite(total) || total <= 0) throw new Error('Invalid tonal histogram')
  let sum = 0
  return histogram.map(value => (sum += value / total))
}

// Exact 1-D Wasserstein-1 for the 32-bin discrete distributions. Integrate
// |CDF(a)-CDF(b)| over adjacent bin centres (8 luma units apart). O(B).
// Histograms discard spatial information: zero distance does not imply duplicates.
export function compareTones(reference: readonly number[], current: readonly number[]) {
  const referenceCDF = cumulative(reference)
  const currentCDF = cumulative(current)
  let distance = 0
  for (let i = 0; i < 31; i++) distance += Math.abs(referenceCDF[i] - currentCDF[i]) * 8
  return { distance, referenceCDF, currentCDF }
}

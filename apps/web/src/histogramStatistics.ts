/** Binned Shannon entropy and Otsu split, O(32) time and O(1) extra space.
 * Uses bin centres implicitly: an equal shift/scale cannot change the best split.
 * Ties retain the lowest boundary; constant channels have no valid two-class split.
 */
export function histogramStatistics(bins: number[]) {
  if (bins.length !== 32 || bins.some(count => !Number.isSafeInteger(count) || count < 0)) throw new Error('Expected 32 non-negative integer counts')
  const total = bins.reduce((sum, count) => sum + count, 0)
  if (!Number.isSafeInteger(total) || total === 0) throw new Error('Expected a nonempty histogram')
  let entropyBits = 0, mean = 0
  for (let i = 0; i < bins.length; i++) {
    const probability = bins[i] / total
    if (probability) entropyBits -= probability * Math.log2(probability)
    mean += probability * i
  }
  let leftWeight = 0, leftMoment = 0, best = -1
  let splitAfter: number | null = null
  for (let i = 0; i < bins.length - 1; i++) {
    leftWeight += bins[i] / total
    leftMoment += bins[i] / total * i
    if (leftWeight <= 0 || leftWeight >= 1) continue
    const difference = leftMoment / leftWeight - (mean - leftMoment) / (1 - leftWeight)
    const score = leftWeight * (1 - leftWeight) * difference ** 2
    if (score > best) { best = score; splitAfter = i * 8 + 7 }
  }
  return { entropyBits, splitAfter }
}

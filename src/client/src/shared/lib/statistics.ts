export function mean(values: readonly number[]): number {
  if (values.length === 0)
    throw new Error("Cannot calculate the mean of an empty collection.");
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function median(values: readonly number[]): number {
  if (values.length === 0)
    throw new Error("Cannot calculate the median of an empty collection.");
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

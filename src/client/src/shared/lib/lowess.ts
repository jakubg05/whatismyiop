import lowess from "@stdlib/stats-lowess";

const MIN_NEIGHBORS = 6;
const SMOOTHER_FRACTION = 0.35;
const ROBUST_STEPS = 3;

export function fitLowessTrend(
  timesInDays: number[],
  values: number[],
  timeSpanDays: number,
  robust = true,
): { neighborCount: number; fitted: number[] } {
  const neighborCount = Math.min(
    values.length,
    Math.max(MIN_NEIGHBORS, Math.ceil(values.length * SMOOTHER_FRACTION)),
  );
  const fitted = lowess(timesInDays, values, {
    f: Math.min(1, (neighborCount + 0.5) / values.length),
    nsteps: robust ? ROBUST_STEPS : 0,
    delta: Math.max(Number.EPSILON, timeSpanDays * 0.01),
    sorted: true,
  }).y;
  return { neighborCount, fitted };
}

export function interpolateClamped(
  xs: number[],
  ys: number[],
  target: number,
): number {
  let low = 0;
  let high = xs.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (xs[middle] < target) low = middle + 1;
    else high = middle;
  }
  if (low <= 0) return ys[0];
  if (low >= xs.length) return ys.at(-1)!;
  const left = low - 1;
  const ratio =
    (target - xs[left]) / Math.max(Number.EPSILON, xs[low] - xs[left]);
  return ys[left] + (ys[low] - ys[left]) * ratio;
}

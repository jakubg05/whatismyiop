import {
  coalesceMeasurementSessions,
  type Eye,
  type Measurement,
  type SessionAggregation,
} from "../analysis";
import lowess from "@stdlib/stats-lowess";

export type TrendMode = "off" | "adjusted" | "observed";

export type TrendEstimate = {
  time: number;
  iop: number;
  lower: number;
  upper: number;
  supported: boolean;
};

export type EyeTrend = {
  eye: Eye;
  estimates: TrendEstimate[];
  sessionCount: number;
};

const MIN_SESSIONS = 8;
const MIN_NEIGHBORS = 6;
const SMOOTHER_FRACTION = 0.35;
const ROBUST_STEPS = 3;
const ADJUSTMENT_PASSES = 5;
const DAY_MS = 86_400_000;
const SAMPLE_COUNT = 128;

type TrendObservation = {
  time: number;
  iop: number;
  minuteOfDay: number;
};

function median(values: number[]): number {
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? (ordered[middle - 1] + ordered[middle]) / 2
    : ordered[middle];
}

function observation(session: { time: number; iop: number }): TrendObservation {
  const date = new Date(session.time);
  return {
    time: session.time,
    iop: session.iop,
    minuteOfDay: date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60,
  };
}

function smootherOptions(length: number, timeSpanDays: number) {
  const neighborCount = Math.min(length, Math.max(MIN_NEIGHBORS, Math.ceil(length * SMOOTHER_FRACTION)));
  return {
    neighborCount,
    options: {
      f: Math.min(1, (neighborCount + 0.5) / length),
      nsteps: ROBUST_STEPS,
      delta: timeSpanDays * 0.01,
      sorted: true,
    },
  };
}

function interpolateSorted(xs: number[], ys: number[], target: number): number {
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
  const ratio = (target - xs[left]) / Math.max(Number.EPSILON, xs[low] - xs[left]);
  return ys[left] + (ys[low] - ys[left]) * ratio;
}

function nearestDistance(times: number[], target: number): number {
  let low = 0;
  let high = times.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (times[middle] < target) low = middle + 1;
    else high = middle;
  }
  return Math.min(
    low < times.length ? Math.abs(times[low] - target) : Number.POSITIVE_INFINITY,
    low > 0 ? Math.abs(times[low - 1] - target) : Number.POSITIVE_INFINITY,
  );
}

function rawFeatures(item: Pick<TrendObservation, "minuteOfDay">): number[] {
  const angle = item.minuteOfDay / 1440 * Math.PI * 2;
  return [
    Math.sin(angle),
    Math.cos(angle),
    Math.sin(angle * 2),
    Math.cos(angle * 2),
  ];
}

function solve(matrix: number[][], vector: number[]): number[] {
  const size = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    if (Math.abs(divisor) < 1e-12) continue;
    for (let index = column; index <= size; index += 1) augmented[column][index] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let index = column; index <= size; index += 1) augmented[row][index] -= factor * augmented[column][index];
    }
  }
  return augmented.map((row, index) => Number.isFinite(row[size]) ? row[size] : vector[index] * 0);
}

function fitTimeOfDay(observations: TrendObservation[], residuals: number[]) {
  const featureRows = observations.map(rawFeatures);
  const means = featureRows[0].map((_, column) => featureRows.reduce((sum, row) => sum + row[column], 0) / featureRows.length);
  const centered = featureRows.map((row) => row.map((value, column) => value - means[column]));
  const size = means.length;
  const matrix = Array.from({ length: size }, () => Array(size).fill(0) as number[]);
  const vector = Array(size).fill(0) as number[];
  for (let row = 0; row < centered.length; row += 1) {
    for (let left = 0; left < size; left += 1) {
      vector[left] += centered[row][left] * residuals[row];
      for (let right = 0; right < size; right += 1) {
        matrix[left][right] += centered[row][left] * centered[row][right];
      }
    }
  }
  for (let index = 0; index < size; index += 1) matrix[index][index] += 0.05;
  const coefficients = solve(matrix, vector);
  const predict = (features: number[]) => features.reduce(
    (sum, value, index) => sum + (value - means[index]) * coefficients[index],
    0,
  );
  return { atObservation: featureRows.map(predict), atReference: predict(rawFeatures({ minuteOfDay: 12 * 60 })) };
}

function medianGap(observations: TrendObservation[]): number {
  if (observations.length < 2) return 0;
  return median(observations.slice(1).map((item, index) => item.time - observations[index].time));
}

function estimateEye(observations: TrendObservation[], mode: Exclude<TrendMode, "off">): TrendEstimate[] {
  const rawValues = observations.map((item) => item.iop);
  const times = observations.map((item) => item.time);
  const firstTime = times[0];
  const lastTime = times.at(-1)!;
  const timeSpanDays = Math.max(Number.EPSILON, (lastTime - firstTime) / DAY_MS);
  const normalizedTimes = times.map((time) => (time - firstTime) / DAY_MS);
  const { neighborCount, options } = smootherOptions(observations.length, timeSpanDays);
  let nuisance = observations.map(() => 0);
  let referenceOffset = 0;
  if (mode === "adjusted") {
    for (let iteration = 0; iteration < ADJUSTMENT_PASSES; iteration += 1) {
      const adjusted = rawValues.map((value, index) => value - nuisance[index]);
      const fittedCalendar = lowess(normalizedTimes, adjusted, options).y;
      const fitted = fitTimeOfDay(observations, rawValues.map((value, index) => value - fittedCalendar[index]));
      nuisance = fitted.atObservation;
      referenceOffset = fitted.atReference;
    }
  }
  const values = rawValues.map((value, index) => value - nuisance[index]);
  const fitted = lowess(normalizedTimes, values, options).y;
  const squaredResiduals = values.map((value, index) => (value - fitted[index]) ** 2);
  const localVariances = lowess(normalizedTimes, squaredResiduals, { ...options, nsteps: 0 }).y;
  const gapLimit = Math.max(45 * DAY_MS, medianGap(observations) * 3);
  return Array.from({ length: SAMPLE_COUNT }, (_, index) => {
    const time = firstTime + (lastTime - firstTime) * index / (SAMPLE_COUNT - 1);
    const normalizedTime = (time - firstTime) / DAY_MS;
    const iop = interpolateSorted(normalizedTimes, fitted, normalizedTime) + referenceOffset;
    const variance = Math.max(0, interpolateSorted(normalizedTimes, localVariances, normalizedTime));
    const margin = 1.96 * Math.sqrt(variance / neighborCount);
    return {
      time,
      iop,
      lower: iop - margin,
      upper: iop + margin,
      supported: nearestDistance(times, time) <= gapLimit,
    };
  });
}

export function buildTrendSeries(
  measurements: Measurement[],
  aggregation: SessionAggregation,
  mode: TrendMode,
): EyeTrend[] {
  if (mode === "off") return [];
  const sessions = coalesceMeasurementSessions(measurements, aggregation);
  return (["OD", "OS"] as Eye[]).flatMap((eye) => {
    const observations = sessions.filter((session) => session.eye === eye).map(observation);
    if (observations.length < MIN_SESSIONS || observations[0].time === observations.at(-1)!.time) return [];
    return [{ eye, estimates: estimateEye(observations, mode), sessionCount: observations.length }];
  });
}

export function interpolateTrendEstimate(estimates: TrendEstimate[], time: number): TrendEstimate | null {
  if (estimates.length === 0 || time < estimates[0].time || time > estimates.at(-1)!.time) return null;
  const index = estimates.findIndex((estimate) => estimate.time >= time);
  if (index <= 0) return estimates[0];
  const left = estimates[index - 1];
  const right = estimates[index];
  return interpolateEstimate(left, right, time);
}

export function interpolateTrend(estimates: TrendEstimate[], time: number): number | null {
  return interpolateTrendEstimate(estimates, time)?.iop ?? null;
}

function interpolateEstimate(left: TrendEstimate, right: TrendEstimate, time: number): TrendEstimate {
  const ratio = (time - left.time) / Math.max(1, right.time - left.time);
  return {
    time,
    iop: left.iop + (right.iop - left.iop) * ratio,
    lower: left.lower + (right.lower - left.lower) * ratio,
    upper: left.upper + (right.upper - left.upper) * ratio,
    supported: left.supported && right.supported,
  };
}

export function splitTrendSegment(
  left: TrendEstimate,
  right: TrendEstimate,
  boundaries: readonly number[],
): Array<readonly [TrendEstimate, TrendEstimate]> {
  const cuts = [
    left.time,
    ...boundaries.filter((boundary) => boundary > left.time && boundary < right.time),
    right.time,
  ].sort((a, b) => a - b);
  return cuts.slice(1).map((cut, index) => [
    interpolateEstimate(left, right, cuts[index]),
    interpolateEstimate(left, right, cut),
  ] as const);
}

export function trendEstimatesForDomain(
  estimates: TrendEstimate[],
  domainStart: number,
  domainEnd: number,
): TrendEstimate[] {
  if (
    estimates.length < 2
    || domainEnd < estimates[0].time
    || domainStart > estimates.at(-1)!.time
  ) return [];

  let start = 0;
  let end = estimates.length;
  while (start < end) {
    const middle = (start + end) >>> 1;
    if (estimates[middle].time < domainStart) start = middle + 1;
    else end = middle;
  }
  const first = Math.max(0, start - 1);

  start = 0;
  end = estimates.length;
  while (start < end) {
    const middle = (start + end) >>> 1;
    if (estimates[middle].time <= domainEnd) start = middle + 1;
    else end = middle;
  }
  const lastExclusive = Math.min(estimates.length, start + 1);
  return estimates.slice(first, lastExclusive);
}

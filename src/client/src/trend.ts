import {
  coalesceMeasurementSessions,
  type Eye,
  type Measurement,
  type SessionAggregation,
  type SessionPoint,
} from "./analysis";

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
const DAY_MS = 86_400_000;
const SAMPLE_COUNT = 128;

type TrendObservation = {
  time: number;
  iop: number;
  minuteOfDay: number;
  position: "sitting" | "lying" | "other";
};

type LocalEstimate = { value: number; standardError: number; effectiveCount: number };

function median(values: number[]): number {
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? (ordered[middle - 1] + ordered[middle]) / 2
    : ordered[middle];
}

function positionCategory(session: SessionPoint): TrendObservation["position"] {
  const counts = { sitting: 0, lying: 0, other: 0 };
  for (const measurement of session.measurements) {
    const value = measurement.position.trim().toLowerCase();
    if (value.includes("sitt") || value.includes("seat")) counts.sitting += 1;
    else if (value.includes("supine") || value.includes("lying") || value.includes("laying") || value.includes("recumbent")) counts.lying += 1;
    else counts.other += 1;
  }
  return (Object.entries(counts) as Array<[TrendObservation["position"], number]>)
    .sort((a, b) => b[1] - a[1])[0][0];
}

function observation(session: SessionPoint): TrendObservation {
  const date = new Date(session.time);
  return {
    time: session.time,
    iop: session.iop,
    minuteOfDay: date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60,
    position: positionCategory(session),
  };
}

function tricube(value: number): number {
  if (value >= 1) return 0;
  const remaining = 1 - value ** 3;
  return remaining ** 3;
}

function localLinear(
  observations: TrendObservation[],
  values: number[],
  targetTime: number,
  robustWeights: number[],
): LocalEstimate {
  const neighborCount = Math.min(observations.length, Math.max(6, Math.ceil(observations.length * 0.35)));
  const distances = observations.map((item) => Math.abs(item.time - targetTime)).sort((a, b) => a - b);
  const bandwidth = Math.max(1, distances[neighborCount - 1]);
  const scale = Math.max(DAY_MS, observations.at(-1)!.time - observations[0].time);
  const xs = observations.map((item) => (item.time - targetTime) / scale);
  const weights = observations.map((item, index) => tricube(Math.abs(item.time - targetTime) / bandwidth) * robustWeights[index]);
  const sumWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (sumWeight <= 0) return { value: values[0], standardError: 0, effectiveCount: 1 };

  let s1 = 0;
  let s2 = 0;
  let sy = 0;
  let sxy = 0;
  for (let index = 0; index < observations.length; index += 1) {
    s1 += weights[index] * xs[index];
    s2 += weights[index] * xs[index] ** 2;
    sy += weights[index] * values[index];
    sxy += weights[index] * xs[index] * values[index];
  }
  const determinant = sumWeight * s2 - s1 ** 2;
  const intercept = Math.abs(determinant) < 1e-12
    ? sy / sumWeight
    : (sy * s2 - sxy * s1) / determinant;
  let weightedError = 0;
  let squaredWeight = 0;
  for (let index = 0; index < observations.length; index += 1) {
    const slope = Math.abs(determinant) < 1e-12 ? 0 : (sumWeight * sxy - s1 * sy) / determinant;
    const residual = values[index] - intercept - slope * xs[index];
    weightedError += weights[index] * residual ** 2;
    squaredWeight += weights[index] ** 2;
  }
  const effectiveCount = squaredWeight > 0 ? sumWeight ** 2 / squaredWeight : 1;
  const variance = weightedError / Math.max(1, sumWeight) / Math.max(1, effectiveCount);
  return { value: intercept, standardError: Math.sqrt(Math.max(0, variance)), effectiveCount };
}

function robustWeights(observations: TrendObservation[], values: number[]): number[] {
  const initial = observations.map((item) => localLinear(observations, values, item.time, observations.map(() => 1)).value);
  const residuals = values.map((value, index) => value - initial[index]);
  const center = median(residuals);
  const mad = median(residuals.map((value) => Math.abs(value - center)));
  if (mad < 1e-9) return observations.map(() => 1);
  return residuals.map((residual) => {
    const distance = Math.abs(residual - center) / (6 * mad);
    return distance >= 1 ? 0 : (1 - distance ** 2) ** 2;
  });
}

function rawFeatures(item: Pick<TrendObservation, "minuteOfDay" | "position">): number[] {
  const angle = item.minuteOfDay / 1440 * Math.PI * 2;
  return [
    Math.sin(angle),
    Math.cos(angle),
    Math.sin(angle * 2),
    Math.cos(angle * 2),
    item.position === "sitting" ? 1 : 0,
    item.position === "lying" ? 1 : 0,
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

function fitNuisance(observations: TrendObservation[], residuals: number[], weights: number[]) {
  const featureRows = observations.map(rawFeatures);
  const means = featureRows[0].map((_, column) => featureRows.reduce((sum, row) => sum + row[column], 0) / featureRows.length);
  const centered = featureRows.map((row) => row.map((value, column) => value - means[column]));
  const size = means.length;
  const matrix = Array.from({ length: size }, () => Array(size).fill(0) as number[]);
  const vector = Array(size).fill(0) as number[];
  for (let row = 0; row < centered.length; row += 1) {
    for (let left = 0; left < size; left += 1) {
      vector[left] += weights[row] * centered[row][left] * residuals[row];
      for (let right = 0; right < size; right += 1) {
        matrix[left][right] += weights[row] * centered[row][left] * centered[row][right];
      }
    }
  }
  for (let index = 0; index < size; index += 1) matrix[index][index] += 0.05;
  const coefficients = solve(matrix, vector);
  const predict = (features: number[]) => features.reduce(
    (sum, value, index) => sum + (value - means[index]) * coefficients[index],
    0,
  );
  return { atObservation: featureRows.map(predict), atReference: predict(rawFeatures({ minuteOfDay: 12 * 60, position: "sitting" })) };
}

function medianGap(observations: TrendObservation[]): number {
  if (observations.length < 2) return 0;
  return median(observations.slice(1).map((item, index) => item.time - observations[index].time));
}

function estimateEye(observations: TrendObservation[], mode: Exclude<TrendMode, "off">): TrendEstimate[] {
  const rawValues = observations.map((item) => item.iop);
  const weights = robustWeights(observations, rawValues);
  let nuisance = observations.map(() => 0);
  let referenceOffset = 0;
  if (mode === "adjusted") {
    for (let iteration = 0; iteration < 5; iteration += 1) {
      const adjusted = rawValues.map((value, index) => value - nuisance[index]);
      const fittedCalendar = observations.map((item) => localLinear(observations, adjusted, item.time, weights).value);
      const fitted = fitNuisance(observations, rawValues.map((value, index) => value - fittedCalendar[index]), weights);
      nuisance = fitted.atObservation;
      referenceOffset = fitted.atReference;
    }
  }
  const values = rawValues.map((value, index) => value - nuisance[index]);
  const firstTime = observations[0].time;
  const lastTime = observations.at(-1)!.time;
  const gapLimit = Math.max(45 * DAY_MS, medianGap(observations) * 3);
  return Array.from({ length: SAMPLE_COUNT }, (_, index) => {
    const time = firstTime + (lastTime - firstTime) * index / (SAMPLE_COUNT - 1);
    const estimate = localLinear(observations, values, time, weights);
    const nearestDistance = Math.min(...observations.map((item) => Math.abs(item.time - time)));
    const iop = estimate.value + referenceOffset;
    const margin = 1.96 * estimate.standardError;
    return {
      time,
      iop,
      lower: iop - margin,
      upper: iop + margin,
      supported: estimate.effectiveCount >= 4 && nearestDistance <= gapLimit,
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

export function interpolateTrend(estimates: TrendEstimate[], time: number): number | null {
  if (estimates.length === 0 || time < estimates[0].time || time > estimates.at(-1)!.time) return null;
  const index = estimates.findIndex((estimate) => estimate.time >= time);
  if (index <= 0) return estimates[0].iop;
  const left = estimates[index - 1];
  const right = estimates[index];
  const ratio = (time - left.time) / Math.max(1, right.time - left.time);
  return left.iop + (right.iop - left.iop) * ratio;
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

import {
  aggregateMeasurementSessions,
  type Eye,
  type Measurement,
  type MeasurementView,
  type SessionAggregation,
} from "../../measurements";
import {
  fitLowessTrend,
  interpolateClamped,
} from "../../../shared/math/lowess";
import { median } from "../../../shared/lib/statistics";

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
  observationCount: number;
  view: MeasurementView;
  aggregation: SessionAggregation;
};

const MIN_OBSERVATIONS = 8;
const DAY_MS = 86_400_000;
const SAMPLE_COUNT = 128;

type TrendObservation = {
  time: number;
  iop: number;
};

function nearestDistance(times: number[], target: number): number {
  let low = 0;
  let high = times.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (times[middle] < target) low = middle + 1;
    else high = middle;
  }
  return Math.min(
    low < times.length
      ? Math.abs(times[low] - target)
      : Number.POSITIVE_INFINITY,
    low > 0 ? Math.abs(times[low - 1] - target) : Number.POSITIVE_INFINITY,
  );
}

function medianGap(observations: TrendObservation[]): number {
  if (observations.length < 2) return 0;
  return median(
    observations
      .slice(1)
      .map((item, index) => item.time - observations[index].time),
  );
}

function estimateEye(observations: TrendObservation[]): TrendEstimate[] {
  const rawValues = observations.map((item) => item.iop);
  const times = observations.map((item) => item.time);
  const firstTime = times[0];
  const lastTime = times.at(-1)!;
  const timeSpanDays = Math.max(
    Number.EPSILON,
    (lastTime - firstTime) / DAY_MS,
  );
  const normalizedTimes = times.map((time) => (time - firstTime) / DAY_MS);
  const { neighborCount, fitted } = fitLowessTrend(
    normalizedTimes,
    rawValues,
    timeSpanDays,
  );
  const squaredResiduals = rawValues.map(
    (value, index) => (value - fitted[index]) ** 2,
  );
  const localVariances = fitLowessTrend(
    normalizedTimes,
    squaredResiduals,
    timeSpanDays,
    false,
  ).fitted;
  const gapLimit = Math.max(45 * DAY_MS, medianGap(observations) * 3);
  return Array.from({ length: SAMPLE_COUNT }, (_, index) => {
    const time =
      firstTime + ((lastTime - firstTime) * index) / (SAMPLE_COUNT - 1);
    const normalizedTime = (time - firstTime) / DAY_MS;
    const iop = interpolateClamped(normalizedTimes, fitted, normalizedTime);
    const variance = Math.max(
      0,
      interpolateClamped(normalizedTimes, localVariances, normalizedTime),
    );
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
  view: MeasurementView,
  aggregation: SessionAggregation,
): EyeTrend[] {
  const inputs =
    view === "raw"
      ? [...measurements].sort(
          (left, right) =>
            left.time - right.time || left.sourceRow - right.sourceRow,
        )
      : aggregateMeasurementSessions(measurements, aggregation);
  return (["OD", "OS"] as Eye[]).flatMap((eye) => {
    const observations = inputs
      .filter((input) => input.eye === eye)
      .map(({ time, iop }) => ({ time, iop }));
    if (
      observations.length < MIN_OBSERVATIONS ||
      observations[0].time === observations.at(-1)!.time
    )
      return [];
    return [
      {
        eye,
        estimates: estimateEye(observations),
        observationCount: observations.length,
        view,
        aggregation,
      },
    ];
  });
}

export function interpolateTrendEstimate(
  estimates: TrendEstimate[],
  time: number,
): TrendEstimate | null {
  if (
    estimates.length === 0 ||
    time < estimates[0].time ||
    time > estimates.at(-1)!.time
  )
    return null;
  const index = estimates.findIndex((estimate) => estimate.time >= time);
  if (index <= 0) return estimates[0];
  const left = estimates[index - 1];
  const right = estimates[index];
  return interpolateEstimate(left, right, time);
}

export function interpolateTrend(
  estimates: TrendEstimate[],
  time: number,
): number | null {
  return interpolateTrendEstimate(estimates, time)?.iop ?? null;
}

function interpolateEstimate(
  left: TrendEstimate,
  right: TrendEstimate,
  time: number,
): TrendEstimate {
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
    ...boundaries.filter(
      (boundary) => boundary > left.time && boundary < right.time,
    ),
    right.time,
  ].sort((a, b) => a - b);
  return cuts
    .slice(1)
    .map(
      (cut, index) =>
        [
          interpolateEstimate(left, right, cuts[index]),
          interpolateEstimate(left, right, cut),
        ] as const,
    );
}

export function trendEstimatesForDomain(
  estimates: TrendEstimate[],
  domainStart: number,
  domainEnd: number,
): TrendEstimate[] {
  if (
    estimates.length < 2 ||
    domainEnd < estimates[0].time ||
    domainStart > estimates.at(-1)!.time
  )
    return [];

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

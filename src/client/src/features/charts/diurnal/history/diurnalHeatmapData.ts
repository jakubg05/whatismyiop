import {
  aggregateMeasurementSessions,
  type Eye,
  type Measurement,
  type MeasurementView,
  type SessionAggregation,
} from "../../../measurements";
import {
  fitLowessTrend,
  interpolateClamped,
} from "../../../../shared/lib/lowess";
import { DIURNAL_BIN_COUNT, MINUTES_PER_BIN } from "../format";

export type DiurnalHeatmapData = {
  times: number[];
  z: Array<Array<number | null>>;
  lowSupport: boolean[][];
};

const DAY_MS = 86_400_000;
const MAX_ROWS = 180;
const MAX_SUPPORT_RADIUS = 30 * DAY_MS;
const MAX_LOWESS_OBSERVATIONS = 2_048;

export type DiurnalHeatmapReading = {
  time: number;
  eye: Eye;
  iop: number;
};

export function heatmapReadingsForView(
  measurements: readonly Measurement[],
  view: MeasurementView,
  aggregation: SessionAggregation,
): readonly DiurnalHeatmapReading[] {
  return view === "raw"
    ? measurements
    : aggregateMeasurementSessions(measurements, aggregation);
}

function trendAtSamples(
  observations: Array<{ time: number; value: number }>,
  samples: number[],
): Array<number | null> {
  if (observations.length === 0) return samples.map(() => null);
  if (observations.length === 1)
    return samples.map(() => observations[0].value);
  const fittedObservations = reduceObservations(observations);
  const origin = fittedObservations[0].time;
  const xs = fittedObservations.map((item) => (item.time - origin) / DAY_MS);
  const ys = fittedObservations.map((item) => item.value);
  const timeSpanDays = Math.max(Number.EPSILON, xs.at(-1)! - xs[0]);
  const fitted =
    observations.length < 3 ? ys : fitLowessTrend(xs, ys, timeSpanDays).fitted;
  return samples.map((time) =>
    interpolateClamped(xs, fitted, (time - origin) / DAY_MS),
  );
}

function reduceObservations(
  observations: Array<{ time: number; value: number }>,
): Array<{ time: number; value: number }> {
  if (observations.length <= MAX_LOWESS_OBSERVATIONS) return observations;
  const reduced: Array<{ time: number; value: number }> = [];
  for (let bucket = 0; bucket < MAX_LOWESS_OBSERVATIONS; bucket += 1) {
    const start = Math.floor(
      (bucket * observations.length) / MAX_LOWESS_OBSERVATIONS,
    );
    const end = Math.floor(
      ((bucket + 1) * observations.length) / MAX_LOWESS_OBSERVATIONS,
    );
    let time = 0;
    let value = 0;
    for (let index = start; index < end; index += 1) {
      time += observations[index].time;
      value += observations[index].value;
    }
    const count = end - start;
    reduced.push({ time: time / count, value: value / count });
  }
  return reduced;
}

type DailyAggregate = { sum: number; count: number };
type DailyBins = Array<Map<number, DailyAggregate>>;

function createDailyBins(): DailyBins {
  return Array.from(
    { length: DIURNAL_BIN_COUNT },
    () => new Map<number, DailyAggregate>(),
  );
}

function bound(times: readonly number[], target: number, upper: boolean): number {
  let low = 0;
  let high = times.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (times[middle] < target || (upper && times[middle] === target))
      low = middle + 1;
    else high = middle;
  }
  return low;
}

function supportCount(
  times: readonly number[],
  sampleTime: number,
  radius: number,
): number {
  return (
    bound(times, sampleTime + radius, true) -
    bound(times, sampleTime - radius, false)
  );
}

function buildHeatmapFromBins(
  dailyBins: DailyBins,
  sampleTimes: number[],
  spanDays: number,
): DiurnalHeatmapData {
  const observationsByBin = dailyBins.map((days) =>
    [...days.entries()]
      .sort(([left], [right]) => left - right)
      .map(([time, aggregate]) => ({
        time,
        value: aggregate.sum / aggregate.count,
      })),
  );
  const columns = observationsByBin.map((observations) =>
    trendAtSamples(observations, sampleTimes),
  );
  const supportRadius = Math.min(
    MAX_SUPPORT_RADIUS,
    Math.max(3 * DAY_MS, spanDays * DAY_MS * 0.1),
  );
  const supportTimes = observationsByBin.map((observations) =>
    observations.map((observation) => observation.time),
  );

  return {
    times: sampleTimes,
    z: sampleTimes.map((_, row) => columns.map((column) => column[row])),
    lowSupport: sampleTimes.map((sampleTime) =>
      supportTimes.map(
        (times) => supportCount(times, sampleTime, supportRadius) < 2,
      ),
    ),
  };
}

export function buildDiurnalHeatmapData(
  readings: readonly DiurnalHeatmapReading[],
  eye: Eye,
  domain: readonly [start: number, end: number],
): DiurnalHeatmapData {
  return buildDiurnalHeatmaps(readings, domain)[eye];
}

export function buildDiurnalHeatmaps(
  readings: readonly DiurnalHeatmapReading[],
  domain: readonly [start: number, end: number],
): Record<Eye, DiurnalHeatmapData> {
  const [rangeStart, rangeEnd] = domain;
  if (
    !Number.isFinite(rangeStart) ||
    !Number.isFinite(rangeEnd) ||
    rangeStart > rangeEnd
  ) {
    return {
      OD: { times: [], z: [], lowSupport: [] },
      OS: { times: [], z: [], lowSupport: [] },
    };
  }
  const startDate = new Date(rangeStart);
  const endDate = new Date(rangeEnd);
  const calendarStart = Date.UTC(
    startDate.getUTCFullYear(),
    startDate.getUTCMonth(),
    startDate.getUTCDate(),
  );
  const calendarEnd = Date.UTC(
    endDate.getUTCFullYear(),
    endDate.getUTCMonth(),
    endDate.getUTCDate(),
  );

  const spanDays = Math.max(
    0,
    Math.round((calendarEnd - calendarStart) / DAY_MS),
  );
  const rowCount = Math.min(MAX_ROWS, spanDays + 1);
  const sampleTimes = Array.from({ length: rowCount }, (_, index) =>
    rowCount === 1
      ? calendarStart
      : calendarStart + (spanDays * DAY_MS * index) / (rowCount - 1),
  );
  const dailyBinsByEye: Record<Eye, DailyBins> = {
    OD: createDailyBins(),
    OS: createDailyBins(),
  };

  for (const reading of readings) {
    if (
      reading.time < rangeStart ||
      reading.time > rangeEnd
    )
      continue;
    const day = Math.floor(reading.time / DAY_MS) * DAY_MS;
    const minuteOfDay = (reading.time - day) / 60_000;
    const bin = Math.min(
      DIURNAL_BIN_COUNT - 1,
      Math.floor(minuteOfDay / MINUTES_PER_BIN),
    );
    const days = dailyBinsByEye[reading.eye][bin];
    const aggregate = days.get(day);
    if (aggregate) {
      aggregate.sum += reading.iop;
      aggregate.count += 1;
    } else {
      days.set(day, { sum: reading.iop, count: 1 });
    }
  }

  return {
    OD: buildHeatmapFromBins(dailyBinsByEye.OD, sampleTimes, spanDays),
    OS: buildHeatmapFromBins(dailyBinsByEye.OS, sampleTimes, spanDays),
  };
}

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
import { mean } from "../../../../shared/lib/statistics";
import { DIURNAL_BIN_COUNT, MINUTES_PER_BIN } from "../format";

export type DiurnalHeatmapData = {
  times: number[];
  z: Array<Array<number | null>>;
  lowSupport: boolean[][];
};

const DAY_MS = 86_400_000;
const MAX_ROWS = 180;
const MAX_SUPPORT_RADIUS = 30 * DAY_MS;

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
  const origin = observations[0].time;
  const xs = observations.map((item) => (item.time - origin) / DAY_MS);
  const ys = observations.map((item) => item.value);
  const timeSpanDays = Math.max(Number.EPSILON, xs.at(-1)! - xs[0]);
  const fitted =
    observations.length < 3 ? ys : fitLowessTrend(xs, ys, timeSpanDays).fitted;
  return samples.map((time) =>
    interpolateClamped(xs, fitted, (time - origin) / DAY_MS),
  );
}

export function buildDiurnalHeatmapData(
  readings: readonly DiurnalHeatmapReading[],
  eye: Eye,
  domain: readonly [start: number, end: number],
): DiurnalHeatmapData {
  const [rangeStart, rangeEnd] = domain;
  if (
    !Number.isFinite(rangeStart) ||
    !Number.isFinite(rangeEnd) ||
    rangeStart > rangeEnd
  ) {
    return { times: [], z: [], lowSupport: [] };
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
  const dailyBins = Array.from(
    { length: DIURNAL_BIN_COUNT },
    () => new Map<number, number[]>(),
  );

  for (const reading of readings) {
    if (
      reading.eye !== eye ||
      reading.time < rangeStart ||
      reading.time > rangeEnd
    )
      continue;
    const date = new Date(reading.time);
    const minuteOfDay =
      date.getUTCHours() * 60 +
      date.getUTCMinutes() +
      date.getUTCSeconds() / 60;
    const bin = Math.min(
      DIURNAL_BIN_COUNT - 1,
      Math.floor(minuteOfDay / MINUTES_PER_BIN),
    );
    const day = Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
    );
    const values = dailyBins[bin].get(day) ?? [];
    values.push(reading.iop);
    dailyBins[bin].set(day, values);
  }

  const observationsByBin = dailyBins.map((days) =>
    [...days.entries()]
      .sort(([left], [right]) => left - right)
      .map(([time, values]) => ({
        time,
        value: mean(values),
      })),
  );
  const columns = observationsByBin.map((observations) =>
    trendAtSamples(observations, sampleTimes),
  );
  const supportRadius = Math.min(
    MAX_SUPPORT_RADIUS,
    Math.max(3 * DAY_MS, spanDays * DAY_MS * 0.1),
  );
  const supportTimes = dailyBins.map((days) => [...days.keys()]);

  return {
    times: sampleTimes,
    z: sampleTimes.map((_, row) => columns.map((column) => column[row])),
    lowSupport: sampleTimes.map((sampleTime) =>
      supportTimes.map(
        (times) =>
          times.filter((time) => Math.abs(time - sampleTime) <= supportRadius)
            .length < 2,
      ),
    ),
  };
}

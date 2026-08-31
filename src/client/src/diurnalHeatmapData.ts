import {
  coalesceMeasurementSessions,
  dateBoundary,
  dateTimeBoundary,
  formatDateInput,
  type Eye,
  type Measurement,
  type MeasurementView,
  type SessionAggregation,
} from "./analysis";
import { fitCalendarValues, interpolateSorted } from "./trendSmoothing";

export const DIURNAL_BIN_LABELS = Array.from({ length: 8 }, (_, bin) => {
  const start = String(bin * 3);
  return `${start}:00`;
});

export const DIURNAL_BIN_WINDOWS = Array.from({ length: 8 }, (_, bin) => {
  const start = bin * 3;
  const end = (bin + 1) * 3;
  return `${start}:00–${end === 24 ? "0" : end}:00`;
});

export type DiurnalHeatmapData = {
  x: string[];
  y: string[];
  times: number[];
  z: Array<Array<number | null>>;
  lowSupport: boolean[][];
};

type HeatmapRange = {
  start: string;
  startTime: string;
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
    : coalesceMeasurementSessions([...measurements], aggregation);
}

function trendAtSamples(observations: Array<{ time: number; value: number }>, samples: number[]): Array<number | null> {
  if (observations.length === 0) return samples.map(() => null);
  if (observations.length === 1) return samples.map(() => observations[0].value);
  const origin = observations[0].time;
  const xs = observations.map((item) => (item.time - origin) / DAY_MS);
  const ys = observations.map((item) => item.value);
  const timeSpanDays = Math.max(Number.EPSILON, xs.at(-1)! - xs[0]);
  const fitted = observations.length < 3 ? ys : fitCalendarValues(xs, ys, timeSpanDays).fitted;
  return samples.map((time) => interpolateSorted(xs, fitted, (time - origin) / DAY_MS));
}

export function buildDiurnalHeatmapData(
  readings: readonly DiurnalHeatmapReading[],
  eyeSelection: Eye | readonly Eye[],
  range: HeatmapRange,
  end: string,
  endTime: string,
  exactEnd?: number,
): DiurnalHeatmapData {
  const eyes = new Set<Eye>(typeof eyeSelection === "string" ? [eyeSelection] : eyeSelection);
  const rangeStart = dateTimeBoundary(range.start, range.startTime);
  const rangeEnd = exactEnd ?? dateTimeBoundary(end, endTime, true);
  const calendarStart = dateBoundary(range.start);
  const calendarEnd = dateBoundary(end);
  if (rangeStart === null || rangeEnd === null || calendarStart === null || calendarEnd === null || rangeStart > rangeEnd) {
    return { x: DIURNAL_BIN_LABELS, y: [], times: [], z: [], lowSupport: [] };
  }

  const spanDays = Math.max(0, Math.round((calendarEnd - calendarStart) / DAY_MS));
  const rowCount = Math.min(MAX_ROWS, spanDays + 1);
  const sampleTimes = Array.from({ length: rowCount }, (_, index) => (
    rowCount === 1 ? calendarStart : calendarStart + spanDays * DAY_MS * index / (rowCount - 1)
  ));
  const dailyBins = Array.from({ length: 8 }, () => new Map<number, Map<Eye, number[]>>());

  for (const reading of readings) {
    if (!eyes.has(reading.eye) || reading.time < rangeStart || reading.time > rangeEnd) continue;
    const date = new Date(reading.time);
    const minuteOfDay = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
    const bin = Math.min(7, Math.floor(minuteOfDay / 180));
    const day = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    const byEye = dailyBins[bin].get(day) ?? new Map<Eye, number[]>();
    const values = byEye.get(reading.eye) ?? [];
    values.push(reading.iop);
    byEye.set(reading.eye, values);
    dailyBins[bin].set(day, byEye);
  }

  const observationsByBin = dailyBins.map((days) => (
    [...days.entries()]
      .sort(([left], [right]) => left - right)
      .map(([time, byEye]) => {
        const eyeMeans = [...byEye.values()].map((values) => values.reduce((sum, value) => sum + value, 0) / values.length);
        return { time, value: eyeMeans.reduce((sum, value) => sum + value, 0) / eyeMeans.length };
      })
  ));
  const columns = observationsByBin.map((observations) => trendAtSamples(observations, sampleTimes));
  const supportRadius = Math.min(MAX_SUPPORT_RADIUS, Math.max(3 * DAY_MS, spanDays * DAY_MS * 0.1));
  const selectedEyes = [...eyes];
  const supportTimes = dailyBins.map((days) => new Map(selectedEyes.map((eye) => [
    eye,
    [...days.entries()].filter(([, byEye]) => byEye.has(eye)).map(([time]) => time),
  ])));

  return {
    x: DIURNAL_BIN_LABELS,
    y: sampleTimes.map(formatDateInput),
    times: sampleTimes,
    z: sampleTimes.map((_, row) => columns.map((column) => column[row])),
    lowSupport: sampleTimes.map((sampleTime) => supportTimes.map((byEye) => (
      selectedEyes.some((eye) => (byEye.get(eye) ?? []).filter((time) => Math.abs(time - sampleTime) <= supportRadius).length < 2)
    ))),
  };
}

import type { Eye, SessionPoint } from "../../measurements";
import { parseDateTimeBoundary } from "../../../shared/lib/wallClock";

export type DiurnalPoint = {
  bin: number;
  minuteOfDay: number;
  mean: number;
  sd: number;
  count: number;
  periodLabel: string;
  eye: Eye;
};

export type DiurnalYAxisScale = {
  domain: [number, number];
  ticks: number[];
};

export function binDiurnalSessions(
  observations: readonly (Pick<SessionPoint, "time" | "eye" | "iop"> &
    Partial<Pick<SessionPoint, "sessionStart" | "sessionEnd">>)[],
  eye: Eye,
  period: { label: string; start: string; startTime: string },
  end: string,
  endTime: string,
  exactEnd?: number,
): DiurnalPoint[] {
  const periodStart = parseDateTimeBoundary(period.start, period.startTime);
  const periodEnd = exactEnd ?? parseDateTimeBoundary(end, endTime, "end");
  if (periodStart === null || periodEnd === null) return [];

  const buckets = Array.from({ length: 8 }, () => [] as number[]);
  for (const observation of observations) {
    if (
      observation.eye !== eye ||
      (observation.sessionStart ?? observation.time) < periodStart ||
      (observation.sessionEnd ?? observation.time) > periodEnd
    )
      continue;

    const date = new Date(observation.time);
    const minuteOfDay =
      date.getUTCHours() * 60 +
      date.getUTCMinutes() +
      date.getUTCSeconds() / 60;
    buckets[Math.min(7, Math.floor(minuteOfDay / 180))].push(observation.iop);
  }

  return buckets.flatMap((values, bin) => {
    if (values.length === 0) return [];
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance =
      values.length > 1
        ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
          (values.length - 1)
        : 0;
    return [
      {
        bin,
        minuteOfDay: bin * 180 + 90,
        mean,
        sd: Math.sqrt(variance),
        count: values.length,
        periodLabel: period.label,
        eye,
      },
    ];
  });
}

function wholeNumberTickStep(value: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(1, value)));
  const normalized = value / magnitude;
  const multiplier =
    normalized <= 1
      ? 1
      : normalized <= 2
        ? 2
        : normalized <= 3
          ? 3
          : normalized <= 5
            ? 5
            : 10;
  return multiplier * magnitude;
}

export function diurnalYAxisScale(
  points: readonly DiurnalPoint[],
  target?: number,
): DiurnalYAxisScale {
  const safeTarget =
    target !== undefined && Number.isFinite(target)
      ? Math.min(100, Math.max(0.1, target))
      : undefined;
  if (points.length === 0) {
    if (safeTarget !== undefined && (safeTarget < 10 || safeTarget > 35)) {
      const lower = Math.min(10, Math.floor(safeTarget / 5) * 5 - 5);
      const upper = Math.max(35, Math.ceil(safeTarget / 5) * 5 + 5);
      return {
        domain: [lower, upper],
        ticks: Array.from(
          { length: (upper - lower) / 5 + 1 },
          (_, index) => lower + index * 5,
        ),
      };
    }
    return { domain: [10, 35], ticks: [10, 15, 20, 25, 30, 35] };
  }

  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    minimum = Math.min(minimum, point.mean - point.sd);
    maximum = Math.max(maximum, point.mean + point.sd);
  }
  if (safeTarget !== undefined) {
    minimum = Math.min(minimum, safeTarget);
    maximum = Math.max(maximum, safeTarget);
  }

  const span = Math.max(1, maximum - minimum);
  const padding = Math.max(1, span * 0.08);
  const step = wholeNumberTickStep((span + padding * 2) / 7);
  const lower = Math.floor((minimum - padding) / step) * step;
  const upper = Math.ceil((maximum + padding) / step) * step;
  const ticks = Array.from(
    { length: Math.round((upper - lower) / step) + 1 },
    (_, index) => lower + index * step,
  );

  return { domain: [lower, upper], ticks };
}

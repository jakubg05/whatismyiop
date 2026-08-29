import { dateTimeBoundary, formatDateInput, formatTimeInput, type Eye, type SessionPoint } from "./analysis";

export type ComparisonDirection = "before" | "after";

export type EventRelativePeriod = {
  label: string;
  start: string;
  startTime: string;
  end: string;
  endTime: string;
  openEnded: false;
};

export type ComparisonQuery = {
  days: number;
  explicitDays: boolean;
  direction: ComparisonDirection | null;
  subject: string;
};

export type DiurnalPoint = {
  bin: number;
  minuteOfDay: number;
  mean: number;
  sd: number;
  count: number;
  periodLabel: string;
  eye: Eye;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DAYS = 14;
const MAX_DAYS = 3650;

export function parseComparisonQuery(value: string): ComparisonQuery {
  const normalized = value.trim().replace(/\s+/g, " ");
  const expression = normalized.replace(/^range:\s*/i, "");
  const duration = /^(\d+)\s*d(?:ays?)?(?:\s+|$)/i.exec(expression);
  const requestedDays = duration ? Number(duration[1]) : DEFAULT_DAYS;
  const days = Number.isFinite(requestedDays) ? Math.min(MAX_DAYS, Math.max(1, requestedDays)) : DEFAULT_DAYS;
  const remainder = duration ? expression.slice(duration[0].length).trim() : expression;
  const direction = /^(before|after)(?::\s*|\s+|$)/i.exec(remainder);

  return {
    days,
    explicitDays: duration !== null,
    direction: direction ? direction[1].toLowerCase() as ComparisonDirection : null,
    subject: direction ? remainder.slice(direction[0].length).trim() : remainder,
  };
}

export function fullRelativePeriod(
  target: { label: string; time: number },
  direction: ComparisonDirection,
  domainStart: number,
  domainEnd: number,
): EventRelativePeriod {
  const start = direction === "before" ? domainStart : target.time;
  const end = direction === "before" ? target.time - 60_000 : domainEnd;
  return {
    label: `${direction} ${target.label}`,
    start: formatDateInput(start),
    startTime: formatTimeInput(start),
    end: formatDateInput(end),
    endTime: formatTimeInput(end),
    openEnded: false,
  };
}

export function eventRelativePeriod(
  event: { label: string; time: number },
  direction: ComparisonDirection,
  days = DEFAULT_DAYS,
): EventRelativePeriod {
  const safeDays = Number.isFinite(days) ? Math.min(MAX_DAYS, Math.max(1, Math.round(days))) : DEFAULT_DAYS;
  const duration = safeDays * DAY_MS;
  const start = direction === "before" ? event.time - duration : event.time;
  const end = direction === "before" ? event.time - 60_000 : event.time + duration - 60_000;

  return {
    label: `${safeDays}d ${direction} ${event.label}`,
    start: formatDateInput(start),
    startTime: formatTimeInput(start),
    end: formatDateInput(end),
    endTime: formatTimeInput(end),
    openEnded: false,
  };
}

export function rangeRelativePeriod(
  range: { label: string; start: string; startTime: string; end: string; endTime: string },
  direction: ComparisonDirection,
  days = DEFAULT_DAYS,
): EventRelativePeriod | null {
  const boundary = direction === "before"
    ? dateTimeBoundary(range.start, range.startTime)
    : dateTimeBoundary(range.end, range.endTime, true);
  if (boundary === null) return null;
  const anchor = direction === "after" ? boundary + 1 : boundary;
  return eventRelativePeriod({ label: range.label, time: anchor }, direction, days);
}

export function binDiurnalSessions(
  sessions: SessionPoint[],
  eye: Eye,
  range: { label: string; start: string; startTime: string },
  end: string,
  endTime: string,
): DiurnalPoint[] {
  const rangeStart = dateTimeBoundary(range.start, range.startTime);
  const rangeEnd = dateTimeBoundary(end, endTime, true);
  if (rangeStart === null || rangeEnd === null) return [];
  const buckets = Array.from({ length: 8 }, () => [] as number[]);

  sessions
    .filter((session) => session.eye === eye && session.sessionStart >= rangeStart && session.sessionEnd <= rangeEnd)
    .forEach((session) => {
      const date = new Date(session.time);
      const minuteOfDay = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
      buckets[Math.min(7, Math.floor(minuteOfDay / 180))].push(session.iop);
    });

  return buckets.flatMap((values, bin) => {
    if (values.length === 0) return [];
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.length > 1
      ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1)
      : 0;
    return [{
      bin,
      minuteOfDay: bin * 180 + 90,
      mean,
      sd: Math.sqrt(variance),
      count: values.length,
      periodLabel: range.label,
      eye,
    }];
  });
}

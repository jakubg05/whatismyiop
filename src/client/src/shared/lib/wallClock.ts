const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const CLOCK_PATTERN = /^(\d{2}):(\d{2})$/;
const TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/;

type Boundary = "start" | "end";

function buildTimestamp(parts: readonly number[]): number | null {
  const [year, month, day, hour = 0, minute = 0, second = 0, millisecond = 0] =
    parts;
  const time = Date.UTC(
    year,
    month - 1,
    day,
    hour,
    minute,
    second,
    millisecond,
  );
  const parsed = new Date(time);
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day &&
    parsed.getUTCHours() === hour &&
    parsed.getUTCMinutes() === minute &&
    parsed.getUTCSeconds() === second &&
    parsed.getUTCMilliseconds() === millisecond
    ? time
    : null;
}

export function parseWallClockTimestamp(value: string): number | null {
  const match = TIMESTAMP_PATTERN.exec(value.trim());
  return match ? buildTimestamp(match.slice(1).map(Number)) : null;
}

export function parseDateTimeBoundary(
  date: string,
  clock: string,
  boundary: Boundary = "start",
): number | null {
  const dateMatch = DATE_PATTERN.exec(date);
  const clockMatch = CLOCK_PATTERN.exec(clock);
  if (!dateMatch || !clockMatch) return null;
  return buildTimestamp([
    ...dateMatch.slice(1).map(Number),
    ...clockMatch.slice(1).map(Number),
    boundary === "end" ? 59 : 0,
    boundary === "end" ? 999 : 0,
  ]);
}

export function formatDateInput(time: number): string {
  const date = new Date(time);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatTimeInput(time: number): string {
  const date = new Date(time);
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  return `${hour}:${minute}`;
}

export function formatFullTime(time: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(time));
}

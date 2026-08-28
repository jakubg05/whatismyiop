import Papa from "papaparse";

export type Eye = "OD" | "OS";
export type Quality = "Excellent" | "Good" | "Satisfactory" | string;
export type SessionAggregation = "median" | "average";

export type Measurement = {
  sourceRow: number;
  timestampText: string;
  time: number;
  eye: Eye;
  iop: number;
  quality: Quality;
  qualityRaw: string;
  comment: string;
  position: string;
};

export type SessionPoint = {
  sessionId: number;
  sessionStart: number;
  sessionEnd: number;
  time: number;
  eye: Eye;
  iop: number;
  measurements: Measurement[];
};

export type ParseResult = {
  measurements: Measurement[];
  sourceRows: number;
  rejectedRows: number;
  warnings: string[];
};

export type Summary = {
  count: number;
  mean: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
};

const REQUIRED_COLUMNS = ["Date / Time", "IOP (OD)", "IOP (OS)"] as const;
const NUMBER_PATTERN = /^\d+(?:\.\d+)?$/;
const TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/;
export const SESSION_WINDOW_MS = 10 * 60 * 1000;

export function parseWallTime(value: string): number | null {
  const match = TIMESTAMP_PATTERN.exec(value.trim());
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match.map(Number);
  const time = Date.UTC(year, month - 1, day, hour, minute, second);
  const check = new Date(time);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day ||
    check.getUTCHours() !== hour ||
    check.getUTCMinutes() !== minute ||
    check.getUTCSeconds() !== second
  ) {
    return null;
  }
  return time;
}

function parseIop(value: unknown): number | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (!NUMBER_PATTERN.test(text)) return Number.NaN;
  const result = Number(text);
  return Number.isFinite(result) ? result : Number.NaN;
}

export function parseMeasurementsCsv(csvText: string): ParseResult {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    delimiter: ";",
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.replace(/^\uFEFF/, "").trim(),
  });

  const fields = parsed.meta.fields ?? [];
  const missing = REQUIRED_COLUMNS.filter((column) => !fields.includes(column));
  if (missing.length > 0) {
    throw new Error(`Missing required column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`);
  }

  const measurements: Measurement[] = [];
  const warnings = parsed.errors.map(
    (error) => `CSV row ${(error.row ?? 0) + 2}: ${error.message}`,
  );
  let rejectedRows = 0;

  parsed.data.forEach((row, index) => {
    const sourceRow = index + 2;
    const timestampText = String(row["Date / Time"] ?? "").trim();
    const time = parseWallTime(timestampText);
    if (time === null) {
      rejectedRows += 1;
      warnings.push(`Row ${sourceRow}: invalid Date / Time "${timestampText}".`);
      return;
    }

    const candidates = [
      {
        eye: "OD" as const,
        value: parseIop(row["IOP (OD)"]),
        quality: row["Quality OD"],
        qualityRaw: row["Quality OD raw"],
        comment: row["OD Comment"],
      },
      {
        eye: "OS" as const,
        value: parseIop(row["IOP (OS)"]),
        quality: row["Quality OS"],
        qualityRaw: row["Quality OS raw"],
        comment: row["OS Comment"],
      },
    ];

    const populated = candidates.filter((candidate) => candidate.value !== null);
    if (populated.length === 0) {
      rejectedRows += 1;
      warnings.push(`Row ${sourceRow}: no OD or OS pressure value.`);
      return;
    }

    for (const candidate of populated) {
      if (Number.isNaN(candidate.value)) {
        warnings.push(`Row ${sourceRow}: invalid ${candidate.eye} pressure value.`);
        continue;
      }
      measurements.push({
        sourceRow,
        timestampText,
        time,
        eye: candidate.eye,
        iop: candidate.value!,
        quality: String(candidate.quality ?? "").trim() || "Not recorded",
        qualityRaw: String(candidate.qualityRaw ?? "").trim(),
        comment: String(candidate.comment ?? "").trim(),
        position: String(row.Position ?? "").trim(),
      });
    }
  });

  measurements.sort((a, b) => a.time - b.time || a.sourceRow - b.sourceRow);
  return { measurements, sourceRows: parsed.data.length, rejectedRows, warnings };
}

export function summarize(measurements: Measurement[]): Summary {
  if (measurements.length === 0) {
    return { count: 0, mean: null, median: null, min: null, max: null };
  }
  const values = measurements.map((measurement) => measurement.iop).sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  const median = values.length % 2 === 0
    ? (values[middle - 1] + values[middle]) / 2
    : values[middle];
  return {
    count: values.length,
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
    median,
    min: values[0],
    max: values[values.length - 1],
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export function coalesceMeasurementSessions(
  measurements: Measurement[],
  aggregation: SessionAggregation = "median",
  sessionWindowMs = SESSION_WINDOW_MS,
): SessionPoint[] {
  if (measurements.length === 0) return [];

  const ordered = [...measurements].sort((a, b) => a.time - b.time || a.sourceRow - b.sourceRow);
  const sessions: Array<{ start: number; end: number; measurements: Measurement[] }> = [];

  for (const measurement of ordered) {
    const current = sessions.at(-1);
    if (!current || measurement.time - current.start > sessionWindowMs) {
      sessions.push({ start: measurement.time, end: measurement.time, measurements: [measurement] });
      continue;
    }
    current.end = measurement.time;
    current.measurements.push(measurement);
  }

  return sessions.flatMap((session, sessionId) => {
    const sessionTime = session.start + (session.end - session.start) / 2;
    return (["OD", "OS"] as Eye[]).flatMap((eye) => {
      const eyeMeasurements = session.measurements.filter((measurement) => measurement.eye === eye);
      if (eyeMeasurements.length === 0) return [];
      const values = eyeMeasurements.map((measurement) => measurement.iop);
      return [{
        sessionId,
        sessionStart: session.start,
        sessionEnd: session.end,
        time: sessionTime,
        eye,
        iop: aggregation === "median"
          ? median(values)
          : values.reduce((sum, value) => sum + value, 0) / values.length,
        measurements: eyeMeasurements,
      }];
    });
  });
}

export function dateBoundary(value: string, endOfDay = false): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  return Date.UTC(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
}

export function dateTimeBoundary(value: string, clock: string, endOfMinute = false): number | null {
  const date = dateBoundary(value);
  const match = /^(\d{2}):(\d{2})$/.exec(clock);
  if (date === null || !match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return date + hour * 3_600_000 + minute * 60_000 + (endOfMinute ? 59_999 : 0);
}

export function formatDateInput(time: number): string {
  const date = new Date(time);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function inDateRange(measurement: Measurement, start: string, end: string, startClock?: string, endClock?: string): boolean {
  const startTime = startClock ? dateTimeBoundary(start, startClock) : dateBoundary(start);
  const endTime = endClock ? dateTimeBoundary(end, endClock, true) : dateBoundary(end, true);
  if (startTime === null || endTime === null) return false;
  return measurement.time >= startTime && measurement.time <= endTime;
}

export function formatChartTime(time: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "2-digit",
  }).format(new Date(time));
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

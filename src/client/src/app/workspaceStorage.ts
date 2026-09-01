import {
  parseMeasurementsCsv,
  type Measurement,
} from "../features/measurements";
import {
  annotationLabelError,
  type TimelineEvent,
  type TreatmentPeriod,
} from "../features/annotations";
import { parseDateTimeBoundary } from "../shared/lib/wallClock";

export const WORKSPACE_STORAGE_KEY = "whatismyiop:v1";

export type Workspace = {
  fileName: string;
  csvText: string;
  measurements: Measurement[];
  periods: TreatmentPeriod[];
  events: TimelineEvent[];
};

type StoredWorkspace = {
  version: 1;
  fileName: string;
  csvText: string;
  ranges: TreatmentPeriod[];
  events: TimelineEvent[];
};

const WORKSPACE_FIELDS = [
  "version",
  "fileName",
  "csvText",
  "ranges",
  "events",
] as const;
const PERIOD_FIELDS = [
  "id",
  "label",
  "start",
  "startTime",
  "end",
  "endTime",
  "openEnded",
] as const;
const EVENT_FIELDS = ["id", "label", "time"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactlyFields(
  value: Record<string, unknown>,
  fields: readonly string[],
): boolean {
  const keys = Object.keys(value);
  return (
    keys.length === fields.length &&
    fields.every((field) => Object.hasOwn(value, field))
  );
}

function isNonemptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parsePeriod(value: unknown, index: number): TreatmentPeriod {
  if (!isRecord(value) || !hasExactlyFields(value, PERIOD_FIELDS)) {
    throw new Error(
      `Saved period ${index + 1} does not match the current format.`,
    );
  }

  const { id, label, start, startTime, end, endTime, openEnded } = value;
  if (!isNonemptyString(id))
    throw new Error(`Saved period ${index + 1} has an invalid ID.`);
  if (!isNonemptyString(label))
    throw new Error(`Saved period ${index + 1} has an invalid label.`);
  if (typeof start !== "string" || typeof startTime !== "string") {
    throw new Error(`Saved period ${index + 1} has an invalid start.`);
  }
  if (
    typeof end !== "string" ||
    typeof endTime !== "string" ||
    typeof openEnded !== "boolean"
  ) {
    throw new Error(`Saved period ${index + 1} has an invalid end.`);
  }

  const startBoundary = parseDateTimeBoundary(start, startTime);
  if (startBoundary === null)
    throw new Error(`Saved period ${index + 1} has an invalid start.`);

  if (openEnded) {
    if (end !== "" || endTime !== "") {
      throw new Error(`Saved period ${index + 1} has an invalid open end.`);
    }
  } else {
    const endBoundary = parseDateTimeBoundary(end, endTime, "end");
    if (endBoundary === null || startBoundary > endBoundary) {
      throw new Error(`Saved period ${index + 1} has an invalid end.`);
    }
  }

  return { id, label, start, startTime, end, endTime, openEnded };
}

function parseEvent(value: unknown, index: number): TimelineEvent {
  if (!isRecord(value) || !hasExactlyFields(value, EVENT_FIELDS)) {
    throw new Error(
      `Saved event ${index + 1} does not match the current format.`,
    );
  }

  const { id, label, time } = value;
  if (!isNonemptyString(id))
    throw new Error(`Saved event ${index + 1} has an invalid ID.`);
  if (!isNonemptyString(label))
    throw new Error(`Saved event ${index + 1} has an invalid label.`);
  if (typeof time !== "number" || !Number.isFinite(time)) {
    throw new Error(`Saved event ${index + 1} has an invalid time.`);
  }
  return { id, label, time };
}

function assertUniqueIds(
  periods: readonly TreatmentPeriod[],
  events: readonly TimelineEvent[],
): void {
  const ids = new Set<string>();
  for (const item of [...periods, ...events]) {
    if (ids.has(item.id))
      throw new Error(
        `Saved annotations contain the duplicate ID "${item.id}".`,
      );
    ids.add(item.id);
  }
}

function assertValidLabels(
  periods: readonly TreatmentPeriod[],
  events: readonly TimelineEvent[],
): void {
  const catalog = { periods, events };
  for (const period of periods) {
    const error = annotationLabelError(
      period.label,
      "period",
      catalog,
      period.id,
    );
    if (error)
      throw new Error(`Saved period "${period.label}" is invalid. ${error}`);
  }
  for (const event of events) {
    const error = annotationLabelError(event.label, "event", catalog, event.id);
    if (error)
      throw new Error(`Saved event "${event.label}" is invalid. ${error}`);
  }
}

export function deserializeWorkspace(json: string): Workspace {
  const value: unknown = JSON.parse(json);
  if (!isRecord(value) || !hasExactlyFields(value, WORKSPACE_FIELDS)) {
    throw new Error(
      "Saved browser data does not match the current workspace format.",
    );
  }
  if (value.version !== 1)
    throw new Error(
      "Saved browser data uses an unsupported workspace version.",
    );
  if (!isNonemptyString(value.fileName))
    throw new Error("Saved browser data has an invalid file name.");
  if (typeof value.csvText !== "string")
    throw new Error("Saved browser data has invalid CSV text.");
  if (!Array.isArray(value.ranges) || !Array.isArray(value.events)) {
    throw new Error("Saved browser data has invalid annotations.");
  }

  const periods = value.ranges.map(parsePeriod);
  const events = value.events.map(parseEvent);
  assertUniqueIds(periods, events);
  assertValidLabels(periods, events);

  return {
    fileName: value.fileName,
    csvText: value.csvText,
    measurements: parseMeasurementsCsv(value.csvText),
    periods,
    events,
  };
}

export function serializeWorkspace(workspace: Workspace): string {
  const stored: StoredWorkspace = {
    version: 1,
    fileName: workspace.fileName,
    csvText: workspace.csvText,
    ranges: workspace.periods,
    events: workspace.events,
  };
  return JSON.stringify(stored);
}

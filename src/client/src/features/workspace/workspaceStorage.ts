import {
  formatWallClockTimestamp,
  parseDateTimeBoundary,
  parseWallClockTimestamp,
} from "../../shared/lib/wallClock";
import {
  annotationLabelError,
  type PointAnnotation,
  type TreatmentPeriod,
} from "../annotations";
import type { Eye, Measurement } from "../measurements";

export const WORKSPACE_STORAGE_KEY = "whatismyiop:v1";
export const REPORT_FILE_EXTENSION = ".whatismyiop";
export const REPORT_FORMAT = "whatismyiop-report";
export const REPORT_VERSION = 1;

const GENERATOR_NAME = "WhatIsMyIOP";
const GENERATOR_VERSION = "0.1.0";

export type Workspace = {
  measurements: Measurement[];
  periods: TreatmentPeriod[];
  annotations: PointAnnotation[];
};

type StoredMeasurement = {
  measuredAt: string;
  eye: Eye;
  iop: number;
  quality: string;
  position: string;
  sequence: number;
};

type StoredAnnotation = {
  id: string;
  label: string;
  annotatedAt: string;
};

type WorkspacePayload = {
  measurements: StoredMeasurement[];
  periods: TreatmentPeriod[];
  annotations: StoredAnnotation[];
};

type StoredWorkspace = WorkspacePayload & { version: 1 };

type Report = WorkspacePayload & {
  format: typeof REPORT_FORMAT;
  version: 1;
  generatedAt: string;
  generator: { name: typeof GENERATOR_NAME; version: string };
};

const MEASUREMENT_FIELDS = [
  "measuredAt",
  "eye",
  "iop",
  "quality",
  "position",
  "sequence",
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
const ANNOTATION_FIELDS = ["id", "label", "annotatedAt"] as const;
const PAYLOAD_FIELDS = ["measurements", "periods", "annotations"] as const;
const STORAGE_FIELDS = ["version", ...PAYLOAD_FIELDS] as const;
const REPORT_FIELDS = [
  "format",
  "version",
  "generatedAt",
  "generator",
  ...PAYLOAD_FIELDS,
] as const;
const GENERATOR_FIELDS = ["name", "version"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactlyFields(
  value: Record<string, unknown>,
  fields: readonly string[],
): boolean {
  const keys = Object.keys(value);
  return keys.length === fields.length && fields.every((field) => Object.hasOwn(value, field));
}

function isNonemptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseMeasurement(value: unknown, index: number): Measurement {
  if (!isRecord(value) || !hasExactlyFields(value, MEASUREMENT_FIELDS)) {
    throw new Error(`Measurement ${index + 1} does not match the current format.`);
  }
  const { measuredAt, eye, iop, quality, position, sequence } = value;
  const time = typeof measuredAt === "string" ? parseWallClockTimestamp(measuredAt) : null;
  if (time === null) throw new Error(`Measurement ${index + 1} has an invalid date or time.`);
  if (eye !== "OD" && eye !== "OS") throw new Error(`Measurement ${index + 1} has an invalid eye.`);
  if (typeof iop !== "number" || !Number.isFinite(iop)) {
    throw new Error(`Measurement ${index + 1} has an invalid IOP value.`);
  }
  if (typeof quality !== "string" || typeof position !== "string") {
    throw new Error(`Measurement ${index + 1} has invalid measurement details.`);
  }
  if (!Number.isSafeInteger(sequence) || (sequence as number) < 0) {
    throw new Error(`Measurement ${index + 1} has an invalid sequence.`);
  }
  return { time, eye, iop, quality, position, sequence: sequence as number };
}

function parsePeriod(value: unknown, index: number): TreatmentPeriod {
  if (!isRecord(value) || !hasExactlyFields(value, PERIOD_FIELDS)) {
    throw new Error(`Period ${index + 1} does not match the current format.`);
  }
  const { id, label, start, startTime, end, endTime, openEnded } = value;
  if (!isNonemptyString(id)) throw new Error(`Period ${index + 1} has an invalid ID.`);
  if (!isNonemptyString(label)) throw new Error(`Period ${index + 1} has an invalid label.`);
  if (typeof start !== "string" || typeof startTime !== "string") {
    throw new Error(`Period ${index + 1} has an invalid start.`);
  }
  if (typeof end !== "string" || typeof endTime !== "string" || typeof openEnded !== "boolean") {
    throw new Error(`Period ${index + 1} has an invalid end.`);
  }
  const startBoundary = parseDateTimeBoundary(start, startTime);
  if (startBoundary === null) throw new Error(`Period ${index + 1} has an invalid start.`);
  if (openEnded) {
    if (end !== "" || endTime !== "") throw new Error(`Period ${index + 1} has an invalid open end.`);
  } else {
    const endBoundary = parseDateTimeBoundary(end, endTime, "end");
    if (endBoundary === null || startBoundary > endBoundary) {
      throw new Error(`Period ${index + 1} has an invalid end.`);
    }
  }
  return { id, label, start, startTime, end, endTime, openEnded };
}

function parseAnnotation(value: unknown, index: number): PointAnnotation {
  if (!isRecord(value) || !hasExactlyFields(value, ANNOTATION_FIELDS)) {
    throw new Error(`Annotation ${index + 1} does not match the current format.`);
  }
  const { id, label, annotatedAt } = value;
  if (!isNonemptyString(id)) throw new Error(`Annotation ${index + 1} has an invalid ID.`);
  if (!isNonemptyString(label)) throw new Error(`Annotation ${index + 1} has an invalid label.`);
  const time = typeof annotatedAt === "string"
    ? parseWallClockTimestamp(annotatedAt)
    : null;
  if (time === null) {
    throw new Error(`Annotation ${index + 1} has an invalid time.`);
  }
  return { id, label, time };
}

function parsePayload(value: Record<string, unknown>): Workspace {
  if (!Array.isArray(value.measurements) || !Array.isArray(value.periods) || !Array.isArray(value.annotations)) {
    throw new Error("The saved data does not contain valid workspace lists.");
  }
  const measurements = value.measurements.map(parseMeasurement);
  const periods = value.periods.map(parsePeriod);
  const annotations = value.annotations.map(parseAnnotation);

  const sequences = new Set<number>();
  for (const measurement of measurements) {
    if (sequences.has(measurement.sequence)) {
      throw new Error(`Measurements contain duplicate sequence ${measurement.sequence}.`);
    }
    sequences.add(measurement.sequence);
  }

  const ids = new Set<string>();
  for (const item of [...periods, ...annotations]) {
    if (ids.has(item.id)) throw new Error(`Saved annotations contain the duplicate ID "${item.id}".`);
    ids.add(item.id);
  }

  const catalog = { periods, annotations };
  for (const period of periods) {
    const error = annotationLabelError(period.label, "period", catalog, period.id);
    if (error) throw new Error(`Period "${period.label}" is invalid. ${error}`);
  }
  for (const annotation of annotations) {
    const error = annotationLabelError(annotation.label, "annotation", catalog, annotation.id);
    if (error) throw new Error(`Annotation "${annotation.label}" is invalid. ${error}`);
  }

  measurements.sort((left, right) => left.time - right.time || left.sequence - right.sequence);
  return { measurements, periods, annotations };
}

function workspacePayload(workspace: Workspace): WorkspacePayload {
  return {
    measurements: workspace.measurements.map((measurement) => ({
      measuredAt: formatWallClockTimestamp(measurement.time),
      eye: measurement.eye,
      iop: measurement.iop,
      quality: measurement.quality,
      position: measurement.position,
      sequence: measurement.sequence,
    })),
    periods: workspace.periods,
    annotations: workspace.annotations.map((annotation) => ({
      id: annotation.id,
      label: annotation.label,
      annotatedAt: formatWallClockTimestamp(annotation.time),
    })),
  };
}

export function deserializeWorkspace(json: string): Workspace {
  const value: unknown = JSON.parse(json);
  if (!isRecord(value) || !hasExactlyFields(value, STORAGE_FIELDS)) {
    throw new Error("Saved browser data does not match the current workspace format.");
  }
  if (value.version !== 1) throw new Error("Saved browser data uses an unsupported workspace version.");
  return parsePayload(value);
}

export function serializeWorkspace(workspace: Workspace): string {
  const stored: StoredWorkspace = { version: 1, ...workspacePayload(workspace) };
  return JSON.stringify(stored);
}

export function deserializeReport(json: string): Workspace {
  const value: unknown = JSON.parse(json);
  if (!isRecord(value) || value.format !== REPORT_FORMAT) {
    throw new Error("This is not a WhatIsMyIOP report.");
  }
  if (value.version !== REPORT_VERSION) {
    throw new Error(
      typeof value.version === "number" && value.version > REPORT_VERSION
        ? "This report was created by a newer version of WhatIsMyIOP and cannot be opened here yet."
        : "This report uses an unsupported WhatIsMyIOP format version.",
    );
  }
  if (!hasExactlyFields(value, REPORT_FIELDS)) {
    throw new Error("This report does not match the current WhatIsMyIOP format.");
  }
  if (typeof value.generatedAt !== "string" || !Number.isFinite(Date.parse(value.generatedAt))) {
    throw new Error("This report has an invalid generation time.");
  }
  if (
    !isRecord(value.generator) ||
    !hasExactlyFields(value.generator, GENERATOR_FIELDS) ||
    value.generator.name !== GENERATOR_NAME ||
    !isNonemptyString(value.generator.version)
  ) {
    throw new Error("This report has invalid generator information.");
  }
  return parsePayload(value);
}

export function serializeReport(workspace: Workspace, generatedAt = new Date()): string {
  const report: Report = {
    format: REPORT_FORMAT,
    version: REPORT_VERSION,
    generatedAt: generatedAt.toISOString(),
    generator: { name: GENERATOR_NAME, version: GENERATOR_VERSION },
    ...workspacePayload(workspace),
  };
  return JSON.stringify(report, null, 2);
}

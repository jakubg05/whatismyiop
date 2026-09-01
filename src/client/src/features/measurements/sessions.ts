import { mean, median } from "../../shared/lib/statistics";
import type { Eye, Measurement } from "./measurements";

export type SessionAggregation = "median" | "average";
export type MeasurementView = "sessions" | "raw";

export type SessionPoint = {
  sessionId: number;
  sessionStart: number;
  sessionEnd: number;
  time: number;
  eye: Eye;
  iop: number;
  measurements: Measurement[];
};

type MeasurementSession = {
  start: number;
  end: number;
  measurementsByEye: Record<Eye, Measurement[]>;
};

const SESSION_WINDOW_MS = 10 * 60 * 1000;
const EYES: readonly Eye[] = ["OD", "OS"];

export function aggregateMeasurementSessions(
  measurements: readonly Measurement[],
  aggregation: SessionAggregation = "median",
): SessionPoint[] {
  let ordered = measurements;
  for (let index = 1; index < measurements.length; index += 1) {
    const previous = measurements[index - 1];
    const current = measurements[index];
    if (
      previous.time > current.time ||
      (previous.time === current.time && previous.sequence > current.sequence)
    ) {
      ordered = [...measurements].sort(
        (left, right) =>
          left.time - right.time || left.sequence - right.sequence,
      );
      break;
    }
  }
  const sessions: MeasurementSession[] = [];

  for (const measurement of ordered) {
    const session = sessions.at(-1);
    if (!session || measurement.time - session.start > SESSION_WINDOW_MS) {
      sessions.push({
        start: measurement.time,
        end: measurement.time,
        measurementsByEye: {
          OD: measurement.eye === "OD" ? [measurement] : [],
          OS: measurement.eye === "OS" ? [measurement] : [],
        },
      });
      continue;
    }
    session.end = measurement.time;
    session.measurementsByEye[measurement.eye].push(measurement);
  }

  const points: SessionPoint[] = [];
  for (let sessionId = 0; sessionId < sessions.length; sessionId += 1) {
    const session = sessions[sessionId];
    const sessionTime = session.start + (session.end - session.start) / 2;
    for (const eye of EYES) {
      const eyeMeasurements = session.measurementsByEye[eye];
      if (eyeMeasurements.length === 0) continue;
      const values = eyeMeasurements.map((measurement) => measurement.iop);
      points.push({
        sessionId,
        sessionStart: session.start,
        sessionEnd: session.end,
        time: sessionTime,
        eye,
        iop: aggregation === "median" ? median(values) : mean(values),
        measurements: eyeMeasurements,
      });
    }
  }
  return points;
}

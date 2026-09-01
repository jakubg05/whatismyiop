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
  measurements: Measurement[];
};

const SESSION_WINDOW_MS = 10 * 60 * 1000;
const EYES: readonly Eye[] = ["OD", "OS"];

export function aggregateMeasurementSessions(
  measurements: readonly Measurement[],
  aggregation: SessionAggregation = "median",
): SessionPoint[] {
  const ordered = [...measurements].sort(
    (left, right) => left.time - right.time || left.sequence - right.sequence,
  );
  const sessions: MeasurementSession[] = [];

  for (const measurement of ordered) {
    const session = sessions.at(-1);
    if (!session || measurement.time - session.start > SESSION_WINDOW_MS) {
      sessions.push({
        start: measurement.time,
        end: measurement.time,
        measurements: [measurement],
      });
      continue;
    }
    session.end = measurement.time;
    session.measurements.push(measurement);
  }

  return sessions.flatMap((session, sessionId) => {
    const sessionTime = session.start + (session.end - session.start) / 2;
    return EYES.flatMap((eye): SessionPoint[] => {
      const eyeMeasurements = session.measurements.filter(
        (measurement) => measurement.eye === eye,
      );
      if (eyeMeasurements.length === 0) return [];
      const values = eyeMeasurements.map((measurement) => measurement.iop);
      return [
        {
          sessionId,
          sessionStart: session.start,
          sessionEnd: session.end,
          time: sessionTime,
          eye,
          iop: aggregation === "median" ? median(values) : mean(values),
          measurements: eyeMeasurements,
        },
      ];
    });
  });
}

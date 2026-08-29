import { describe, expect, it } from "vitest";
import {
  coalesceMeasurementSessions,
  type Eye,
  type Measurement,
} from "./analysis";

const minute = 60 * 1000;

function reading(minuteOffset: number, eye: Eye, iop: number, position = "Sitting"): Measurement {
  return {
    sourceRow: minuteOffset + (eye === "OD" ? 2 : 3),
    timestampText: "2026-08-28T12:00:00",
    time: minuteOffset * minute,
    eye,
    iop,
    quality: "Good",
    qualityRaw: "",
    comment: "",
    position,
  };
}

describe("measurement sessions", () => {
  it("coalesces both eyes and different positions into one anchored session", () => {
    const points = coalesceMeasurementSessions([
      reading(0, "OD", 20, "Sitting"),
      reading(2, "OS", 23, "Supine"),
      reading(4, "OD", 22, "Supine"),
    ]);

    expect(points).toHaveLength(2);
    expect(points.map((point) => point.sessionId)).toEqual([0, 0]);
    expect(points.map((point) => [point.eye, point.iop])).toEqual([
      ["OD", 21],
      ["OS", 23],
    ]);
    expect(points.every((point) => point.time === 2 * minute)).toBe(true);
  });

  it("does not chain a long sequence into one session", () => {
    const points = coalesceMeasurementSessions([
      reading(0, "OD", 20),
      reading(9, "OD", 22),
      reading(18, "OD", 24),
    ]);

    expect(points).toHaveLength(2);
    expect(points[0].measurements).toHaveLength(2);
    expect(points[0].iop).toBe(21);
    expect(points[1].measurements).toHaveLength(1);
    expect(points[1].iop).toBe(24);
  });

  it("can represent a session by its average", () => {
    const measurements = [
      reading(0, "OD", 20),
      reading(2, "OD", 22),
      reading(4, "OD", 30),
    ];
    const medianPoints = coalesceMeasurementSessions(measurements);
    const averagePoints = coalesceMeasurementSessions(measurements, "average");

    expect(medianPoints[0].iop).toBe(22);
    expect(averagePoints).toHaveLength(1);
    expect(averagePoints[0].iop).toBe(24);
  });
});

import { describe, expect, it } from "vitest";
import type { Eye, Measurement, SessionPoint } from "../../../measurements";
import {
  buildDiurnalHeatmapData,
  heatmapReadingsForView,
} from "../history/diurnalHeatmapData";

function domain(
  startDate: string,
  endDate = startDate,
): readonly [number, number] {
  return [
    Date.parse(`${startDate}T00:00:00Z`),
    Date.parse(`${endDate}T23:59:59.999Z`),
  ];
}

function session(
  timestamp: string,
  eye: Eye,
  iop: number,
  id: number,
): SessionPoint {
  const time = Date.parse(`${timestamp}Z`);
  return {
    sessionId: id,
    sessionStart: time,
    sessionEnd: time,
    time,
    eye,
    iop,
    measurements: [],
  };
}

function reading(
  timestamp: string,
  iop: number,
  sourceRow: number,
): Measurement {
  const time = Date.parse(`${timestamp}Z`);
  return {
    sourceRow,
    time,
    eye: "OD",
    iop,
    quality: "Good",
    position: "Sitting",
  };
}

describe("diurnal heatmap data", () => {
  it("builds an independent calendar trend for every three-hour window", () => {
    const data = buildDiurnalHeatmapData(
      [
        session("2026-01-01T01:00:00", "OD", 10, 1),
        session("2026-01-03T01:00:00", "OD", 20, 2),
        session("2026-01-01T04:00:00", "OD", 30, 3),
        session("2026-01-03T04:00:00", "OD", 40, 4),
        session("2026-01-02T01:00:00", "OS", 99, 5),
        session("2026-01-04T01:00:00", "OD", 99, 6),
      ],
      "OD",
      domain("2026-01-01", "2026-01-03"),
    );

    expect(data.times).toEqual([
      Date.parse("2026-01-01T00:00:00Z"),
      Date.parse("2026-01-02T00:00:00Z"),
      Date.parse("2026-01-03T00:00:00Z"),
    ]);
    expect(data.z.map((row) => row.slice(0, 2))).toEqual([
      [10, 30],
      [15, 35],
      [20, 40],
    ]);
    expect(
      data.z.every((row) => row.slice(2).every((value) => value === null)),
    ).toBe(true);
    expect(
      data.lowSupport.every((row) =>
        row.slice(0, 2).every((value) => value === false),
      ),
    ).toBe(true);
    expect(
      data.lowSupport.every((row) =>
        row.slice(2).every((value) => value === true),
      ),
    ).toBe(true);
  });

  it("averages sessions from the same day and time window before fitting", () => {
    const data = buildDiurnalHeatmapData(
      [
        session("2026-01-01T01:00:00", "OD", 16, 1),
        session("2026-01-01T02:00:00", "OD", 20, 2),
      ],
      "OD",
      domain("2026-01-01", "2026-01-02"),
    );

    expect(data.z[0][0]).toBe(18);
    expect(data.z[1][0]).toBe(18);
    expect(data.lowSupport.every((row) => row[0] === true)).toBe(true);
  });

  it("uses raw readings or aggregated sessions from the active measurement view", () => {
    const measurements = [
      reading("2026-01-01T01:00:00", 10, 1),
      reading("2026-01-01T01:01:00", 10, 2),
      reading("2026-01-01T01:02:00", 40, 3),
    ];
    const range = domain("2026-01-01");
    const raw = buildDiurnalHeatmapData(
      heatmapReadingsForView(measurements, "raw", "median"),
      "OD",
      range,
    );
    const medianSessions = buildDiurnalHeatmapData(
      heatmapReadingsForView(measurements, "sessions", "median"),
      "OD",
      range,
    );
    const averageSessions = buildDiurnalHeatmapData(
      heatmapReadingsForView(measurements, "sessions", "average"),
      "OD",
      range,
    );

    expect(raw.z[0][0]).toBe(20);
    expect(medianSessions.z[0][0]).toBe(10);
    expect(averageSessions.z[0][0]).toBe(20);
  });

  it("assigns each reading using its own timestamp at an exact bin boundary", () => {
    const data = buildDiurnalHeatmapData(
      [
        session("2026-01-01T02:59:59", "OD", 12, 1),
        session("2026-01-01T03:00:00", "OD", 24, 2),
      ],
      "OD",
      domain("2026-01-01"),
    );

    expect(data.z[0].slice(0, 2)).toEqual([12, 24]);
  });
});

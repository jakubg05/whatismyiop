import { describe, expect, it } from "vitest";
import type { Eye, Measurement, SessionPoint } from "./analysis";
import { buildDiurnalHeatmapData, DIURNAL_BIN_LABELS, heatmapReadingsForView } from "./diurnalHeatmapData";

function session(timestamp: string, eye: Eye, iop: number, id: number): SessionPoint {
  const time = Date.parse(`${timestamp}Z`);
  return { sessionId: id, sessionStart: time, sessionEnd: time, time, eye, iop, measurements: [] };
}

function reading(timestamp: string, iop: number, sourceRow: number): Measurement {
  const time = Date.parse(`${timestamp}Z`);
  return {
    sourceRow,
    timestampText: timestamp,
    time,
    eye: "OD",
    iop,
    quality: "Good",
    qualityRaw: "",
    comment: "",
    position: "Sitting",
  };
}

describe("diurnal heatmap data", () => {
  it("builds an independent calendar trend for every three-hour window", () => {
    const data = buildDiurnalHeatmapData([
      session("2026-01-01T01:00:00", "OD", 10, 1),
      session("2026-01-03T01:00:00", "OD", 20, 2),
      session("2026-01-01T04:00:00", "OD", 30, 3),
      session("2026-01-03T04:00:00", "OD", 40, 4),
      session("2026-01-02T01:00:00", "OS", 99, 5),
      session("2026-01-04T01:00:00", "OD", 99, 6),
    ], "OD", { start: "2026-01-01", startTime: "00:00" }, "2026-01-03", "23:59");

    expect(data.x).toEqual(DIURNAL_BIN_LABELS);
    expect(data.y).toEqual(["2026-01-01", "2026-01-02", "2026-01-03"]);
    expect(data.z.map((row) => row.slice(0, 2))).toEqual([
      [10, 30],
      [15, 35],
      [20, 40],
    ]);
    expect(data.z.every((row) => row.slice(2).every((value) => value === null))).toBe(true);
    expect(data.lowSupport.every((row) => row.slice(0, 2).every((value) => value === false))).toBe(true);
    expect(data.lowSupport.every((row) => row.slice(2).every((value) => value === true))).toBe(true);
  });

  it("averages sessions from the same day and time window before fitting", () => {
    const data = buildDiurnalHeatmapData([
      session("2026-01-01T01:00:00", "OD", 16, 1),
      session("2026-01-01T02:00:00", "OD", 20, 2),
    ], "OD", { start: "2026-01-01", startTime: "00:00" }, "2026-01-02", "23:59");

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
    const range = { start: "2026-01-01", startTime: "00:00" };
    const raw = buildDiurnalHeatmapData(
      heatmapReadingsForView(measurements, "raw", "median"),
      "OD",
      range,
      "2026-01-01",
      "23:59",
    );
    const medianSessions = buildDiurnalHeatmapData(
      heatmapReadingsForView(measurements, "sessions", "median"),
      "OD",
      range,
      "2026-01-01",
      "23:59",
    );
    const averageSessions = buildDiurnalHeatmapData(
      heatmapReadingsForView(measurements, "sessions", "average"),
      "OD",
      range,
      "2026-01-01",
      "23:59",
    );

    expect(raw.z[0][0]).toBe(20);
    expect(medianSessions.z[0][0]).toBe(10);
    expect(averageSessions.z[0][0]).toBe(20);
  });

  it("combines only the currently selected eyes", () => {
    const sessions = [
      session("2026-01-01T01:00:00", "OD", 10, 1),
      session("2026-01-01T01:30:00", "OD", 10, 2),
      session("2026-01-01T02:00:00", "OS", 30, 3),
    ];
    const both = buildDiurnalHeatmapData(sessions, ["OD", "OS"], { start: "2026-01-01", startTime: "00:00" }, "2026-01-01", "23:59");
    const left = buildDiurnalHeatmapData(sessions, ["OS"], { start: "2026-01-01", startTime: "00:00" }, "2026-01-01", "23:59");

    expect(both.z[0][0]).toBe(20);
    expect(left.z[0][0]).toBe(30);
  });

  it("assigns each reading using its own timestamp at an exact bin boundary", () => {
    const data = buildDiurnalHeatmapData([
      session("2026-01-01T02:59:59", "OD", 12, 1),
      session("2026-01-01T03:00:00", "OD", 24, 2),
    ], "OD", { start: "2026-01-01", startTime: "00:00" }, "2026-01-01", "23:59");

    expect(data.z[0].slice(0, 2)).toEqual([12, 24]);
  });
});

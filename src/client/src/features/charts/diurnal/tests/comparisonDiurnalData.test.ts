import { describe, expect, it } from "vitest";
import {
  aggregateMeasurementSessions,
  type Measurement,
} from "../../../measurements";
import {
  binDiurnalSessions,
  diurnalYAxisScale,
} from "../comparison/comparisonDiurnalData";

describe("diurnal aggregation", () => {
  it("builds a readable axis that includes every whisker endpoint", () => {
    const scale = diurnalYAxisScale([
      {
        bin: 0,
        minuteOfDay: 90,
        mean: 20,
        sd: 3,
        count: 4,
        periodLabel: "Before",
        eye: "OD",
      },
      {
        bin: 1,
        minuteOfDay: 270,
        mean: 30,
        sd: 4,
        count: 4,
        periodLabel: "After",
        eye: "OS",
      },
    ]);
    expect(scale).toEqual({
      domain: [15, 36],
      ticks: [15, 18, 21, 24, 27, 30, 33, 36],
    });
  });

  it("uses a stable fallback axis when no comparison points exist", () => {
    expect(diurnalYAxisScale([])).toEqual({
      domain: [10, 35],
      ticks: [10, 15, 20, 25, 30, 35],
    });
  });

  it("expands the axis to keep an enabled target visible", () => {
    const scale = diurnalYAxisScale(
      [
        {
          bin: 0,
          minuteOfDay: 90,
          mean: 20,
          sd: 1,
          count: 4,
          periodLabel: "Before",
          eye: "OD",
        },
      ],
      36,
    );
    expect(scale.domain[0]).toBeLessThan(20);
    expect(scale.domain[1]).toBeGreaterThan(36);
    expect(scale.ticks).toContain(36);
  });

  it("caps an out-of-range target before generating ticks", () => {
    const scale = diurnalYAxisScale([], 1_000_000);
    expect(scale.domain).toEqual([10, 105]);
    expect(scale.ticks).toHaveLength(20);
  });

  it("weights each session once and excludes sessions straddling a boundary", () => {
    const reading = (minute: number, iop: number): Measurement => ({
      sequence: minute + iop,
      time: Date.UTC(2026, 4, 1, 8, minute),
      eye: "OD",
      iop,
      quality: "Good",
      position: "Sitting",
    });
    const readings = [
      reading(0, 30),
      reading(1, 30),
      reading(2, 30),
      reading(3, 30),
      reading(4, 30),
      reading(5, 30),
      reading(30, 10),
    ];
    const sessions = aggregateMeasurementSessions(readings);
    expect(
      binDiurnalSessions(
        sessions,
        "OD",
        { label: "Period", start: "2026-05-01", startTime: "00:00" },
        "2026-05-01",
        "23:59",
      )[0],
    ).toMatchObject({ mean: 20, count: 2 });
    expect(
      binDiurnalSessions(
        readings,
        "OD",
        { label: "Raw", start: "2026-05-01", startTime: "00:00" },
        "2026-05-01",
        "23:59",
      )[0],
    ).toMatchObject({ mean: 190 / 7, count: 7 });

    const straddling = [
      {
        sessionId: 0,
        sessionStart: Date.UTC(2026, 4, 15, 8, 25),
        sessionEnd: Date.UTC(2026, 4, 15, 8, 34),
        time: Date.UTC(2026, 4, 15, 8, 29, 30),
        eye: "OD" as const,
        iop: 20,
        measurements: [],
      },
    ];
    expect(
      binDiurnalSessions(
        straddling,
        "OD",
        { label: "Before", start: "2026-05-01", startTime: "08:30" },
        "2026-05-15",
        "08:29",
      ),
    ).toEqual([]);
    expect(
      binDiurnalSessions(
        straddling,
        "OD",
        { label: "After", start: "2026-05-15", startTime: "08:30" },
        "2026-05-29",
        "08:29",
      ),
    ).toEqual([]);
  });

  it("uses an exact present-time boundary for open-ended comparisons", () => {
    const sessions = [
      {
        sessionId: 0,
        sessionStart: Date.UTC(2026, 4, 1, 12, 34, 1),
        sessionEnd: Date.UTC(2026, 4, 1, 12, 34, 30),
        time: Date.UTC(2026, 4, 1, 12, 34, 15),
        eye: "OD" as const,
        iop: 20,
        measurements: [],
      },
    ];
    expect(
      binDiurnalSessions(
        sessions,
        "OD",
        { label: "Current", start: "2026-05-01", startTime: "00:00" },
        "2026-05-01",
        "12:34",
        Date.UTC(2026, 4, 1, 12, 34),
      ),
    ).toEqual([]);
  });
});

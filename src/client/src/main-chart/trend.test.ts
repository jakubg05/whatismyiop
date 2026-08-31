import { describe, expect, it } from "vitest";
import { type Eye, type Measurement } from "../analysis";
import { buildTrendSeries, interpolateTrendEstimate, splitTrendSegment, trendEstimatesForDomain, type TrendEstimate } from "./trend";

const day = 86_400_000;

function reading(dayOffset: number, hour: number, eye: Eye, iop: number, position = "Sitting"): Measurement {
  return {
    sourceRow: dayOffset * 10 + hour + (eye === "OD" ? 1 : 2),
    timestampText: `2026-01-${String(dayOffset + 1).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00`,
    time: dayOffset * day + hour * 60 * 60 * 1000,
    eye,
    iop,
    quality: "Good",
    qualityRaw: "",
    comment: "",
    position,
  };
}

describe("trend estimates", () => {
  it("splits a rendered segment exactly at period boundaries", () => {
    const left: TrendEstimate = { time: 0, iop: 10, lower: 8, upper: 12, supported: true };
    const right: TrendEstimate = { time: 100, iop: 20, lower: 17, upper: 23, supported: true };
    const segments = splitTrendSegment(left, right, [20, 80]);

    expect(segments.map(([start, end]) => [start.time, end.time])).toEqual([
      [0, 20],
      [20, 80],
      [80, 100],
    ]);
    expect(segments[1][0]).toMatchObject({ iop: 12, lower: 9.8, upper: 14.2 });
    expect(segments[1][1]).toMatchObject({ iop: 18, lower: 15.2, upper: 20.8 });
  });

  it("interpolates the trend value and uncertainty bounds for tooltips", () => {
    const left: TrendEstimate = { time: 0, iop: 18, lower: 17, upper: 19, supported: true };
    const right: TrendEstimate = { time: 100, iop: 20, lower: 18, upper: 22, supported: true };

    expect(interpolateTrendEstimate([left, right], 50)).toMatchObject({
      time: 50,
      iop: 19,
      lower: 17.5,
      upper: 20.5,
    });
  });

  it("keeps bracketing estimates when zoomed inside a single sampled segment", () => {
    const estimates: TrendEstimate[] = [0, 100, 200, 300].map((time) => ({
      time,
      iop: 18,
      lower: 17,
      upper: 19,
      supported: true,
    }));

    expect(trendEstimatesForDomain(estimates, 145, 155).map((estimate) => estimate.time)).toEqual([100, 200]);
    expect(trendEstimatesForDomain(estimates, 95, 205).map((estimate) => estimate.time)).toEqual([0, 100, 200, 300]);
    expect(trendEstimatesForDomain(estimates, 400, 500)).toEqual([]);
  });

  it("requires enough values in the active measurement view", () => {
    const measurements = Array.from({ length: 7 }, (_, index) => reading(index, 12, "OD", 18));
    expect(buildTrendSeries(measurements, "sessions", "median")).toEqual([]);
    expect(buildTrendSeries(measurements, "raw", "median")).toEqual([]);
  });

  it("uses one aggregate value per session", () => {
    const measurements = Array.from({ length: 10 }, (_, index) => [
      reading(index, 12, "OD", 15 + index),
      { ...reading(index, 12, "OD", 17 + index), sourceRow: 500 + index, time: index * day + 12 * 60 * 60 * 1000 + 60_000 },
    ]).flat();
    const trend = buildTrendSeries(measurements, "sessions", "median");
    expect(trend[0].observationCount).toBe(10);
    expect(trend[0].view).toBe("sessions");
    expect(trend[0].estimates.at(-1)!.iop).toBeGreaterThan(trend[0].estimates[0].iop);
  });

  it("uses every included reading in Raw view", () => {
    const measurements = Array.from({ length: 10 }, (_, index) => [
      reading(index, 12, "OD", 15 + index),
      { ...reading(index, 12, "OD", 18 + index), sourceRow: 500 + index, time: index * day + 12 * 60 * 60 * 1000 + 60_000 },
    ]).flat();

    const rawTrend = buildTrendSeries(measurements, "raw", "median")[0];
    expect(rawTrend.observationCount).toBe(20);
    expect(rawTrend.view).toBe("raw");
  });

  it("preserves a linear series and returns finite LOWESS uncertainty estimates", () => {
    const measurements = Array.from({ length: 20 }, (_, index) => reading(index, 12, "OD", 18 + index * 0.05));
    const estimates = buildTrendSeries(measurements, "sessions", "median")[0].estimates;

    expect(estimates[0].iop).toBeCloseTo(18);
    expect(estimates.at(-1)!.iop).toBeCloseTo(18.95);
    expect(estimates.every((estimate) => Number.isFinite(estimate.lower) && Number.isFinite(estimate.upper))).toBe(true);
  });

  it("does not use measurement position in the trend", () => {
    const measurements = Array.from({ length: 20 }, (_, index) => reading(
      index,
      12,
      "OD",
      index < 10 ? 20 : 16,
      index < 10 ? "Sitting" : "Lying",
    ));
    const withoutPositions = measurements.map((measurement) => ({ ...measurement, position: "" }));

    const withPositionTrend = buildTrendSeries(measurements, "sessions", "median")[0].estimates;
    const withoutPositionTrend = buildTrendSeries(withoutPositions, "sessions", "median")[0].estimates;

    expect(withPositionTrend).toEqual(withoutPositionTrend);
  });
});

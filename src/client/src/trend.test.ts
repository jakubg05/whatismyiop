import { describe, expect, it } from "vitest";
import { type Eye, type Measurement } from "./analysis";
import { buildTrendSeries, splitTrendSegment, trendEstimatesForDomain, type TrendEstimate } from "./trend";

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

  it("requires enough independent sessions", () => {
    const trend = buildTrendSeries(Array.from({ length: 7 }, (_, index) => reading(index, 12, "OD", 18)), "median", "adjusted");
    expect(trend).toEqual([]);
  });

  it("uses one aggregate value per session", () => {
    const measurements = Array.from({ length: 10 }, (_, index) => [
      reading(index, 12, "OD", 15 + index),
      { ...reading(index, 12, "OD", 17 + index), sourceRow: 500 + index, time: index * day + 12 * 60 * 60 * 1000 + 60_000 },
    ]).flat();
    const trend = buildTrendSeries(measurements, "median", "observed");
    expect(trend[0].sessionCount).toBe(10);
    expect(trend[0].estimates.at(-1)!.iop).toBeGreaterThan(trend[0].estimates[0].iop);
  });

  it("separates a changing measurement schedule from a stable adjusted trend", () => {
    const measurements = Array.from({ length: 20 }, (_, index) => {
      const hour = index < 10 ? 8 : 20;
      const diurnalEffect = hour === 8 ? 3 : -3;
      return reading(index, hour, "OD", 18 + diurnalEffect);
    });
    const observed = buildTrendSeries(measurements, "median", "observed")[0].estimates;
    const adjusted = buildTrendSeries(measurements, "median", "adjusted")[0].estimates;
    const observedChange = observed.at(-1)!.iop - observed[0].iop;
    const adjustedChange = adjusted.at(-1)!.iop - adjusted[0].iop;
    expect(observedChange).toBeLessThan(-4);
    expect(Math.abs(adjustedChange)).toBeLessThan(Math.abs(observedChange));
  });
});

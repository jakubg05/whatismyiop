import { describe, expect, it } from "vitest";
import {
  createPlotProjection,
  lowerBoundByTime,
  positionMeasurementTooltip,
  timeIndexRange,
} from "../measurements/measurementCanvasModel";

describe("createPlotProjection", () => {
  const projection = createPlotProjection(600, 300, [100, 200], [10, 30], {
    left: 50,
    right: 20,
    top: 10,
    bottom: 40,
  });

  it("converts between plot positions and domain values", () => {
    expect(projection.xForTime(150)).toBe(315);
    expect(projection.timeForX(315)).toBe(150);
    expect(projection.yForValue(20)).toBe(135);
  });

  it("recognizes points inside the plot and clamps pointer ratios", () => {
    expect(projection.contains(50, 10)).toBe(true);
    expect(projection.contains(581, 10)).toBe(false);
    expect(projection.ratioForX(0)).toBe(0);
    expect(projection.ratioForX(600)).toBe(1);
  });
});

describe("timeIndexRange", () => {
  const points = [{ time: 10 }, { time: 20 }, { time: 20 }, { time: 30 }];

  it("finds all points in an inclusive time interval", () => {
    expect(timeIndexRange(points, 20, 20)).toEqual([1, 3]);
    expect(timeIndexRange(points, 11, 29)).toEqual([1, 3]);
    expect(lowerBoundByTime(points, 31)).toBe(4);
  });
});

describe("positionMeasurementTooltip", () => {
  it("switches sides and stays within the plot", () => {
    expect(positionMeasurementTooltip(100, 150, 600, 300)).toEqual({
      left: 124,
      top: 58,
    });
    expect(positionMeasurementTooltip(500, 150, 600, 300)).toEqual({
      left: 252,
      top: 58,
    });
  });
});

import { describe, expect, it } from "vitest";
import {
  heatmapColorPosition,
  heatmapValueAt,
  sharedHeatmapColorDomain,
} from "../chronological/heatmapInterpolation";
import type { DiurnalHeatmapData } from "./diurnalHeatmapData";

const data: DiurnalHeatmapData = {
  times: [Date.UTC(2026, 0, 1), Date.UTC(2026, 0, 2)],
  z: [
    [10, 20, null, null, null, null, null, null],
    [30, 40, null, null, null, null, null, null],
  ],
  lowSupport: Array.from({ length: 2 }, () =>
    Array.from({ length: 8 }, () => false),
  ),
};
const dates = [Date.UTC(2026, 0, 1), Date.UTC(2026, 0, 2)];

describe("heatmap interpolation", () => {
  it("interpolates smoothly across calendar time and adjacent diurnal bins", () => {
    expect(heatmapValueAt(data, dates, Date.UTC(2026, 0, 1, 12), 3)).toBe(25);
  });

  it("renormalizes around missing neighboring bins", () => {
    expect(heatmapValueAt(data, dates, Date.UTC(2026, 0, 1, 12), 6)).toBe(30);
  });
});

describe("heatmap color scale", () => {
  it("maps the selected visible domain across the full spectrum", () => {
    expect(heatmapColorPosition(10, [10, 32])).toBe(0);
    expect(heatmapColorPosition(21, [10, 32])).toBe(0.5);
    expect(heatmapColorPosition(32, [10, 32])).toBe(1);
  });

  it("clips values outside the selected visible domain", () => {
    expect(heatmapColorPosition(5, [10, 32])).toBe(0);
    expect(heatmapColorPosition(45, [10, 32])).toBe(1);
  });

  it("derives one shared color domain from every supplied heatmap", () => {
    const otherEye = {
      ...data,
      z: data.z.map((row) =>
        row.map((value) => (value === null ? null : value + 20)),
      ),
    };
    const domain = sharedHeatmapColorDomain([data, otherEye]);
    expect(domain[0]).toBeLessThan(15);
    expect(domain[1]).toBeGreaterThan(55);
  });

  it("derives the color domain from the complete heatmap history", () => {
    const fullHistory: DiurnalHeatmapData = {
      ...data,
      times: [...data.times, Date.UTC(2026, 0, 3)],
      z: [...data.z, [60, 70, null, null, null, null, null, null]],
      lowSupport: [...data.lowSupport, Array.from({ length: 8 }, () => false)],
    };
    const fullDomain = sharedHeatmapColorDomain([fullHistory]);

    expect(fullDomain[0]).toBeLessThan(15);
    expect(fullDomain[1]).toBeGreaterThan(65);
  });
});

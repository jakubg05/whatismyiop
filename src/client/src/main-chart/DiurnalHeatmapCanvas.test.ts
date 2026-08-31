import { describe, expect, it } from "vitest";
import type { DiurnalHeatmapData } from "../diurnalHeatmapData";
import { heatmapColorPosition, heatmapValueAt, sharedHeatmapColorDomain, sharedVisibleHeatmapColorDomain, visibleHeatmapColorDomain } from "./heatmapInterpolation";

const data: DiurnalHeatmapData = {
  x: ["0:00", "3:00", "6:00", "9:00", "12:00", "15:00", "18:00", "21:00"],
  y: ["2026-01-01", "2026-01-02"],
  times: [Date.UTC(2026, 0, 1), Date.UTC(2026, 0, 2)],
  z: [
    [10, 20, null, null, null, null, null, null],
    [30, 40, null, null, null, null, null, null],
  ],
  lowSupport: Array.from({ length: 2 }, () => Array.from({ length: 8 }, () => false)),
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

  it("derives a padded robust domain from the visible heatmap values", () => {
    const domain = visibleHeatmapColorDomain(data, dates, [dates[0], dates[1]]);
    expect(domain[0]).toBeLessThan(15);
    expect(domain[1]).toBeGreaterThan(35);
  });

  it("derives one shared color domain from both eyes", () => {
    const otherEye = { ...data, z: data.z.map((row) => row.map((value) => value === null ? null : value + 20)) };
    const domain = sharedVisibleHeatmapColorDomain([data, otherEye], [dates[0], dates[1]]);
    expect(domain[0]).toBeLessThan(15);
    expect(domain[1]).toBeGreaterThan(55);
  });

  it("derives the fixed color domain from the complete heatmap history", () => {
    const fullHistory: DiurnalHeatmapData = {
      ...data,
      y: [...data.y, "2026-01-03"],
      times: [...data.times, Date.UTC(2026, 0, 3)],
      z: [...data.z, [60, 70, null, null, null, null, null, null]],
      lowSupport: [...data.lowSupport, Array.from({ length: 8 }, () => false)],
    };
    const fullDomain = sharedHeatmapColorDomain([fullHistory]);
    const firstDayDomain = sharedVisibleHeatmapColorDomain([fullHistory], [dates[0], dates[0]]);

    expect(fullDomain[1]).toBeGreaterThan(firstDayDomain[1]);
  });
});

import { describe, expect, it } from "vitest";
import { chartVisibilityAlpha, dimmedTimeRanges, type ChartDimming } from "./dimming";

const rangeDimming: ChartDimming = {
  dimOutsideEmphasizedRanges: true,
  emphasizedRanges: [[10, 20], [40, 50]],
  focus: null,
};

describe("shared chart dimming", () => {
  it("keeps data inside any emphasized time range at full opacity", () => {
    expect(chartVisibilityAlpha(rangeDimming, 15, "point", null, 0.9)).toBe(0.9);
    expect(chartVisibilityAlpha(rangeDimming, 45, "point", null, 0.9)).toBe(0.9);
    expect(chartVisibilityAlpha(rangeDimming, 30, "point", null, 0.9)).toBeCloseTo(0.162);
  });

  it("gives the heatmap the complementary parts of the same time ranges", () => {
    expect(dimmedTimeRanges(rangeDimming, [0, 60])).toEqual([[0, 10], [20, 40], [50, 60]]);
  });

  it("dims the complete heatmap when focus belongs to data it cannot represent separately", () => {
    const focused = { ...rangeDimming, focus: { id: "point", sessionId: null } };
    expect(dimmedTimeRanges(focused, [0, 60])).toEqual([[0, 60]]);
  });
});

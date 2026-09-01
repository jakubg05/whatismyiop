import { describe, expect, it } from "vitest";
import {
  chartVisibilityAlpha,
  DIMMED_ALPHA_FACTOR,
  dimmedTimeRanges,
  heatmapVisibilityAlpha,
  LOW_CERTAINTY_ALPHA_FACTOR,
  type ChartDimming,
} from "../chart/dimming";

const rangeDimming: ChartDimming = {
  dimOutsideEmphasizedRanges: true,
  emphasizedRanges: [
    [10, 20],
    [40, 50],
  ],
  focus: null,
};

describe("shared chart dimming", () => {
  it("keeps data inside any emphasized time range at full opacity", () => {
    expect(chartVisibilityAlpha(rangeDimming, 15, "point", null, 0.9)).toBe(
      0.9,
    );
    expect(chartVisibilityAlpha(rangeDimming, 45, "point", null, 0.9)).toBe(
      0.9,
    );
    expect(
      chartVisibilityAlpha(rangeDimming, 30, "point", null, 0.9),
    ).toBeCloseTo(0.162);
  });

  it("gives the heatmap the complementary parts of the same time ranges", () => {
    expect(dimmedTimeRanges(rangeDimming, [0, 60])).toEqual([
      [0, 10],
      [20, 40],
      [50, 60],
    ]);
  });

  it("clips and merges overlapping emphasized ranges before finding gaps", () => {
    expect(
      dimmedTimeRanges(
        {
          ...rangeDimming,
          emphasizedRanges: [
            [0, 15],
            [14, 30],
            [45, 60],
          ],
        },
        [10, 50],
      ),
    ).toEqual([[30, 45]]);
  });

  it("dims the complete heatmap when focus belongs to data it cannot represent separately", () => {
    const focused = {
      ...rangeDimming,
      focus: { id: "point", sessionId: null },
    };
    expect(dimmedTimeRanges(focused, [0, 60])).toEqual([[0, 60]]);
  });

  it("dims low-certainty heatmap regions without stacking dimming effects", () => {
    expect(heatmapVisibilityAlpha(rangeDimming, 30, true)).toBe(
      DIMMED_ALPHA_FACTOR,
    );
    expect(heatmapVisibilityAlpha(rangeDimming, 15, true)).toBe(
      LOW_CERTAINTY_ALPHA_FACTOR,
    );
    expect(heatmapVisibilityAlpha(rangeDimming, 15, false)).toBe(1);
  });
});

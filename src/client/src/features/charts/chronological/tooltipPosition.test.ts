import { describe, expect, it } from "vitest";
import {
  positionHeatmapTooltip,
  positionHeatmapTooltipAtDataPoint,
  tetherHorizontalOverlay,
} from "./tooltipPosition";

describe("tetherHorizontalOverlay", () => {
  it("centers an overlay around an anchor away from the viewport edges", () => {
    expect(tetherHorizontalOverlay(500, 240, 1000)).toEqual({
      left: 380,
      anchorOffset: 120,
    });
  });

  it("slides the anchor within a visible overlay near an edge", () => {
    expect(tetherHorizontalOverlay(40, 240, 1000)).toEqual({
      left: 8,
      anchorOffset: 32,
    });
  });

  it("lets the overlay follow the anchor out of either side once the anchor reaches its inset", () => {
    expect(tetherHorizontalOverlay(10, 240, 1000)).toEqual({
      left: -4,
      anchorOffset: 14,
    });
    expect(tetherHorizontalOverlay(990, 240, 1000)).toEqual({
      left: 764,
      anchorOffset: 226,
    });
  });
});

describe("positionHeatmapTooltip", () => {
  it("places the tooltip beside the pointer and switches sides near the right edge", () => {
    expect(positionHeatmapTooltip(120, 160, 224, 110, 600, 300)).toMatchObject({
      left: 134,
      top: 105,
      side: "right",
      anchorOffset: 55,
    });
    expect(positionHeatmapTooltip(300, 160, 224, 110, 600, 300)).toMatchObject({
      left: 314,
      top: 105,
      side: "right",
      anchorOffset: 55,
    });
    expect(positionHeatmapTooltip(480, 160, 224, 110, 600, 300)).toMatchObject({
      left: 242,
      top: 105,
      side: "left",
      anchorOffset: 55,
    });
  });

  it("tethers the side notch while keeping the tooltip within vertical edges", () => {
    expect(positionHeatmapTooltip(300, 20, 224, 110, 600, 300)).toMatchObject({
      left: 314,
      top: 8,
      side: "right",
      anchorOffset: 14,
    });
    expect(positionHeatmapTooltip(300, 290, 224, 110, 600, 300)).toMatchObject({
      left: 314,
      top: 182,
      side: "right",
      anchorOffset: 96,
    });
  });
});

describe("positionHeatmapTooltipAtDataPoint", () => {
  const plot = { left: 50, right: 20, top: 0, bottom: 40 };

  it("repositions a selected data point when the visible domain changes", () => {
    const original = positionHeatmapTooltipAtDataPoint(
      70,
      12,
      [0, 100],
      224,
      110,
      600,
      300,
      plot,
    );
    const panned = positionHeatmapTooltipAtDataPoint(
      70,
      12,
      [25, 125],
      224,
      110,
      600,
      300,
      plot,
    );

    expect(original).toMatchObject({
      left: 133,
      top: 75,
      side: "left",
      anchorOffset: 55,
    });
    expect(panned).toMatchObject({
      left: 252.5,
      top: 75,
      side: "right",
      anchorOffset: 55,
    });
  });

  it("lets the tooltip travel beyond the plot edge with its selected data point", () => {
    expect(
      positionHeatmapTooltipAtDataPoint(
        20,
        12,
        [25, 125],
        224,
        110,
        600,
        300,
        plot,
      ),
    ).toMatchObject({ left: -12.5, side: "right" });
    expect(
      positionHeatmapTooltipAtDataPoint(
        130,
        12,
        [25, 125],
        224,
        110,
        600,
        300,
        plot,
      ),
    ).toMatchObject({ left: 318.5, side: "left" });
  });
});

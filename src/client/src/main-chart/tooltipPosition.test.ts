import { describe, expect, it } from "vitest";
import { positionHeatmapTooltip, tetherHorizontalOverlay } from "./tooltipPosition";

describe("tetherHorizontalOverlay", () => {
  it("centers an overlay around an anchor away from the viewport edges", () => {
    expect(tetherHorizontalOverlay(500, 240, 1000)).toEqual({ left: 380, anchorOffset: 120 });
  });

  it("slides the anchor within a visible overlay near an edge", () => {
    expect(tetherHorizontalOverlay(40, 240, 1000)).toEqual({ left: 8, anchorOffset: 32 });
  });

  it("lets the overlay follow the anchor out of either side once the anchor reaches its inset", () => {
    expect(tetherHorizontalOverlay(10, 240, 1000)).toEqual({ left: -4, anchorOffset: 14 });
    expect(tetherHorizontalOverlay(990, 240, 1000)).toEqual({ left: 764, anchorOffset: 226 });
  });
});

describe("positionHeatmapTooltip", () => {
  it("places the tooltip beside the pointer and switches sides near the right edge", () => {
    expect(positionHeatmapTooltip(120, 160, 224, 110, 600, 300)).toMatchObject({ left: 134, top: 105, side: "right", anchorOffset: 55 });
    expect(positionHeatmapTooltip(300, 160, 224, 110, 600, 300)).toMatchObject({ left: 314, top: 105, side: "right", anchorOffset: 55 });
    expect(positionHeatmapTooltip(480, 160, 224, 110, 600, 300)).toMatchObject({ left: 242, top: 105, side: "left", anchorOffset: 55 });
  });

  it("tethers the side notch while keeping the tooltip within vertical edges", () => {
    expect(positionHeatmapTooltip(300, 20, 224, 110, 600, 300)).toMatchObject({ left: 314, top: 8, side: "right", anchorOffset: 14 });
    expect(positionHeatmapTooltip(300, 290, 224, 110, 600, 300)).toMatchObject({ left: 314, top: 182, side: "right", anchorOffset: 96 });
  });
});

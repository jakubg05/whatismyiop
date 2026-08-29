import { describe, expect, it } from "vitest";
import { tetherHorizontalOverlay } from "./tooltipPosition";

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

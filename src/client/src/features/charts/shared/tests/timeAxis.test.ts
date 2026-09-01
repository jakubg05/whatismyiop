import { describe, expect, it } from "vitest";
import { chartTimeTicks } from "../timeAxis";

describe("chart time ticks", () => {
  it("uses the exact domain boundaries and evenly spaces shared ticks", () => {
    expect(chartTimeTicks([0, 1_000], 1_280)).toEqual([
      0, 250, 500, 750, 1_000,
    ]);
  });

  it("adapts the shared tick count to narrow plots", () => {
    expect(chartTimeTicks([100, 200], 300)).toEqual([100, 200]);
  });
});

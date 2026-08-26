import { describe, expect, it } from "vitest";
import { constrainDomain, navigateWheelDomain, panDomain, zoomDomain } from "./chartNavigation";

describe("chart navigation", () => {
  const fullDomain = [0, 1_000_000] as const;

  it("zooms around the requested point", () => {
    expect(zoomDomain(fullDomain, 0.5, 0.25, fullDomain)).toEqual([125_000, 625_000]);
  });

  it("does not pan beyond the recorded period", () => {
    expect(panDomain([200_000, 600_000], -500_000, fullDomain)).toEqual([0, 400_000]);
    expect(panDomain([200_000, 600_000], 900_000, fullDomain)).toEqual([600_000, 1_000_000]);
  });

  it("does not zoom beyond the recorded period or below one minute", () => {
    expect(zoomDomain([0, 100_000], 100, 0.5, fullDomain)).toEqual(fullDomain);
    expect(constrainDomain(400_000, 400_001, ...fullDomain)).toEqual([400_000, 460_000]);
  });

  it("turns a modified wheel gesture into horizontal panning", () => {
    expect(navigateWheelDomain([200_000, 600_000], fullDomain, "pan", 0, 100, 0.5, 1_000)).toEqual([240_000, 640_000]);
  });

  it("turns either wheel axis into cursor-anchored zooming", () => {
    const vertical = navigateWheelDomain(fullDomain, fullDomain, "zoom", 0, -100, 0.25, 1_000);
    const horizontal = navigateWheelDomain(fullDomain, fullDomain, "zoom", -100, 0, 0.25, 1_000);
    expect(horizontal).toEqual(vertical);
    expect(vertical[1] - vertical[0]).toBeLessThan(fullDomain[1] - fullDomain[0]);
    expect(vertical[0] + (vertical[1] - vertical[0]) * 0.25).toBe(250_000);
  });
});

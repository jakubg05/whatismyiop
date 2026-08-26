import { describe, expect, it } from "vitest";
import { constrainDomain, panDomain, zoomDomain } from "./chartNavigation";

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
});

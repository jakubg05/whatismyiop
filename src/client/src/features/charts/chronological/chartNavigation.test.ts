import { describe, expect, it } from "vitest";
import {
  clipDomain,
  constrainDomain,
  daylightBackground,
  intersectDomains,
  navigateWheelDomain,
  panDomain,
  zoomDomain,
} from "./chartNavigation";

describe("chart navigation", () => {
  const fullDomain = [0, 1_000_000] as const;

  it("zooms around the requested point", () => {
    expect(zoomDomain(fullDomain, 0.5, 0.25, fullDomain)).toEqual([
      125_000, 625_000,
    ]);
  });

  it("does not pan beyond the recorded period", () => {
    expect(panDomain([200_000, 600_000], -500_000, fullDomain)).toEqual([
      0, 400_000,
    ]);
    expect(panDomain([200_000, 600_000], 900_000, fullDomain)).toEqual([
      600_000, 1_000_000,
    ]);
  });

  it("pans beyond the recorded period when navigation is unbounded", () => {
    expect(panDomain([200_000, 600_000], -500_000, null)).toEqual([
      -300_000, 100_000,
    ]);
    expect(panDomain([200_000, 600_000], 900_000, null)).toEqual([
      1_100_000, 1_500_000,
    ]);
  });

  it("does not zoom beyond the recorded period or below one minute", () => {
    expect(zoomDomain([0, 100_000], 100, 0.5, fullDomain)).toEqual(fullDomain);
    expect(constrainDomain(400_000, 400_001, ...fullDomain)).toEqual([
      400_000, 460_000,
    ]);
  });

  it("turns a modified wheel gesture into horizontal panning", () => {
    expect(
      navigateWheelDomain(
        [200_000, 600_000],
        fullDomain,
        "pan",
        0,
        100,
        0.5,
        1_000,
      ),
    ).toEqual([240_000, 640_000]);
  });

  it("zooms out beyond the measurement extent when navigation is unbounded", () => {
    expect(zoomDomain([0, 1_000_000], 2, 0.5, null)).toEqual([
      -500_000, 1_500_000,
    ]);
  });

  it("turns either wheel axis into cursor-anchored zooming", () => {
    const vertical = navigateWheelDomain(
      fullDomain,
      fullDomain,
      "zoom",
      0,
      -100,
      0.25,
      1_000,
    );
    const horizontal = navigateWheelDomain(
      fullDomain,
      fullDomain,
      "zoom",
      -100,
      0,
      0.25,
      1_000,
    );
    expect(horizontal).toEqual(vertical);
    expect(vertical[1] - vertical[0]).toBeLessThan(
      fullDomain[1] - fullDomain[0],
    );
    expect(vertical[0] + (vertical[1] - vertical[0]) * 0.25).toBe(250_000);
  });

  it("clips periods to the visible chart window", () => {
    expect(clipDomain([100_000, 900_000], [300_000, 600_000])).toEqual([
      300_000, 600_000,
    ]);
    expect(clipDomain([100_000, 400_000], [300_000, 600_000])).toEqual([
      300_000, 400_000,
    ]);
    expect(clipDomain([100_000, 200_000], [300_000, 600_000])).toBeNull();
  });

  it("finds the conjunction of overlapping hovered periods", () => {
    expect(
      intersectDomains([
        [100, 500],
        [250, 700],
        [300, 450],
      ]),
    ).toEqual([300, 450]);
    expect(
      intersectDomains([
        [100, 200],
        [300, 400],
      ]),
    ).toBeNull();
    expect(intersectDomains([])).toBeNull();
  });

  it("aligns programmatic daylight bands to midnight", () => {
    const day = 86_400_000;
    const background = daylightBackground([day + day / 4, day * 3 + day / 4]);

    expect(background?.opacity).toBe(0.3);
    expect(background?.days.map(({ start }) => start)).toEqual([
      day,
      day * 2,
      day * 3,
    ]);
  });

  it("does not render the daylight background when days are no longer prominent", () => {
    const day = 86_400_000;
    expect(daylightBackground([0, day * 20])).toBeNull();
    expect(daylightBackground([0, day * 19])?.opacity).toBeCloseTo(0.3 / 17);
  });

  it("calculates longer summer days and shorter winter days", () => {
    const summer = daylightBackground([
      Date.UTC(2026, 5, 21),
      Date.UTC(2026, 5, 22),
    ]);
    const winter = daylightBackground([
      Date.UTC(2026, 11, 21),
      Date.UTC(2026, 11, 22),
    ]);
    const summerDay = summer!.days[0];
    const winterDay = winter!.days[0];

    expect(summerDay.sunrisePercent).toBeLessThan(winterDay.sunrisePercent);
    expect(summerDay.sunsetPercent).toBeGreaterThan(winterDay.sunsetPercent);
  });
});

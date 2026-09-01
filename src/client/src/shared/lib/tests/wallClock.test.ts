import { describe, expect, it } from "vitest";
import {
  formatDateInput,
  formatTimeInput,
  parseDateTimeBoundary,
  parseWallClockTimestamp,
} from "../wallClock";

describe("wall-clock dates", () => {
  it("parses a valid leap day", () => {
    expect(parseWallClockTimestamp("2024-02-29T23:59:58")).toBe(
      Date.UTC(2024, 1, 29, 23, 59, 58),
    );
  });

  it("rejects impossible calendar dates and clock values", () => {
    expect(parseWallClockTimestamp("2026-02-29T08:00:00")).toBeNull();
    expect(parseDateTimeBoundary("2026-01-01", "24:00")).toBeNull();
  });

  it("creates inclusive end boundaries", () => {
    expect(parseDateTimeBoundary("2026-01-01", "17:02", "end")).toBe(
      Date.UTC(2026, 0, 1, 17, 2, 59, 999),
    );
  });

  it("formats timestamps for date and time inputs", () => {
    const time = Date.UTC(2026, 7, 25, 8, 7);
    expect(formatDateInput(time)).toBe("2026-08-25");
    expect(formatTimeInput(time)).toBe("08:07");
  });
});

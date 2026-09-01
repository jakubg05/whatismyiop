import { describe, expect, it } from "vitest";
import type { EditablePeriod } from "../model";
import {
  movePeriodEdge,
  normalizePeriodEdges,
  periodTimeDomain,
} from "../period";

const base: EditablePeriod = {
  label: "Treatment",
  start: "2026-01-10",
  startTime: "08:00",
  end: "2026-01-20",
  endTime: "18:00",
  openEnded: false,
};

describe("period edge ordering", () => {
  it("resolves fixed and open-ended periods through the same domain helper", () => {
    const present = Date.UTC(2026, 0, 30, 12);
    expect(periodTimeDomain(base, present)).toEqual([
      Date.UTC(2026, 0, 10, 8),
      Date.UTC(2026, 0, 20, 18, 0, 59, 999),
    ]);
    expect(
      periodTimeDomain(
        { ...base, end: "", endTime: "", openEnded: true },
        present,
      ),
    ).toEqual([Date.UTC(2026, 0, 10, 8), present]);
  });

  it("keeps an edge in place while it remains on its side of the period", () => {
    const moved = movePeriodEdge(
      base,
      "start",
      Date.UTC(2026, 0, 15, 9),
      Date.UTC(2026, 0, 30),
    );
    expect(moved).toMatchObject({
      start: "2026-01-15",
      startTime: "09:00",
      end: "2026-01-20",
      endTime: "18:00",
    });
  });

  it("swaps the boundaries when the start is dragged beyond the end", () => {
    const moved = movePeriodEdge(
      base,
      "start",
      Date.UTC(2026, 0, 25, 12),
      Date.UTC(2026, 0, 30),
    );
    expect(moved).toMatchObject({
      start: "2026-01-20",
      startTime: "18:00",
      end: "2026-01-25",
      endTime: "12:00",
      openEnded: false,
    });
  });

  it("swaps the boundaries when the end is dragged before the start", () => {
    const moved = movePeriodEdge(
      base,
      "end",
      Date.UTC(2026, 0, 5, 7),
      Date.UTC(2026, 0, 30),
    );
    expect(moved).toMatchObject({
      start: "2026-01-05",
      startTime: "07:00",
      end: "2026-01-10",
      endTime: "08:00",
      openEnded: false,
    });
  });

  it("turns Present into an explicit start when an open-ended period is reversed", () => {
    const present = Date.UTC(2026, 0, 20, 10, 30);
    const reversed = normalizePeriodEdges(
      {
        ...base,
        start: "2026-01-25",
        startTime: "12:00",
        end: "",
        endTime: "",
        openEnded: true,
      },
      present,
    );
    expect(reversed).toMatchObject({
      start: "2026-01-20",
      startTime: "10:30",
      end: "2026-01-25",
      endTime: "12:00",
      openEnded: false,
    });
  });

  it("can cross back after the dragged handle changes roles", () => {
    const present = Date.UTC(2026, 0, 30);
    const crossed = movePeriodEdge(
      base,
      "start",
      Date.UTC(2026, 0, 25, 12),
      present,
    );
    const crossedBack = movePeriodEdge(
      crossed,
      "end",
      Date.UTC(2026, 0, 15, 9),
      present,
    );
    expect(crossedBack).toMatchObject({
      start: "2026-01-15",
      startTime: "09:00",
      end: "2026-01-20",
      endTime: "18:00",
      openEnded: false,
    });
  });
});

import { describe, expect, it } from "vitest";
import { coalesceMeasurementSessions, type Measurement } from "./analysis";
import { binDiurnalSessions, eventRelativePeriod, fullRelativePeriod, parseComparisonQuery, rangeRelativePeriod } from "./comparison";

describe("comparison query", () => {
  it("parses event-relative phrases with a default duration", () => {
    expect(parseComparisonQuery("before Xalatan")).toEqual({ days: 14, explicitDays: false, direction: "before", subject: "Xalatan" });
    expect(parseComparisonQuery("after Xalatan")).toEqual({ days: 14, explicitDays: false, direction: "after", subject: "Xalatan" });
  });

  it("weights each session once in a diurnal bin", () => {
    const reading = (minute: number, iop: number): Measurement => ({
      sourceRow: minute + iop,
      timestampText: "2026-05-01T08:00:00",
      time: Date.UTC(2026, 4, 1, 8, minute),
      eye: "OD",
      iop,
      quality: "Good",
      qualityRaw: "",
      comment: "",
      position: "Sitting",
    });
    const sessions = coalesceMeasurementSessions([
      reading(0, 30), reading(1, 30), reading(2, 30), reading(3, 30), reading(4, 30), reading(5, 30),
      reading(30, 10),
    ]);
    const points = binDiurnalSessions(sessions, "OD", { label: "Period", start: "2026-05-01", startTime: "00:00" }, "2026-05-01", "23:59");

    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ mean: 20, count: 2 });
  });

  it("excludes sessions that straddle a comparison boundary", () => {
    const sessions = [{
      sessionId: 0,
      sessionStart: Date.UTC(2026, 4, 15, 8, 25),
      sessionEnd: Date.UTC(2026, 4, 15, 8, 34),
      time: Date.UTC(2026, 4, 15, 8, 29, 30),
      eye: "OD" as const,
      iop: 20,
      measurements: [],
    }];
    const before = binDiurnalSessions(sessions, "OD", { label: "Before", start: "2026-05-01", startTime: "08:30" }, "2026-05-15", "08:29");
    const after = binDiurnalSessions(sessions, "OD", { label: "After", start: "2026-05-15", startTime: "08:30" }, "2026-05-29", "08:29");

    expect(before).toEqual([]);
    expect(after).toEqual([]);
  });

  it("parses compact and expanded day durations", () => {
    expect(parseComparisonQuery("7d before SLT")).toEqual({ days: 7, explicitDays: true, direction: "before", subject: "SLT" });
    expect(parseComparisonQuery("21 days after surgery")).toEqual({ days: 21, explicitDays: true, direction: "after", subject: "surgery" });
    expect(parseComparisonQuery("999999999999999999999d before surgery").days).toBe(3650);
  });

  it("parses the same colon grammar displayed by the composer", () => {
    expect(parseComparisonQuery("before:Xalatan")).toEqual({ days: 14, explicitDays: false, direction: "before", subject: "Xalatan" });
    expect(parseComparisonQuery("range:10d after:Treatment")).toEqual({ days: 10, explicitDays: true, direction: "after", subject: "Treatment" });
  });

  it("creates adjacent, non-overlapping minute-precise periods", () => {
    const event = { label: "Xalatan", time: Date.UTC(2026, 4, 15, 8, 30) };
    const before = eventRelativePeriod(event, "before", 14);
    const after = eventRelativePeriod(event, "after", 14);

    expect(before).toMatchObject({ label: "14d before Xalatan", start: "2026-05-01", startTime: "08:30", end: "2026-05-15", endTime: "08:29" });
    expect(after).toMatchObject({ label: "14d after Xalatan", start: "2026-05-15", startTime: "08:30", end: "2026-05-29", endTime: "08:29" });
  });

  it("anchors before to a period start and after to the minute following its end", () => {
    const period = { label: "Treatment", start: "2026-05-10", startTime: "08:00", end: "2026-05-20", endTime: "18:00" };

    expect(rangeRelativePeriod(period, "before", 10)).toMatchObject({
      start: "2026-04-30", startTime: "08:00", end: "2026-05-10", endTime: "07:59",
    });
    expect(rangeRelativePeriod(period, "after", 10)).toMatchObject({
      start: "2026-05-20", startTime: "18:01", end: "2026-05-30", endTime: "18:00",
    });
  });

  it("uses the full available domain when no range duration is supplied", () => {
    const domainStart = Date.UTC(2026, 3, 1, 0, 0);
    const domainEnd = Date.UTC(2026, 5, 30, 23, 59);
    const event = { label: "Xalatan", time: Date.UTC(2026, 4, 15, 8, 30) };

    expect(fullRelativePeriod(event, "before", domainStart, domainEnd)).toMatchObject({
      label: "before Xalatan", start: "2026-04-01", startTime: "00:00", end: "2026-05-15", endTime: "08:29",
    });
    expect(fullRelativePeriod(event, "after", domainStart, domainEnd)).toMatchObject({
      label: "after Xalatan", start: "2026-05-15", startTime: "08:30", end: "2026-06-30", endTime: "23:59",
    });
  });
});

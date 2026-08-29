import { describe, expect, it } from "vitest";
import { coalesceMeasurementSessions, type Measurement } from "./analysis";
import {
  MAX_COMPARISON_DAYS,
  binDiurnalSessions,
  canonicalizeComparisonExpression,
  comparisonCompletionContext,
  comparisonLabelError,
  parseComparisonExpression,
  resolveComparisonSegments,
  type ComparisonCatalog,
} from "./comparison";

const catalog: ComparisonCatalog = {
  periods: [
    { id: "baseline", label: "Baseline", start: "2026-05-01", startTime: "08:30", end: "2026-05-10", endTime: "17:00", openEnded: false },
    { id: "treatment", label: "Treatment", start: "2026-05-10", startTime: "08:00", end: "2026-05-20", endTime: "18:00", openEnded: false },
    { id: "current", label: "Current", start: "2026-05-21", startTime: "00:00", end: "", endTime: "", openEnded: true },
  ],
  events: [{ id: "xalatan", label: "Xalatan", time: Date.UTC(2026, 4, 15, 8, 30) }],
};

describe("comparison expression grammar", () => {
  it.each([
    "period:Baseline",
    "before:event:Xalatan",
    "after:event:Xalatan",
    "before:period:Treatment",
    "after:period:Treatment",
    "range:14d before:event:Xalatan",
    "range:30d after:period:Treatment",
  ])("parses %s", (expression) => {
    const parsed = parseComparisonExpression(expression, catalog);
    expect(parsed.segments).toHaveLength(1);
    expect(parsed.inactiveFrom).toBeNull();
    expect(parsed.segments[0].label).toBe(expression);
  });

  it("parses six duplicate segments and makes all later text inactive", () => {
    const expression = Array.from({ length: 7 }, () => "period:Baseline").join(" AND ");
    const parsed = parseComparisonExpression(expression, catalog);
    expect(parsed.segments).toHaveLength(6);
    expect(parsed.maximumReached).toBe(true);
    expect(expression.slice(parsed.inactiveFrom ?? expression.length)).toBe(" AND period:Baseline");
    expect(canonicalizeComparisonExpression(expression, catalog)).toBe(expression);
  });

  it("preserves ordinary suffix text verbatim after the sixth segment", () => {
    const six = Array.from({ length: 6 }, () => "period:Baseline").join(" AND ");
    const expression = `${six}       EXTRA  `;
    const parsed = parseComparisonExpression(expression, catalog);
    expect(parsed.inactiveFrom).toBe(six.length);
    expect(parsed.canonicalText).toBe(expression);
  });

  it("uses the longest valid prefix and recovers the suffix after repair", () => {
    const broken = parseComparisonExpression("period:Baseline AND range:14 before:event:Xalatan AND period:Treatment", catalog);
    expect(broken.segments.map((segment) => segment.label)).toEqual(["period:Baseline"]);
    expect(broken.expected).toBe("duration");
    expect(broken.canonicalText).toBe("period:Baseline AND range:14 before:event:Xalatan AND period:Treatment");

    const repaired = parseComparisonExpression("period:Baseline AND range:14d before:event:Xalatan AND period:Treatment", catalog);
    expect(repaired.segments.map((segment) => segment.label)).toEqual([
      "period:Baseline",
      "range:14d before:event:Xalatan",
      "period:Treatment",
    ]);
  });

  it("does not offer a destructive completion past the first invalid token", () => {
    const text = "range:014d before:event:Xalatan";
    const context = comparisonCompletionContext(text, text.length, catalog);
    expect(text.slice(context.from, context.to)).toBe("before:event:Xalatan");
    expect(context.expected).toBe("duration");
    expect(context.options).toEqual([]);
    const repair = comparisonCompletionContext(text, 10, catalog);
    expect(text.slice(repair.from, repair.to)).toBe("014d");
    expect(repair.options.map((option) => option.label)).toEqual(["7d", "14d", "30d", "90d"]);
  });

  it.each(["0d", "014d", "1.5d", "12h", `${MAX_COMPARISON_DAYS + 1}d`])("rejects invalid duration %s", (duration) => {
    const parsed = parseComparisonExpression(`range:${duration} before:event:Xalatan`, catalog);
    expect(parsed.segments).toEqual([]);
    expect(parsed.expected).toBe("duration");
    expect(parsed.canonicalPrefix).toBe("range:");
  });

  it("accepts the duration boundaries", () => {
    expect(parseComparisonExpression("range:1d before:event:Xalatan", catalog).segments).toHaveLength(1);
    expect(parseComparisonExpression(`range:${MAX_COMPARISON_DAYS}d before:event:Xalatan`, catalog).segments).toHaveLength(1);
  });

  it("only permits event: after a direction", () => {
    expect(parseComparisonExpression("event:Xalatan", catalog)).toMatchObject({ segments: [], expected: "segment-start", inactiveFrom: 0 });
    expect(parseComparisonExpression("before:event:Xalatan", catalog).segments).toHaveLength(1);
  });

  it("rejects after for an open-ended period", () => {
    const parsed = parseComparisonExpression("after:period:Current", catalog);
    expect(parsed.segments).toEqual([]);
    expect(parsed.expected).toBe("period-value");
    expect(comparisonCompletionContext("after:period:", 13, catalog).options.map((option) => option.label)).not.toContain("Current");
  });

  it("canonicalizes whitespace and case only through the recognized prefix", () => {
    expect(canonicalizeComparisonExpression("  PERIOD : baseline   and RANGE : 14d   BEFORE : EVENT : xalatan  ", catalog))
      .toBe("period:Baseline AND range:14d before:event:Xalatan");
    expect(canonicalizeComparisonExpression(" RANGE :  014d before:event:Xalatan", catalog))
      .toBe("range:014d before:event:Xalatan");
  });

  it("offers only the legal option type for every state", () => {
    expect(comparisonCompletionContext("", 0, catalog).options.map((option) => option.label)).toEqual(["period:", "range:", "before:", "after:"]);
    expect(comparisonCompletionContext("range:", 6, catalog).options.map((option) => option.label)).toEqual(["7d", "14d", "30d", "90d"]);
    expect(comparisonCompletionContext("range:14d ", 10, catalog).options.map((option) => option.label)).toEqual(["before:", "after:"]);
    expect(comparisonCompletionContext("before:", 7, catalog).options.map((option) => option.label)).toEqual(["period:", "event:"]);
    expect(comparisonCompletionContext("before:event:", 13, catalog).options.map((option) => option.label)).toEqual(["Xalatan"]);
    expect(comparisonCompletionContext("period:Baseline", 14, catalog).options.map((option) => option.type)).toEqual(["period", "period", "period"]);
    expect(comparisonCompletionContext("period:Baseline ", 16, catalog).options.map((option) => option.label)).toEqual(["AND"]);
    expect(comparisonCompletionContext("after:event:Xalatan AND period:", 31, catalog).options.map((option) => option.label)).toContain("Current");
  });
});

describe("comparison labels", () => {
  it("enforces grammar and uniqueness within type only", () => {
    expect(comparisonLabelError("With space", "period", catalog)).not.toBeNull();
    expect(comparisonLabelError("_startsWrong", "period", catalog)).not.toBeNull();
    expect(comparisonLabelError("baseline", "period", catalog)).not.toBeNull();
    expect(comparisonLabelError("Xalatan", "period", catalog)).toBeNull();
  });
});

describe("comparison segment boundaries", () => {
  const start = Date.UTC(2026, 3, 1, 0, 0);
  const end = Date.UTC(2026, 5, 30, 23, 59);
  const segment = (expression: string) => resolveComparisonSegments(parseComparisonExpression(expression, catalog).segments, catalog, start, end)[0];

  it("creates adjacent minute-precise event windows", () => {
    expect(segment("range:14d before:event:Xalatan")).toMatchObject({ start: "2026-05-01", startTime: "08:30", end: "2026-05-15", endTime: "08:29" });
    expect(segment("range:14d after:event:Xalatan")).toMatchObject({ start: "2026-05-15", startTime: "08:30", end: "2026-05-29", endTime: "08:29" });
  });

  it("anchors before to a period start and after to the minute following its end", () => {
    expect(segment("range:10d before:period:Treatment")).toMatchObject({ start: "2026-04-30", startTime: "08:00", end: "2026-05-10", endTime: "07:59" });
    expect(segment("range:10d after:period:Treatment")).toMatchObject({ start: "2026-05-20", startTime: "18:01", end: "2026-05-30", endTime: "18:00" });
  });

  it("uses the full data domain for open relative segments", () => {
    expect(segment("before:event:Xalatan")).toMatchObject({ start: "2026-04-01", startTime: "00:00", end: "2026-05-15", endTime: "08:29" });
    expect(segment("after:event:Xalatan")).toMatchObject({ start: "2026-05-15", startTime: "08:30", end: "2026-06-30", endTime: "23:59" });
  });

  it("copies direct-period boundaries without mutating the period", () => {
    expect(segment("period:Baseline")).toMatchObject({ start: "2026-05-01", startTime: "08:30", end: "2026-05-10", endTime: "17:00", label: "period:Baseline" });
  });

  it("uses the current time for a direct open-ended period without changing the measurement domain", () => {
    const present = Date.UTC(2026, 6, 1, 12, 34);
    const definition = parseComparisonExpression("period:Current", catalog).segments;
    expect(resolveComparisonSegments(definition, catalog, start, end, present)[0]).toMatchObject({ end: "", endTime: "", openEnded: true });
  });
});

describe("diurnal aggregation", () => {
  it("weights each session once and excludes sessions straddling a boundary", () => {
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
    expect(binDiurnalSessions(sessions, "OD", { label: "Period", start: "2026-05-01", startTime: "00:00" }, "2026-05-01", "23:59")[0])
      .toMatchObject({ mean: 20, count: 2 });

    const straddling = [{
      sessionId: 0,
      sessionStart: Date.UTC(2026, 4, 15, 8, 25),
      sessionEnd: Date.UTC(2026, 4, 15, 8, 34),
      time: Date.UTC(2026, 4, 15, 8, 29, 30),
      eye: "OD" as const,
      iop: 20,
      measurements: [],
    }];
    expect(binDiurnalSessions(straddling, "OD", { label: "Before", start: "2026-05-01", startTime: "08:30" }, "2026-05-15", "08:29")).toEqual([]);
    expect(binDiurnalSessions(straddling, "OD", { label: "After", start: "2026-05-15", startTime: "08:30" }, "2026-05-29", "08:29")).toEqual([]);
  });

  it("uses an exact present-time boundary for open-ended comparisons", () => {
    const sessions = [{
      sessionId: 0,
      sessionStart: Date.UTC(2026, 4, 1, 12, 34, 1),
      sessionEnd: Date.UTC(2026, 4, 1, 12, 34, 30),
      time: Date.UTC(2026, 4, 1, 12, 34, 15),
      eye: "OD" as const,
      iop: 20,
      measurements: [],
    }];
    expect(binDiurnalSessions(sessions, "OD", { label: "Current", start: "2026-05-01", startTime: "00:00" }, "2026-05-01", "12:34", Date.UTC(2026, 4, 1, 12, 34))).toEqual([]);
  });
});

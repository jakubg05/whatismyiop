import { describe, expect, it } from "vitest";
import { coalesceMeasurementSessions, type Measurement } from "./analysis";
import {
  MAX_COMPARISON_DAYS,
  NOW_COMPARISON_EVENT_ID,
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
  now: Date.UTC(2026, 5, 1, 12, 0),
};

describe("comparison expression grammar", () => {
  it.each([
    "Baseline",
    "before:Xalatan",
    "after:Xalatan",
    "before:Treatment",
    "after:Treatment",
    "before:now",
    "after:now",
    "range:14d before:Xalatan",
    "range:14d before:now",
    "range:30d after:Treatment",
  ])("parses %s", (expression) => {
    const parsed = parseComparisonExpression(expression, catalog);
    expect(parsed.segments).toHaveLength(1);
    expect(parsed.inactiveFrom).toBeNull();
    expect(parsed.segments[0].label).toBe(expression);
  });

  it("parses six duplicate segments and makes all later text inactive", () => {
    const expression = Array.from({ length: 7 }, () => "Baseline").join(" AND ");
    const parsed = parseComparisonExpression(expression, catalog);
    expect(parsed.segments).toHaveLength(6);
    expect(parsed.tokens.filter((token) => token.role === "and")).toHaveLength(5);
    expect(parsed.maximumReached).toBe(true);
    expect(expression.slice(parsed.inactiveFrom ?? expression.length)).toBe(" AND Baseline");
    expect(canonicalizeComparisonExpression(expression, catalog)).toBe(expression);
  });

  it("preserves ordinary suffix text verbatim after the sixth segment", () => {
    const six = Array.from({ length: 6 }, () => "Baseline").join(" AND ");
    const expression = `${six}       EXTRA  `;
    const parsed = parseComparisonExpression(expression, catalog);
    expect(parsed.inactiveFrom).toBe(six.length);
    expect(parsed.canonicalText).toBe(expression);
  });

  it("uses the longest valid prefix and recovers the suffix after repair", () => {
    const broken = parseComparisonExpression("Baseline AND range:14 before:Xalatan AND Treatment", catalog);
    expect(broken.segments.map((segment) => segment.label)).toEqual(["Baseline"]);
    expect(broken.expected).toBe("duration");
    expect(broken.canonicalText).toBe("Baseline AND range:14 before:Xalatan AND Treatment");

    const repaired = parseComparisonExpression("Baseline AND range:14d before:Xalatan AND Treatment", catalog);
    expect(repaired.segments.map((segment) => segment.label)).toEqual([
      "Baseline",
      "range:14d before:Xalatan",
      "Treatment",
    ]);
  });

  it("does not offer a destructive completion past the first invalid token", () => {
    const text = "range:014d before:Xalatan";
    const context = comparisonCompletionContext(text, text.length, catalog);
    expect(text.slice(context.from, context.to)).toBe("before:Xalatan");
    expect(context.expected).toBe("duration");
    expect(context.options).toEqual([]);
    const repair = comparisonCompletionContext(text, 10, catalog);
    expect(text.slice(repair.from, repair.to)).toBe("014d");
    expect(repair.options.map((option) => option.label)).toEqual(["7d", "14d", "30d", "90d"]);
  });

  it.each(["0d", "014d", "1.5d", "12h", `${MAX_COMPARISON_DAYS + 1}d`])("rejects invalid duration %s", (duration) => {
    const parsed = parseComparisonExpression(`range:${duration} before:Xalatan`, catalog);
    expect(parsed.segments).toEqual([]);
    expect(parsed.expected).toBe("duration");
    expect(parsed.canonicalPrefix).toBe("range:");
  });

  it("accepts the duration boundaries", () => {
    expect(parseComparisonExpression("range:1d before:Xalatan", catalog).segments).toHaveLength(1);
    expect(parseComparisonExpression(`range:${MAX_COMPARISON_DAYS}d before:Xalatan`, catalog).segments).toHaveLength(1);
  });

  it("only permits event values after a direction", () => {
    expect(parseComparisonExpression("Xalatan", catalog)).toMatchObject({ segments: [], expected: "segment-start", inactiveFrom: 0 });
    expect(parseComparisonExpression("before:Xalatan", catalog).segments).toHaveLength(1);
  });

  it("treats now as a built-in event target without adding it to the saved catalog", () => {
    const parsed = parseComparisonExpression("before:now", catalog);
    expect(parsed.segments).toEqual([expect.objectContaining({
      kind: "relative",
      targetType: "event",
      targetId: NOW_COMPARISON_EVENT_ID,
      label: "before:now",
    })]);
    expect(catalog.events.map((event) => event.label)).toEqual(["Xalatan"]);
  });

  it("rejects the removed period and event namespace keywords", () => {
    expect(parseComparisonExpression("period:Baseline", catalog)).toMatchObject({ segments: [], expected: "segment-start", inactiveFrom: 0 });
    expect(parseComparisonExpression("before:event:Xalatan", catalog)).toMatchObject({ segments: [], expected: "target-value" });
  });

  it("rejects after for an open-ended period", () => {
    const parsed = parseComparisonExpression("after:Current", catalog);
    expect(parsed.segments).toEqual([]);
    expect(parsed.expected).toBe("target-value");
    expect(comparisonCompletionContext("after:", 6, catalog).options.map((option) => option.label)).not.toContain("Current");
  });

  it("canonicalizes whitespace and case only through the recognized prefix", () => {
    expect(canonicalizeComparisonExpression(" baseline   and RANGE : 14d   BEFORE : xalatan  ", catalog))
      .toBe("Baseline AND range:14d before:Xalatan");
    expect(canonicalizeComparisonExpression(" RANGE :  014d before:Xalatan", catalog))
      .toBe("range:014d before:Xalatan");
  });

  it("offers only the legal option type for every state", () => {
    expect(comparisonCompletionContext("", 0, catalog).options.map((option) => option.label)).toEqual(["range:", "before:", "after:", "Baseline", "Treatment", "Current"]);
    expect(comparisonCompletionContext("range:", 6, catalog).options.map((option) => option.label)).toEqual(["7d", "14d", "30d", "90d"]);
    expect(comparisonCompletionContext("range:14d ", 10, catalog).options.map((option) => option.label)).toEqual(["before:", "after:"]);
    expect(comparisonCompletionContext("before:", 7, catalog).options.map((option) => option.label)).toEqual(["Baseline", "Treatment", "Current", "Xalatan", "now"]);
    expect(comparisonCompletionContext("after:", 6, catalog).options.map((option) => option.label)).toEqual(["Baseline", "Treatment", "Xalatan", "now"]);
    expect(comparisonCompletionContext("Baseline", 7, catalog).options.map((option) => option.type)).toEqual(["keyword", "keyword", "keyword", "period", "period", "period"]);
    expect(comparisonCompletionContext("Baseline ", 9, catalog).options.map((option) => option.label)).toEqual(["AND"]);
    expect(comparisonCompletionContext("after:Xalatan AND ", 18, catalog).options.map((option) => option.label)).toContain("Current");
  });

  it("provides descriptive metadata for every visible completion", () => {
    const contexts = [
      comparisonCompletionContext("", 0, catalog),
      comparisonCompletionContext("range:", 6, catalog),
      comparisonCompletionContext("before:", 7, catalog),
      comparisonCompletionContext("Baseline ", 9, catalog),
    ];
    for (const context of contexts) {
      expect(context.options.length).toBeGreaterThan(0);
      expect(context.options.every((option) => option.detail?.length)).toBe(true);
    }
    expect(comparisonCompletionContext("", 0, catalog).options.find((option) => option.label === "Current")?.detail)
      .toBe("2026-05-21 now");
    expect(comparisonCompletionContext("before:", 7, catalog).options.find((option) => option.label === "Xalatan")?.detail)
      .toBe("2026-05-15");
    expect(comparisonCompletionContext("before:", 7, catalog).options.find((option) => option.label === "now")?.detail)
      .toBe("2026-06-01");
  });

  it("does not parse or suggest a value that is ambiguous across catalog types", () => {
    const ambiguous: ComparisonCatalog = {
      periods: [{ ...catalog.periods[0], id: "shared-period", label: "Shared" }],
      events: [{ ...catalog.events[0], id: "shared-event", label: "Shared" }],
    };
    expect(parseComparisonExpression("Shared", ambiguous).segments).toEqual([]);
    expect(parseComparisonExpression("before:Shared", ambiguous).segments).toEqual([]);
    expect(comparisonCompletionContext("", 0, ambiguous).options.map((option) => option.label)).not.toContain("Shared");
    expect(comparisonCompletionContext("before:", 7, ambiguous).options.map((option) => option.label)).not.toContain("Shared");
  });

  it("does not resolve duplicate labels within one catalog type", () => {
    const ambiguous: ComparisonCatalog = {
      periods: [
        { ...catalog.periods[0], id: "shared-period-1", label: "Shared" },
        { ...catalog.periods[1], id: "shared-period-2", label: "Shared" },
      ],
      events: [],
    };
    expect(parseComparisonExpression("Shared", ambiguous).segments).toEqual([]);
    expect(parseComparisonExpression("before:Shared", ambiguous).segments).toEqual([]);
    expect(comparisonCompletionContext("", 0, ambiguous).options.map((option) => option.label)).not.toContain("Shared");
  });

  it("does not parse or suggest reserved labels from legacy catalog data", () => {
    const reserved: ComparisonCatalog = {
      periods: [{ ...catalog.periods[0], id: "reserved-period", label: "before" }],
      events: [{ ...catalog.events[0], id: "reserved-event", label: "now" }],
      now: catalog.now,
    };
    expect(parseComparisonExpression("before", reserved).segments).toEqual([]);
    expect(comparisonCompletionContext("", 0, reserved).options.map((option) => option.label)).not.toContain("before");
    expect(comparisonCompletionContext("before:", 7, reserved).options.filter((option) => option.label === "now")).toHaveLength(1);
  });
});

describe("comparison labels", () => {
  it("enforces grammar, reserved words, and cross-type uniqueness", () => {
    expect(comparisonLabelError("With space", "period", catalog)).toBe("Names cannot contain spaces. Use hyphens or underscores instead.");
    expect(comparisonLabelError("_startsWrong", "period", catalog)).not.toBeNull();
    expect(comparisonLabelError("baseline", "period", catalog)).not.toBeNull();
    expect(comparisonLabelError("Xalatan", "period", catalog)).not.toBeNull();
    expect(comparisonLabelError("before", "period", catalog)).not.toBeNull();
    expect(comparisonLabelError("AND", "event", catalog)).not.toBeNull();
    expect(comparisonLabelError("now", "event", catalog)).not.toBeNull();
    expect(comparisonLabelError("Baseline", "period", catalog, "baseline")).toBeNull();
  });

  it("accepts Unicode labels throughout the grammar", () => {
    const unicodeCatalog: ComparisonCatalog = {
      periods: [{ ...catalog.periods[0], id: "liecba", label: "Liečba_2" }],
      events: [{ ...catalog.events[0], id: "zmena", label: "Zmena-Å" }],
    };
    expect(comparisonLabelError("Liečba_2", "period", { periods: [], events: [] })).toBeNull();
    expect(parseComparisonExpression("Liečba_2 AND before:Zmena-Å", unicodeCatalog).segments).toHaveLength(2);
  });
});

describe("comparison segment boundaries", () => {
  const start = Date.UTC(2026, 3, 1, 0, 0);
  const end = Date.UTC(2026, 5, 30, 23, 59);
  const segment = (expression: string) => resolveComparisonSegments(parseComparisonExpression(expression, catalog).segments, catalog, start, end)[0];

  it("creates adjacent minute-precise event windows", () => {
    expect(segment("range:14d before:Xalatan")).toMatchObject({ start: "2026-05-01", startTime: "08:30", end: "2026-05-15", endTime: "08:29" });
    expect(segment("range:14d after:Xalatan")).toMatchObject({ start: "2026-05-15", startTime: "08:30", end: "2026-05-29", endTime: "08:29" });
  });

  it("anchors before to a period start and after to the minute following its end", () => {
    expect(segment("range:10d before:Treatment")).toMatchObject({ start: "2026-04-30", startTime: "08:00", end: "2026-05-10", endTime: "07:59" });
    expect(segment("range:10d after:Treatment")).toMatchObject({ start: "2026-05-20", startTime: "18:01", end: "2026-05-30", endTime: "18:00" });
  });

  it("uses the full data domain for open relative segments", () => {
    expect(segment("before:Xalatan")).toMatchObject({ start: "2026-04-01", startTime: "00:00", end: "2026-05-15", endTime: "08:29" });
    expect(segment("after:Xalatan")).toMatchObject({ start: "2026-05-15", startTime: "08:30", end: "2026-06-30", endTime: "23:59" });
  });

  it("resolves now against the supplied present time", () => {
    const present = Date.UTC(2026, 5, 1, 12, 0);
    const definitions = parseComparisonExpression("range:14d before:now", catalog).segments;
    expect(resolveComparisonSegments(definitions, catalog, start, end, present)[0]).toMatchObject({
      start: "2026-05-18",
      startTime: "12:00",
      end: "2026-06-01",
      endTime: "11:59",
      label: "range:14d before:now",
    });
  });

  it("copies direct-period boundaries without mutating the period", () => {
    expect(segment("Baseline")).toMatchObject({ start: "2026-05-01", startTime: "08:30", end: "2026-05-10", endTime: "17:00", label: "Baseline" });
  });

  it("uses the current time for a direct open-ended period without changing the measurement domain", () => {
    const present = Date.UTC(2026, 6, 1, 12, 34);
    const definition = parseComparisonExpression("Current", catalog).segments;
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

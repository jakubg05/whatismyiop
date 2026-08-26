import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatDateInput, inDateRange, parseMeasurementsCsv, summarize } from "./analysis";

const sourcePath = "C:\\Users\\X13JG\\Desktop\\measurements.csv";

describe("measurement import", () => {
  const result = parseMeasurementsCsv(readFileSync(sourcePath, "utf8"));

  it("preserves the supplied file's rows and eye observations", () => {
    expect(result.sourceRows).toBe(2190);
    expect(result.rejectedRows).toBe(0);
    expect(result.measurements).toHaveLength(2190);
    expect(result.measurements.filter((item) => item.eye === "OD")).toHaveLength(1141);
    expect(result.measurements.filter((item) => item.eye === "OS")).toHaveLength(1049);
  });

  it("preserves the exact chronological boundaries", () => {
    expect(result.measurements[0].timestampText).toBe("2023-01-18T17:02:25");
    expect(result.measurements.at(-1)?.timestampText).toBe("2026-08-25T22:28:38");
  });

  it("matches independently profiled pressure summaries", () => {
    const od = summarize(result.measurements.filter((item) => item.eye === "OD"));
    const os = summarize(result.measurements.filter((item) => item.eye === "OS"));
    expect(od.min).toBe(12);
    expect(od.max).toBe(42);
    expect(od.mean).toBeCloseTo(22.6, 1);
    expect(os.min).toBe(14);
    expect(os.max).toBe(37);
    expect(os.mean).toBeCloseTo(22.0, 1);
  });

  it("uses inclusive calendar ranges without overlap", () => {
    const periodA = result.measurements.filter((item) => inDateRange(item, "2023-01-18", "2024-12-31"));
    const periodB = result.measurements.filter((item) => inDateRange(item, "2025-01-01", "2026-08-25"));
    expect(periodA.length + periodB.length).toBe(result.measurements.length);
    expect(formatDateInput(result.measurements[0].time)).toBe("2023-01-18");
  });
});

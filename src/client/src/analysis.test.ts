import { describe, expect, it } from "vitest";
import { formatDateInput, inDateRange, parseMeasurementsCsv, summarize } from "./analysis";

const sourceCsv = `Date / Time;IOP (OD);IOP (OS);Quality OD;Quality OS;Position
2023-01-18T17:02:25;20;21;Good;Good;Sitting
2024-12-31T23:59:59;22;;Excellent;;Sitting
2025-01-01T00:00:00;;24;;Good;Supine
2026-08-25T22:28:38;30;25;Good;Excellent;Sitting`;

describe("measurement import", () => {
  const result = parseMeasurementsCsv(sourceCsv);

  it("preserves source rows and eye observations", () => {
    expect(result.sourceRows).toBe(4);
    expect(result.rejectedRows).toBe(0);
    expect(result.measurements).toHaveLength(6);
    expect(result.measurements.filter((item) => item.eye === "OD")).toHaveLength(3);
    expect(result.measurements.filter((item) => item.eye === "OS")).toHaveLength(3);
  });

  it("preserves the exact chronological boundaries", () => {
    expect(result.measurements[0].timestampText).toBe("2023-01-18T17:02:25");
    expect(result.measurements.at(-1)?.timestampText).toBe("2026-08-25T22:28:38");
  });

  it("summarizes pressure values by eye", () => {
    const od = summarize(result.measurements.filter((item) => item.eye === "OD"));
    const os = summarize(result.measurements.filter((item) => item.eye === "OS"));
    expect(od.min).toBe(20);
    expect(od.max).toBe(30);
    expect(od.mean).toBe(24);
    expect(os.min).toBe(21);
    expect(os.max).toBe(25);
    expect(os.mean).toBeCloseTo(23.3, 1);
  });

  it("uses inclusive calendar ranges without overlap", () => {
    const periodA = result.measurements.filter((item) => inDateRange(item, "2023-01-18", "2024-12-31"));
    const periodB = result.measurements.filter((item) => inDateRange(item, "2025-01-01", "2026-08-25"));
    expect(periodA.length + periodB.length).toBe(result.measurements.length);
    expect(formatDateInput(result.measurements[0].time)).toBe("2023-01-18");
  });
});

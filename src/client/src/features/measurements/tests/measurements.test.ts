import { describe, expect, it } from "vitest";
import { parseMeasurementsCsv } from "../measurements";

const sourceCsv = `Date / Time;IOP (OD);IOP (OS);Quality OD;Quality OS;Position
2023-01-18T17:02:25;20;21;Good;Good;Sitting
2024-12-31T23:59:59;22;;Excellent;;Sitting
2025-01-01T00:00:00;;24;;Good;Supine
2026-08-25T22:28:38;30;25;Good;Excellent;Sitting`;

describe("measurement import", () => {
  it("creates one measurement for each populated eye", () => {
    const measurements = parseMeasurementsCsv(sourceCsv);

    expect(measurements).toHaveLength(6);
    expect(measurements.filter((item) => item.eye === "OD")).toHaveLength(3);
    expect(measurements.filter((item) => item.eye === "OS")).toHaveLength(3);
  });

  it("accepts a header-only CSV", () => {
    expect(parseMeasurementsCsv("Date / Time;IOP (OD);IOP (OS)\n")).toEqual([]);
  });

  it("sorts measurements while retaining their source rows", () => {
    const measurements = parseMeasurementsCsv(`Date / Time;IOP (OD);IOP (OS)
2026-01-02T08:00:00;21;
2026-01-01T08:00:00;;19`);

    expect(
      measurements.map(({ sourceRow, eye, iop }) => ({ sourceRow, eye, iop })),
    ).toEqual([
      { sourceRow: 3, eye: "OS", iop: 19 },
      { sourceRow: 2, eye: "OD", iop: 21 },
    ]);
  });

  it("skips invalid timestamps and pressure values", () => {
    const measurements = parseMeasurementsCsv(`Date / Time;IOP (OD);IOP (OS)
2026-02-29T08:00:00;20;21
2026-03-01T08:00:00;invalid;22
2026-03-02T08:00:00;;`);

    expect(measurements).toHaveLength(1);
    expect(measurements[0]).toMatchObject({ sourceRow: 3, eye: "OS", iop: 22 });
  });

  it("trims BOM-prefixed headers and supplies display defaults", () => {
    const [measurement] = parseMeasurementsCsv(
      "\uFEFF Date / Time ; IOP (OD) ; IOP (OS) ; Quality OD ; Position\n2026-01-01T08:00:00;20;;; Sitting ",
    );

    expect(measurement).toMatchObject({
      quality: "Not recorded",
      position: "Sitting",
    });
  });

  it("reports all missing required columns", () => {
    expect(() =>
      parseMeasurementsCsv("Date / Time\n2026-01-01T08:00:00"),
    ).toThrow("Missing required columns: IOP (OD), IOP (OS)");
  });
});

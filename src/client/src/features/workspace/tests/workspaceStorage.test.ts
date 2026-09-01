import { describe, expect, it } from "vitest";
import {
  deserializeReport,
  deserializeWorkspace,
  REPORT_FORMAT,
  serializeReport,
  serializeWorkspace,
  type Workspace,
} from "../workspaceStorage";

const workspace: Workspace = {
  measurements: [
    {
      sequence: 0,
      time: Date.UTC(2026, 7, 30, 8, 15),
      eye: "OD",
      iop: 18,
      quality: "Good",
      position: "Sitting",
    },
  ],
  periods: [
    {
      id: "period-1",
      label: "Morning",
      start: "2026-08-01",
      startTime: "08:00",
      end: "2026-08-31",
      endTime: "09:00",
      openEnded: false,
    },
  ],
  annotations: [
    { id: "annotation-1", label: "Procedure", time: Date.UTC(2026, 7, 15, 10) },
  ],
};

describe("workspace storage", () => {
  it("round-trips only canonical workspace data", () => {
    const json = serializeWorkspace(workspace);
    expect(JSON.parse(json)).toEqual({
      version: 1,
      measurements: [
        {
          measuredAt: "2026-08-30T08:15:00",
          eye: "OD",
          iop: 18,
          quality: "Good",
          position: "Sitting",
          sequence: 0,
        },
      ],
      periods: workspace.periods,
      annotations: [
        {
          id: "annotation-1",
          label: "Procedure",
          annotatedAt: "2026-08-15T10:00:00",
        },
      ],
    });
    expect(deserializeWorkspace(json)).toEqual(workspace);
  });

  it("rejects malformed and unknown storage fields", () => {
    expect(() => deserializeWorkspace("{")).toThrow();
    const stored = JSON.parse(serializeWorkspace(workspace));
    expect(() => deserializeWorkspace(JSON.stringify({ ...stored, csvText: "private" }))).toThrow();
    expect(() => deserializeWorkspace(JSON.stringify({ ...stored, version: 2 }))).toThrow();
  });

  it("rejects duplicate measurement sequences", () => {
    const stored = JSON.parse(serializeWorkspace(workspace));
    stored.measurements.push({ ...stored.measurements[0] });
    expect(() => deserializeWorkspace(JSON.stringify(stored))).toThrow(/duplicate sequence/);
  });
});

describe("WhatIsMyIOP reports", () => {
  it("writes metadata and round-trips the shared payload", () => {
    const json = serializeReport(workspace, new Date("2026-09-01T14:20:00.000Z"));
    const report = JSON.parse(json);
    expect(report).toMatchObject({
      format: REPORT_FORMAT,
      version: 1,
      generatedAt: "2026-09-01T14:20:00.000Z",
      generator: { name: "WhatIsMyIOP", version: "0.1.0" },
    });
    expect(deserializeReport(json)).toEqual(workspace);
  });

  it("rejects unrelated, malformed, and newer reports", () => {
    expect(() => deserializeReport("{}")) .toThrow(/not a WhatIsMyIOP report/);
    const report = JSON.parse(serializeReport(workspace));
    expect(() => deserializeReport(JSON.stringify({ ...report, version: 2 }))).toThrow(/newer version/);
    expect(() => deserializeReport(JSON.stringify({ ...report, patientName: "Private" }))).toThrow(/current WhatIsMyIOP format/);
  });
});

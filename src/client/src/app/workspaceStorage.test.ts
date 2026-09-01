import { describe, expect, it } from "vitest";
import {
  deserializeWorkspace,
  serializeWorkspace,
  type Workspace,
} from "./workspaceStorage";

const CSV = "Date / Time;IOP (OD);IOP (OS)\n2026-08-30T08:15:00;18;19\n";

function storedWorkspace(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    version: 1,
    fileName: "measurements.csv",
    csvText: CSV,
    ranges: [
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
    events: [
      { id: "event-1", label: "Procedure", time: Date.UTC(2026, 7, 15, 10) },
    ],
    ...overrides,
  };
}

function deserialize(value: unknown) {
  return deserializeWorkspace(JSON.stringify(value));
}

describe("deserializeWorkspace", () => {
  it("returns parsed measurements and current domain names", () => {
    const workspace = deserialize(storedWorkspace());

    expect(workspace).toMatchObject({
      fileName: "measurements.csv",
      csvText: CSV,
      periods: [{ id: "period-1", label: "Morning" }],
      events: [{ id: "event-1", label: "Procedure" }],
    });
    expect(workspace.measurements).toEqual([
      expect.objectContaining({
        eye: "OD",
        iop: 18,
        time: Date.UTC(2026, 7, 30, 8, 15),
      }),
      expect.objectContaining({
        eye: "OS",
        iop: 19,
        time: Date.UTC(2026, 7, 30, 8, 15),
      }),
    ]);
  });

  it("accepts the current open-ended period shape", () => {
    const value = storedWorkspace({
      ranges: [
        {
          id: "period-1",
          label: "Current",
          start: "2026-08-01",
          startTime: "08:00",
          end: "",
          endTime: "",
          openEnded: true,
        },
      ],
    });

    expect(deserialize(value).periods[0]).toMatchObject({
      openEnded: true,
      end: "",
      endTime: "",
    });
  });

  it.each([
    ["non-object payload", null],
    ["wrong version", storedWorkspace({ version: 2 })],
    [
      "missing workspace field",
      (() => {
        const value = storedWorkspace();
        delete value.events;
        return value;
      })(),
    ],
    ["unknown workspace field", { ...storedWorkspace(), legacy: true }],
    ["empty file name", storedWorkspace({ fileName: "  " })],
    ["non-string CSV", storedWorkspace({ csvText: null })],
    ["non-array periods", storedWorkspace({ ranges: {} })],
    ["non-array events", storedWorkspace({ events: {} })],
  ])("rejects %s", (_case, value) => {
    expect(() => deserialize(value)).toThrow();
  });

  it("rejects malformed JSON", () => {
    expect(() => deserializeWorkspace("{")).toThrow();
  });

  it.each([
    [
      "missing start time",
      {
        id: "p",
        label: "Period",
        start: "2026-08-01",
        end: "2026-08-02",
        endTime: "09:00",
        openEnded: false,
      },
    ],
    [
      "missing end time",
      {
        id: "p",
        label: "Period",
        start: "2026-08-01",
        startTime: "08:00",
        end: "2026-08-02",
        openEnded: false,
      },
    ],
    [
      "unknown field",
      {
        id: "p",
        label: "Period",
        start: "2026-08-01",
        startTime: "08:00",
        end: "2026-08-02",
        endTime: "09:00",
        openEnded: false,
        legacy: true,
      },
    ],
    [
      "empty ID",
      {
        id: " ",
        label: "Period",
        start: "2026-08-01",
        startTime: "08:00",
        end: "2026-08-02",
        endTime: "09:00",
        openEnded: false,
      },
    ],
    [
      "empty label",
      {
        id: "p",
        label: " ",
        start: "2026-08-01",
        startTime: "08:00",
        end: "2026-08-02",
        endTime: "09:00",
        openEnded: false,
      },
    ],
    [
      "invalid start date",
      {
        id: "p",
        label: "Period",
        start: "2026-02-30",
        startTime: "08:00",
        end: "2026-08-02",
        endTime: "09:00",
        openEnded: false,
      },
    ],
    [
      "invalid start time",
      {
        id: "p",
        label: "Period",
        start: "2026-08-01",
        startTime: "25:00",
        end: "2026-08-02",
        endTime: "09:00",
        openEnded: false,
      },
    ],
    [
      "invalid end date",
      {
        id: "p",
        label: "Period",
        start: "2026-08-01",
        startTime: "08:00",
        end: "2026-02-30",
        endTime: "09:00",
        openEnded: false,
      },
    ],
    [
      "end before start",
      {
        id: "p",
        label: "Period",
        start: "2026-08-02",
        startTime: "10:00",
        end: "2026-08-02",
        endTime: "09:00",
        openEnded: false,
      },
    ],
    [
      "populated open end",
      {
        id: "p",
        label: "Period",
        start: "2026-08-01",
        startTime: "08:00",
        end: "2026-08-02",
        endTime: "09:00",
        openEnded: true,
      },
    ],
  ])("rejects a period with an %s", (_case, period) => {
    expect(() => deserialize(storedWorkspace({ ranges: [period] }))).toThrow();
  });

  it.each([
    ["unknown field", { id: "e", label: "Event", time: 1, legacy: true }],
    ["empty ID", { id: " ", label: "Event", time: 1 }],
    ["empty label", { id: "e", label: " ", time: 1 }],
    ["non-number time", { id: "e", label: "Event", time: "1" }],
  ])("rejects an event with an %s", (_case, event) => {
    expect(() => deserialize(storedWorkspace({ events: [event] }))).toThrow();
  });

  it("rejects a finite-looking JSON number that overflows to infinity", () => {
    const json = JSON.stringify(storedWorkspace()).replace(
      String(Date.UTC(2026, 7, 15, 10)),
      "1e400",
    );
    expect(() => deserializeWorkspace(json)).toThrow(/invalid time/);
  });

  it("rejects duplicate period IDs", () => {
    const period = (storedWorkspace().ranges as Record<string, unknown>[])[0];
    expect(() =>
      deserialize(storedWorkspace({ ranges: [period, { ...period }] })),
    ).toThrow(/duplicate ID/);
  });

  it("rejects duplicate event IDs", () => {
    const event = (storedWorkspace().events as Record<string, unknown>[])[0];
    expect(() =>
      deserialize(storedWorkspace({ events: [event, { ...event }] })),
    ).toThrow(/duplicate ID/);
  });

  it("rejects IDs shared by a period and event", () => {
    const event = (storedWorkspace().events as Record<string, unknown>[])[0];
    expect(() =>
      deserialize(storedWorkspace({ events: [{ ...event, id: "period-1" }] })),
    ).toThrow(/duplicate ID/);
  });

  it("rejects labels that the current annotation grammar cannot use", () => {
    const period = (storedWorkspace().ranges as Record<string, unknown>[])[0];
    expect(() =>
      deserialize(
        storedWorkspace({ ranges: [{ ...period, label: "before" }] }),
      ),
    ).toThrow(/reserved/);
  });

  it("rejects duplicate labels across periods and events", () => {
    const event = (storedWorkspace().events as Record<string, unknown>[])[0];
    expect(() =>
      deserialize(
        storedWorkspace({ events: [{ ...event, label: "morning" }] }),
      ),
    ).toThrow(/already exists/);
  });

  it("rejects CSV text that does not use the current measurement format", () => {
    expect(() =>
      deserialize(
        storedWorkspace({ csvText: "Date / Time\n2026-08-30T08:15:00\n" }),
      ),
    ).toThrow(/Missing required columns/);
  });
});

describe("serializeWorkspace", () => {
  it("writes the existing v1 storage shape without derived measurements", () => {
    const workspace = deserialize(storedWorkspace());

    expect(JSON.parse(serializeWorkspace(workspace))).toEqual(
      storedWorkspace(),
    );
  });

  it("uses periods internally and ranges in storage", () => {
    const workspace: Workspace = {
      fileName: "Treatment history",
      csvText: "Date / Time;IOP (OD);IOP (OS)\n",
      measurements: [],
      periods: [],
      events: [],
    };

    expect(JSON.parse(serializeWorkspace(workspace))).toEqual({
      version: 1,
      fileName: "Treatment history",
      csvText: workspace.csvText,
      ranges: [],
      events: [],
    });
  });
});

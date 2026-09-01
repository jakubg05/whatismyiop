import Papa from "papaparse";
import { parseWallClockTimestamp } from "../../shared/lib/wallClock";

export type Eye = "OD" | "OS";

export type Measurement = {
  sequence: number;
  time: number;
  eye: Eye;
  iop: number;
  quality: string;
  position: string;
};

const REQUIRED_COLUMNS = ["Date / Time", "IOP (OD)", "IOP (OS)"] as const;
const PRESSURE_PATTERN = /^\d+(?:\.\d+)?$/;
const EYE_COLUMNS = [
  { eye: "OD", pressure: "IOP (OD)", quality: "Quality OD" },
  { eye: "OS", pressure: "IOP (OS)", quality: "Quality OS" },
] as const;

function parsePressure(value: unknown): number | null {
  const text = String(value ?? "").trim();
  if (!PRESSURE_PATTERN.test(text)) return null;
  const pressure = Number(text);
  return Number.isFinite(pressure) ? pressure : null;
}

export function parseMeasurementsCsv(csvText: string): Measurement[] {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    delimiter: ";",
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.replace(/^\uFEFF/, "").trim(),
  });

  const fields = parsed.meta.fields ?? [];
  const missingColumns = REQUIRED_COLUMNS.filter(
    (column) => !fields.includes(column),
  );
  if (missingColumns.length > 0) {
    throw new Error(
      `Missing required column${missingColumns.length > 1 ? "s" : ""}: ${missingColumns.join(", ")}`,
    );
  }

  const measurements = parsed.data.flatMap((row, index): Measurement[] => {
    const time = parseWallClockTimestamp(String(row["Date / Time"] ?? ""));
    if (time === null) return [];

    const sequence = index;
    const position = String(row.Position ?? "").trim();
    return EYE_COLUMNS.flatMap(
      ({ eye, pressure: pressureColumn, quality: qualityColumn }) => {
        const iop = parsePressure(row[pressureColumn]);
        if (iop === null) return [];
        return [
          {
            sequence,
            time,
            eye,
            iop,
            quality: String(row[qualityColumn] ?? "").trim() || "Not recorded",
            position,
          },
        ];
      },
    );
  });

  return measurements
    .sort(
      (left, right) =>
        left.time - right.time || left.sequence - right.sequence,
    )
    .map((measurement, sequence) => ({ ...measurement, sequence }));
}

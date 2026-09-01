import type { Eye } from "../../measurements";

export const DIURNAL_BIN_COUNT = 8;
export const MINUTES_PER_BIN = 180;

export const DIURNAL_BIN_WINDOWS = Array.from(
  { length: DIURNAL_BIN_COUNT },
  (_, bin) => {
    const start = bin * 3;
    const end = (bin + 1) * 3;
    return `${start}:00–${end === 24 ? "0" : end}:00`;
  },
);

export function eyeName(eye: Eye): string {
  return eye === "OD" ? "Right" : "Left";
}

export function diurnalBinRange(bin: number): string {
  const startHour = bin * 3;
  const endHour = startHour + 2;
  return `${String(startHour).padStart(2, "0")}:00–${String(endHour).padStart(2, "0")}:59`;
}

export function diurnalHourTick(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:00`;
}

export function historyHourTick(hour: number): string {
  return `${hour === 24 ? 0 : hour}:00`;
}

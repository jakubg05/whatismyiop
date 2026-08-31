import { dateTimeBoundary, formatDateInput, formatTimeInput } from "../analysis";
import type { TimeDomain } from "./chartNavigation";

export type EditableRange = {
  label: string;
  start: string;
  startTime: string;
  end: string;
  endTime: string;
  openEnded: boolean;
};

export function rangeTimeDomain(range: EditableRange, presentTime: number): [number, number] | null {
  const start = dateTimeBoundary(range.start, range.startTime);
  const end = range.openEnded
    ? presentTime
    : dateTimeBoundary(range.end, range.endTime, true);
  return start === null || end === null ? null : [start, end];
}

export function timeIsInRanges(time: number, ranges: readonly TimeDomain[]): boolean {
  return ranges.some(([start, end]) => time >= start && time <= end);
}

export function normalizeRangeEdges(range: EditableRange, presentTime: number): EditableRange {
  const domain = rangeTimeDomain(range, presentTime);
  if (!domain || domain[0] <= domain[1]) return range;

  return {
    ...range,
    start: range.openEnded ? formatDateInput(presentTime) : range.end,
    startTime: range.openEnded ? formatTimeInput(presentTime) : range.endTime,
    end: range.start,
    endTime: range.startTime,
    openEnded: false,
  };
}

export function moveRangeEdge(
  range: EditableRange,
  edge: "start" | "end",
  time: number,
  presentTime: number,
): EditableRange {
  const moved = edge === "start"
    ? { ...range, start: formatDateInput(time), startTime: formatTimeInput(time) }
    : { ...range, end: formatDateInput(time), endTime: formatTimeInput(time), openEnded: false };
  return normalizeRangeEdges(moved, presentTime);
}

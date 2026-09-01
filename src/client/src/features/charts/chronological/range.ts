import { dateTimeBoundary, formatDateInput, formatTimeInput } from "../../measurements";
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

export function timeIsInRanges(time: number, ranges: readonly (readonly [number, number])[]): boolean {
  return ranges.some(([start, end]) => time >= start && time <= end);
}

export function unemphasizedRangesWithin(
  domain: TimeDomain,
  emphasizedRanges: readonly (readonly [number, number])[],
): TimeDomain[] {
  const emphasizedWithinDomain = emphasizedRanges
    .map(([start, end]) => [Math.max(domain[0], start), Math.min(domain[1], end)] as TimeDomain)
    .filter(([start, end]) => start <= end)
    .sort(([leftStart], [rightStart]) => leftStart - rightStart);
  const gaps: TimeDomain[] = [];
  let cursor = domain[0];

  for (const [start, end] of emphasizedWithinDomain) {
    if (start > cursor) gaps.push([cursor, start]);
    cursor = Math.max(cursor, end);
  }
  if (cursor < domain[1]) gaps.push([cursor, domain[1]]);
  return gaps;
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

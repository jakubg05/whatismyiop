import {
  formatDateInput,
  formatTimeInput,
  parseDateTimeBoundary,
} from "../../../shared/lib/wallClock";
import type { EditablePeriod } from "../../annotations";
import type { TimeDomain } from "./chartNavigation";

export function periodTimeDomain(
  period: EditablePeriod,
  presentTime: number,
): TimeDomain | null {
  const start = parseDateTimeBoundary(period.start, period.startTime);
  const end = period.openEnded
    ? presentTime
    : parseDateTimeBoundary(period.end, period.endTime, "end");
  return start === null || end === null ? null : [start, end];
}

export function normalizePeriodEdges(
  period: EditablePeriod,
  presentTime: number,
): EditablePeriod {
  const domain = periodTimeDomain(period, presentTime);
  if (!domain || domain[0] <= domain[1]) return period;

  return {
    ...period,
    start: period.openEnded ? formatDateInput(presentTime) : period.end,
    startTime: period.openEnded ? formatTimeInput(presentTime) : period.endTime,
    end: period.start,
    endTime: period.startTime,
    openEnded: false,
  };
}

export function movePeriodEdge(
  period: EditablePeriod,
  edge: "start" | "end",
  time: number,
  presentTime: number,
): EditablePeriod {
  const moved =
    edge === "start"
      ? {
          ...period,
          start: formatDateInput(time),
          startTime: formatTimeInput(time),
        }
      : {
          ...period,
          end: formatDateInput(time),
          endTime: formatTimeInput(time),
          openEnded: false,
        };
  return normalizePeriodEdges(moved, presentTime);
}

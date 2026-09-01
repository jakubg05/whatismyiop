import type { TimeDomain } from "./chartNavigation";

export const DIMMED_ALPHA_FACTOR = 0.18;
export const LOW_CERTAINTY_ALPHA_FACTOR = 0.5;

export type ChartDimmingFocus = {
  id: string;
  sessionId: number | null;
};

export type ChartDimming = {
  dimOutsideEmphasizedRanges: boolean;
  emphasizedRanges: readonly TimeDomain[];
  focus: ChartDimmingFocus | null;
};

function timeIsInRanges(time: number, ranges: readonly TimeDomain[]): boolean {
  return ranges.some(([start, end]) => time >= start && time <= end);
}

function unemphasizedRangesWithin(
  domain: TimeDomain,
  emphasizedRanges: readonly TimeDomain[],
): TimeDomain[] {
  const emphasizedWithinDomain = emphasizedRanges
    .map(
      ([start, end]) =>
        [Math.max(domain[0], start), Math.min(domain[1], end)] as TimeDomain,
    )
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

export function chartVisibilityAlpha(
  dimming: ChartDimming,
  time: number,
  id: string,
  sessionId: number | null,
  baseAlpha: number,
): number {
  if (dimming.focus) {
    return dimming.focus.id === id ||
      (dimming.focus.sessionId !== null &&
        dimming.focus.sessionId === sessionId)
      ? 1
      : baseAlpha * DIMMED_ALPHA_FACTOR;
  }
  if (
    !dimming.dimOutsideEmphasizedRanges ||
    timeIsInRanges(time, dimming.emphasizedRanges)
  ) {
    return baseAlpha;
  }
  return baseAlpha * DIMMED_ALPHA_FACTOR;
}

export function dimmedTimeRanges(
  dimming: ChartDimming,
  domain: TimeDomain,
): TimeDomain[] {
  if (dimming.focus) return [domain];
  if (!dimming.dimOutsideEmphasizedRanges) return [];
  return unemphasizedRangesWithin(domain, dimming.emphasizedRanges);
}

export function heatmapVisibilityAlpha(
  dimming: ChartDimming,
  time: number,
  lowCertainty: boolean,
): number {
  const dimmedByChart =
    dimming.focus !== null ||
    (dimming.dimOutsideEmphasizedRanges &&
      !timeIsInRanges(time, dimming.emphasizedRanges));
  if (dimmedByChart) return DIMMED_ALPHA_FACTOR;
  return lowCertainty ? LOW_CERTAINTY_ALPHA_FACTOR : 1;
}

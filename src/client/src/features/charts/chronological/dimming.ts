import type { TimeDomain } from "./chartNavigation";
import { timeIsInRanges, unemphasizedRangesWithin } from "./range";

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

export function chartVisibilityAlpha(
  dimming: ChartDimming,
  time: number,
  id: string,
  sessionId: number | null,
  baseAlpha: number,
): number {
  if (dimming.focus) {
    return dimming.focus.id === id
      || (dimming.focus.sessionId !== null && dimming.focus.sessionId === sessionId)
      ? 1
      : baseAlpha * DIMMED_ALPHA_FACTOR;
  }
  if (!dimming.dimOutsideEmphasizedRanges || timeIsInRanges(time, dimming.emphasizedRanges)) {
    return baseAlpha;
  }
  return baseAlpha * DIMMED_ALPHA_FACTOR;
}

export function dimmedTimeRanges(dimming: ChartDimming, domain: TimeDomain): TimeDomain[] {
  if (dimming.focus) return [domain];
  if (!dimming.dimOutsideEmphasizedRanges) return [];
  return unemphasizedRangesWithin(domain, dimming.emphasizedRanges);
}

export function heatmapVisibilityAlpha(
  dimming: ChartDimming,
  time: number,
  lowCertainty: boolean,
): number {
  const dimmedByChart = dimming.focus !== null
    || (dimming.dimOutsideEmphasizedRanges && !timeIsInRanges(time, dimming.emphasizedRanges));
  if (dimmedByChart) return DIMMED_ALPHA_FACTOR;
  return lowCertainty ? LOW_CERTAINTY_ALPHA_FACTOR : 1;
}

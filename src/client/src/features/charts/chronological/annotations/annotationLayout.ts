import type { TimeDomain } from "../chart/chartNavigation";

export type AnnotationKind = "period" | "annotation";
export type AnnotationKey = `${AnnotationKind}:${string}`;

export type AnnotationLabel = {
  id: string;
  focusKey?: AnnotationKey;
  kind: AnnotationKind;
  text: string;
  time: number;
  endTime?: number;
  color?: string;
  draft?: boolean;
};

export type PositionedAnnotationLabel = AnnotationLabel & {
  left: number;
  width: number;
  lane: number;
  fullWidth: boolean;
};

export const ANNOTATION_LANE_HEIGHT = 22;

const MINIMUM_LABEL_WIDTH = 72;
const MAXIMUM_LABEL_WIDTH = 300;
const APPROXIMATE_CHARACTER_WIDTH = 7;
const INTERACTIVE_LABEL_CHROME_WIDTH = 38;
const STATIC_LABEL_CHROME_WIDTH = 18;
const LABEL_GAP = 8;

export function annotationKey(kind: AnnotationKind, id: string): AnnotationKey {
  return `${kind}:${id}`;
}

export function annotationIsKind(
  key: AnnotationKey | null,
  kind: AnnotationKind,
): boolean {
  return key?.startsWith(`${kind}:`) === true;
}

export function layoutAnnotationLabels(
  labels: readonly AnnotationLabel[],
  domain: TimeDomain,
  plotWidth: number,
  focusedKey: AnnotationKey | null,
  showAllLabels: boolean,
): PositionedAnnotationLabel[] {
  const [domainStart, domainEnd] = domain;
  const domainDuration = Math.max(1, domainEnd - domainStart);
  const laneEnds: number[] = [];

  return labels
    .filter(
      (label) =>
        showAllLabels || focusedKey === null || label.focusKey === focusedKey,
    )
    .sort((left, right) => left.time - right.time)
    .map((label) => {
      const anchorLeft = Math.max(
        0,
        Math.min(
          plotWidth,
          ((label.time - domainStart) / domainDuration) * plotWidth,
        ),
      );
      const chromeWidth = label.focusKey
        ? INTERACTIVE_LABEL_CHROME_WIDTH
        : STATIC_LABEL_CHROME_WIDTH;
      const compactWidth = Math.min(
        plotWidth,
        Math.min(
          MAXIMUM_LABEL_WIDTH,
          Math.max(
            MINIMUM_LABEL_WIDTH,
            label.text.length * APPROXIMATE_CHARACTER_WIDTH + chromeWidth,
          ),
        ),
      );
      const spanWidth =
        label.endTime === undefined
          ? 0
          : ((label.endTime - label.time) / domainDuration) * plotWidth;
      const fullWidth = label.kind === "period" && spanWidth >= compactWidth;
      const left = fullWidth
        ? anchorLeft
        : Math.min(anchorLeft, Math.max(0, plotWidth - compactWidth));
      const availableWidth = Math.max(0, plotWidth - left);
      const width = Math.min(
        availableWidth,
        fullWidth ? spanWidth : compactWidth,
      );
      let lane = laneEnds.findIndex((laneEnd) => left >= laneEnd + LABEL_GAP);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = left + width;
      return { ...label, left, width, lane, fullWidth };
    });
}

export function annotationLaneCount(
  labels: readonly PositionedAnnotationLabel[],
): number {
  return Math.max(1, ...labels.map((label) => label.lane + 1));
}

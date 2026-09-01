import type { Eye, Measurement, SessionPoint } from "../../../measurements";
import type { TimeDomain } from "../chart/chartNavigation";
import type { EyeTrend } from "../trend/trend";
import { tetherHorizontalOverlay } from "./tooltipPosition";

export type CanvasMeasurementPoint =
  | {
      kind: "raw";
      id: string;
      time: number;
      eye: Eye;
      iop: number;
      measurement: Measurement;
    }
  | {
      kind: "session";
      id: string;
      time: number;
      eye: Eye;
      iop: number;
      session: SessionPoint;
    };

export type CanvasTrendPoint = {
  kind: "trend";
  id: string;
  time: number;
  eye: Eye;
  iop: number;
  trend: EyeTrend;
};

export type CanvasPoint = CanvasMeasurementPoint | CanvasTrendPoint;

export type PositionedCanvasPoint = {
  point: CanvasPoint;
  left: number;
  top: number;
  trendNotchLeft?: number;
};

export type PlotInsets = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export function createPlotProjection(
  width: number,
  height: number,
  timeDomain: TimeDomain,
  valueDomain: TimeDomain,
  insets: PlotInsets,
) {
  const plotWidth = Math.max(1, width - insets.left - insets.right);
  const plotHeight = Math.max(1, height - insets.top - insets.bottom);
  const timeSpan = Math.max(1, timeDomain[1] - timeDomain[0]);
  const valueSpan = Math.max(1, valueDomain[1] - valueDomain[0]);

  return {
    plotWidth,
    plotHeight,
    plotRight: width - insets.right,
    plotBottom: height - insets.bottom,
    contains(x: number, y: number) {
      return (
        x >= insets.left &&
        x <= width - insets.right &&
        y >= insets.top &&
        y <= height - insets.bottom
      );
    },
    xForTime(time: number) {
      return insets.left + ((time - timeDomain[0]) / timeSpan) * plotWidth;
    },
    yForValue(value: number) {
      return (
        insets.top + (1 - (value - valueDomain[0]) / valueSpan) * plotHeight
      );
    },
    timeForX(x: number) {
      return timeDomain[0] + ((x - insets.left) / plotWidth) * timeSpan;
    },
    ratioForX(x: number) {
      return Math.max(0, Math.min(1, (x - insets.left) / plotWidth));
    },
  };
}

export function lowerBoundByTime<T extends { time: number }>(
  points: readonly T[],
  time: number,
): number {
  let low = 0;
  let high = points.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (points[middle].time < time) low = middle + 1;
    else high = middle;
  }
  return low;
}

function upperBoundByTime<T extends { time: number }>(
  points: readonly T[],
  time: number,
): number {
  let low = 0;
  let high = points.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (points[middle].time <= time) low = middle + 1;
    else high = middle;
  }
  return low;
}

export function timeIndexRange<T extends { time: number }>(
  points: readonly T[],
  startTime: number,
  endTime: number,
): readonly [number, number] {
  return [
    lowerBoundByTime(points, startTime),
    upperBoundByTime(points, endTime),
  ];
}

const TOOLTIP_WIDTH = 224;
const TOOLTIP_HEIGHT = 184;
const TOOLTIP_GAP = 24;
export const TREND_TOOLTIP_WIDTH = 240;

export function positionMeasurementTooltip(
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const inset = 8;
  if (x + TOOLTIP_GAP + TOOLTIP_WIDTH <= width - inset) {
    return {
      left: x + TOOLTIP_GAP,
      top: Math.max(
        inset,
        Math.min(y - TOOLTIP_HEIGHT / 2, height - TOOLTIP_HEIGHT - inset),
      ),
    };
  }
  if (x - TOOLTIP_GAP - TOOLTIP_WIDTH >= inset) {
    return {
      left: x - TOOLTIP_GAP - TOOLTIP_WIDTH,
      top: Math.max(
        inset,
        Math.min(y - TOOLTIP_HEIGHT / 2, height - TOOLTIP_HEIGHT - inset),
      ),
    };
  }
  const left = Math.max(
    inset,
    Math.min(x - TOOLTIP_WIDTH / 2, width - TOOLTIP_WIDTH - inset),
  );
  return y + TOOLTIP_GAP + TOOLTIP_HEIGHT <= height - inset
    ? { left, top: y + TOOLTIP_GAP }
    : { left, top: Math.max(inset, y - TOOLTIP_GAP - TOOLTIP_HEIGHT) };
}

export function positionTrendTooltip(x: number, y: number, width: number) {
  const horizontal = tetherHorizontalOverlay(x, TREND_TOOLTIP_WIDTH, width);
  return {
    left: horizontal.left,
    top: y - TOOLTIP_GAP,
    trendNotchLeft: horizontal.anchorOffset,
  };
}

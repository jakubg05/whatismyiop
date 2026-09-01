export type TetheredHorizontalPosition = {
  left: number;
  anchorOffset: number;
};

export type HeatmapTooltipPosition = {
  left: number;
  top: number;
  anchorOffset: number;
  side: "left" | "right";
};

type PlotInsets = { left: number; right: number; top: number; bottom: number };

export function tetherHorizontalOverlay(
  anchorX: number,
  overlayWidth: number,
  viewportWidth: number,
  viewportInset = 8,
  anchorInset = 14,
): TetheredHorizontalPosition {
  const maximumVisibleLeft = viewportWidth - overlayWidth - viewportInset;
  let left = Math.max(
    viewportInset,
    Math.min(anchorX - overlayWidth / 2, maximumVisibleLeft),
  );
  const offset = anchorX - left;

  if (offset < anchorInset) left = anchorX - anchorInset;
  else if (offset > overlayWidth - anchorInset)
    left = anchorX - (overlayWidth - anchorInset);

  return {
    left,
    anchorOffset: Math.max(
      anchorInset,
      Math.min(overlayWidth - anchorInset, anchorX - left),
    ),
  };
}

export function positionHeatmapTooltip(
  anchorX: number,
  anchorY: number,
  overlayWidth: number,
  overlayHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  viewportInset = 8,
  anchorGap = 14,
): HeatmapTooltipPosition {
  const availableRight = viewportWidth - viewportInset - anchorX - anchorGap;
  const availableLeft = anchorX - anchorGap - viewportInset;
  const side =
    availableRight >= overlayWidth || availableRight >= availableLeft
      ? "right"
      : "left";
  const desiredLeft =
    side === "right" ? anchorX + anchorGap : anchorX - anchorGap - overlayWidth;
  const top = Math.max(
    viewportInset,
    Math.min(
      anchorY - overlayHeight / 2,
      viewportHeight - overlayHeight - viewportInset,
    ),
  );
  const anchorInset = 14;

  return {
    left: Math.max(
      viewportInset,
      Math.min(desiredLeft, viewportWidth - overlayWidth - viewportInset),
    ),
    top,
    anchorOffset: Math.max(
      anchorInset,
      Math.min(overlayHeight - anchorInset, anchorY - top),
    ),
    side,
  };
}

export function positionHeatmapTooltipAtDataPoint(
  time: number,
  hour: number,
  domain: readonly [number, number],
  overlayWidth: number,
  overlayHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  plot: PlotInsets,
): HeatmapTooltipPosition {
  const plotWidth = Math.max(1, viewportWidth - plot.left - plot.right);
  const plotHeight = Math.max(1, viewportHeight - plot.top - plot.bottom);
  const anchorX =
    ((time - domain[0]) / Math.max(1, domain[1] - domain[0])) * plotWidth;
  const anchorY = (hour / 24) * plotHeight;
  const position = positionHeatmapTooltip(
    anchorX,
    anchorY,
    overlayWidth,
    overlayHeight,
    plotWidth,
    plotHeight,
  );

  if (anchorX < 0) return { ...position, left: anchorX + 14, side: "right" };
  if (anchorX > plotWidth)
    return { ...position, left: anchorX - 14 - overlayWidth, side: "left" };
  return position;
}

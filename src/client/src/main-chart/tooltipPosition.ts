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

export function tetherHorizontalOverlay(
  anchorX: number,
  overlayWidth: number,
  viewportWidth: number,
  viewportInset = 8,
  anchorInset = 14,
): TetheredHorizontalPosition {
  const maximumVisibleLeft = viewportWidth - overlayWidth - viewportInset;
  let left = Math.max(viewportInset, Math.min(anchorX - overlayWidth / 2, maximumVisibleLeft));
  const offset = anchorX - left;

  if (offset < anchorInset) left = anchorX - anchorInset;
  else if (offset > overlayWidth - anchorInset) left = anchorX - (overlayWidth - anchorInset);

  return {
    left,
    anchorOffset: Math.max(anchorInset, Math.min(overlayWidth - anchorInset, anchorX - left)),
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
  const side = availableRight >= overlayWidth || availableRight >= availableLeft ? "right" : "left";
  const desiredLeft = side === "right"
    ? anchorX + anchorGap
    : anchorX - anchorGap - overlayWidth;
  const top = Math.max(viewportInset, Math.min(anchorY - overlayHeight / 2, viewportHeight - overlayHeight - viewportInset));
  const anchorInset = 14;

  return {
    left: Math.max(viewportInset, Math.min(desiredLeft, viewportWidth - overlayWidth - viewportInset)),
    top,
    anchorOffset: Math.max(anchorInset, Math.min(overlayHeight - anchorInset, anchorY - top)),
    side,
  };
}

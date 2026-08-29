export type TetheredHorizontalPosition = {
  left: number;
  anchorOffset: number;
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

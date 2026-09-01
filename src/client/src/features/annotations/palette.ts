const PERIOD_PALETTE = [
  { stroke: "#456b8e", fill: "#a9c2d6" },
  { stroke: "#76571e", fill: "#e5c982" },
  { stroke: "#4c7059", fill: "#b8d0bd" },
  { stroke: "#695589", fill: "#c9bddd" },
  { stroke: "#855164", fill: "#ddb8c1" },
  { stroke: "#356f70", fill: "#a9cecc" },
] as const;

const ANNOTATION_PALETTE = [
  "#8f6aa8",
  "#b56f8a",
  "#b47b5c",
  "#5d9290",
  "#7384b5",
  "#8b9253",
] as const;

export function periodPalette(index: number) {
  return PERIOD_PALETTE[index % PERIOD_PALETTE.length];
}

export function annotationPalette(index: number) {
  return ANNOTATION_PALETTE[index % ANNOTATION_PALETTE.length];
}

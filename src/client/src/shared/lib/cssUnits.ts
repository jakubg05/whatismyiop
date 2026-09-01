const FALLBACK_ROOT_FONT_SIZE = 16;

function rootFontSize(): number {
  if (typeof document === "undefined") return FALLBACK_ROOT_FONT_SIZE;
  const value = Number.parseFloat(
    window.getComputedStyle(document.documentElement).fontSize,
  );
  return Number.isFinite(value) ? value : FALLBACK_ROOT_FONT_SIZE;
}

export function cssPixelsToRem(value: number): string {
  return `${value / rootFontSize()}rem`;
}

export function remToCssPixels(value: number): number {
  return value * rootFontSize();
}

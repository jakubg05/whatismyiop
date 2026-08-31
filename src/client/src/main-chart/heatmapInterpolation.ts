import type { DiurnalHeatmapData } from "../diurnalHeatmapData";

export const DEFAULT_HEATMAP_COLOR_DOMAIN = [10, 32] as const;

export function heatmapColorPosition(value: number, domain: readonly [number, number]): number {
  return Math.max(0, Math.min(1, (value - domain[0]) / Math.max(Number.EPSILON, domain[1] - domain[0])));
}

function quantile(sorted: number[], position: number): number {
  const index = (sorted.length - 1) * position;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const ratio = index - lower;
  return sorted[lower] + (sorted[upper] - sorted[lower]) * ratio;
}

function visibleHeatmapValues(
  data: DiurnalHeatmapData,
  domain: readonly [number, number],
  dates = data.times,
): number[] {
  if (dates.length === 0) return [];
  const start = Math.max(domain[0], dates[0]);
  const end = Math.min(domain[1], dates.at(-1)!);
  if (end < start) return [];
  const values: number[] = [];
  const timeSamples = 48;
  for (let x = 0; x < timeSamples; x += 1) {
    const time = start + (end - start) * x / (timeSamples - 1);
    for (let hour = 0; hour < 24; hour += 1) {
      const value = heatmapValueAt(data, dates, time, hour + 0.5);
      if (value !== null) values.push(value);
    }
  }
  return values;
}

function heatmapColorDomainFromValues(values: number[]): readonly [number, number] {
  if (values.length === 0) return DEFAULT_HEATMAP_COLOR_DOMAIN;
  values.sort((left, right) => left - right);
  const robustMin = quantile(values, 0.05);
  const robustMax = quantile(values, 0.95);
  const spread = Math.max(2, robustMax - robustMin);
  const center = (robustMin + robustMax) / 2;
  const padding = Math.max(0.5, spread * 0.06);
  return [center - spread / 2 - padding, center + spread / 2 + padding];
}

export function visibleHeatmapColorDomain(
  data: DiurnalHeatmapData,
  dates: number[],
  domain: readonly [number, number],
): readonly [number, number] {
  return heatmapColorDomainFromValues(visibleHeatmapValues(data, domain, dates));
}

export function sharedVisibleHeatmapColorDomain(
  dataSets: readonly DiurnalHeatmapData[],
  domain: readonly [number, number],
): readonly [number, number] {
  return heatmapColorDomainFromValues(dataSets.flatMap((data) => visibleHeatmapValues(data, domain)));
}

export function sharedHeatmapColorDomain(
  dataSets: readonly DiurnalHeatmapData[],
): readonly [number, number] {
  return heatmapColorDomainFromValues(dataSets.flatMap((data) => {
    if (data.times.length === 0) return [];
    return visibleHeatmapValues(data, [data.times[0], data.times.at(-1)!]);
  }));
}

export function heatmapBracket(values: number[], target: number): readonly [number, number, number] {
  if (values.length <= 1) return [0, 0, 0];
  let low = 0;
  let high = values.length - 1;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (values[middle] <= target) low = middle;
    else high = middle;
  }
  if (target <= values[0]) return [0, 0, 0];
  if (target >= values.at(-1)!) return [high, high, 0];
  return [low, high, (target - values[low]) / Math.max(1, values[high] - values[low])];
}

export function heatmapValueFromBracket(
  data: DiurnalHeatmapData,
  left: number,
  right: number,
  timeRatio: number,
  upperBin: number,
  lowerBin: number,
  hourRatio: number,
): number | null {
  let total = 0;
  let totalWeight = 0;
  const upperLeft = data.z[left]?.[upperBin];
  const upperLeftWeight = (1 - timeRatio) * (1 - hourRatio);
  if (upperLeft !== null && upperLeft !== undefined && upperLeftWeight > 0) {
    total += upperLeft * upperLeftWeight;
    totalWeight += upperLeftWeight;
  }
  const upperRight = data.z[right]?.[upperBin];
  const upperRightWeight = timeRatio * (1 - hourRatio);
  if (upperRight !== null && upperRight !== undefined && upperRightWeight > 0) {
    total += upperRight * upperRightWeight;
    totalWeight += upperRightWeight;
  }
  const lowerLeft = data.z[left]?.[lowerBin];
  const lowerLeftWeight = (1 - timeRatio) * hourRatio;
  if (lowerLeft !== null && lowerLeft !== undefined && lowerLeftWeight > 0) {
    total += lowerLeft * lowerLeftWeight;
    totalWeight += lowerLeftWeight;
  }
  const lowerRight = data.z[right]?.[lowerBin];
  const lowerRightWeight = timeRatio * hourRatio;
  if (lowerRight !== null && lowerRight !== undefined && lowerRightWeight > 0) {
    total += lowerRight * lowerRightWeight;
    totalWeight += lowerRightWeight;
  }
  return totalWeight > 0 ? total / totalWeight : null;
}

export function heatmapValueAt(data: DiurnalHeatmapData, dates: number[], time: number, hour: number): number | null {
  if (data.z.length === 0 || dates.length === 0) return null;
  const [left, right, timeRatio] = heatmapBracket(dates, time);
  const binPosition = Math.max(0, Math.min(7, (hour - 1.5) / 3));
  const upperBin = Math.floor(binPosition);
  const lowerBin = Math.min(7, Math.ceil(binPosition));
  return heatmapValueFromBracket(data, left, right, timeRatio, upperBin, lowerBin, binPosition - upperBin);
}

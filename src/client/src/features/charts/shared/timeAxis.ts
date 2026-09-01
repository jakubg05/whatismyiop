const chartDateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  day: "2-digit",
  month: "short",
  year: "2-digit",
});

export function formatChartTime(time: number): string {
  return chartDateFormatter.format(new Date(time));
}

export function chartTimeTicks(
  domain: readonly [number, number],
  plotWidth: number,
): number[] {
  const [start, end] = domain;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
    return [start];
  const count = Math.max(
    2,
    Math.min(7, Math.floor(Math.max(1, plotWidth) / 320) + 1),
  );
  return Array.from(
    { length: count },
    (_, index) => start + ((end - start) * index) / (count - 1),
  );
}

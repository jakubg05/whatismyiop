export function formatChartTime(time: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "2-digit",
  }).format(new Date(time));
}

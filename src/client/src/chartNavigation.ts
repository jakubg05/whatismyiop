export type TimeDomain = readonly [start: number, end: number];

export type DaylightBackground = {
  opacity: number;
  days: DaylightDay[];
};

export type DaylightDay = {
  start: number;
  sunrisePercent: number;
  sunsetPercent: number;
};

const MINIMUM_WINDOW_MS = 60_000;
const OPEN_DOMAIN_LIMITS: TimeDomain = [-62_135_596_800_000, 253_402_300_799_999];
const DAY_MS = 86_400_000;
const DAYLIGHT_FADE_START_DAYS = 20;
const DAYLIGHT_FULL_STRENGTH_DAYS = 3;
const DAYLIGHT_MAX_OPACITY = 0.3;
const BRATISLAVA_LATITUDE_RADIANS = 48.1486 * Math.PI / 180;
const SUNRISE_ALTITUDE_RADIANS = -0.833 * Math.PI / 180;

function daylightHours(dayStart: number): readonly [sunrise: number, sunset: number] {
  const date = new Date(dayStart);
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  const dayOfYear = Math.floor((dayStart - yearStart) / DAY_MS) + 1;
  const daysInYear = Date.UTC(date.getUTCFullYear() + 1, 0, 1) - yearStart === 366 * DAY_MS ? 366 : 365;
  const yearAngle = 2 * Math.PI * (dayOfYear - 1) / daysInYear;
  const declination =
    0.006918
    - 0.399912 * Math.cos(yearAngle)
    + 0.070257 * Math.sin(yearAngle)
    - 0.006758 * Math.cos(2 * yearAngle)
    + 0.000907 * Math.sin(2 * yearAngle)
    - 0.002697 * Math.cos(3 * yearAngle)
    + 0.00148 * Math.sin(3 * yearAngle);
  const hourAngleCosine = (
    Math.sin(SUNRISE_ALTITUDE_RADIANS)
    - Math.sin(BRATISLAVA_LATITUDE_RADIANS) * Math.sin(declination)
  ) / (Math.cos(BRATISLAVA_LATITUDE_RADIANS) * Math.cos(declination));
  const hourAngle = Math.acos(Math.max(-1, Math.min(1, hourAngleCosine)));
  const halfDaylightHours = hourAngle * 12 / Math.PI;
  return [12 - halfDaylightHours, 12 + halfDaylightHours];
}

export function daylightBackground(domain: TimeDomain): DaylightBackground | null {
  const span = domain[1] - domain[0];
  if (span <= 0 || span >= DAYLIGHT_FADE_START_DAYS * DAY_MS) return null;

  const visibleDays = span / DAY_MS;
  const strength = Math.min(
    1,
    (DAYLIGHT_FADE_START_DAYS - visibleDays) /
      (DAYLIGHT_FADE_START_DAYS - DAYLIGHT_FULL_STRENGTH_DAYS),
  );
  const days: DaylightDay[] = [];
  const firstMidnight = Math.floor(domain[0] / DAY_MS) * DAY_MS;
  for (let start = firstMidnight; start < domain[1]; start += DAY_MS) {
    const [sunrise, sunset] = daylightHours(start);
    days.push({
      start,
      sunrisePercent: sunrise / 24 * 100,
      sunsetPercent: sunset / 24 * 100,
    });
  }

  return {
    opacity: strength * DAYLIGHT_MAX_OPACITY,
    days,
  };
}

export function constrainDomain(
  start: number,
  end: number,
  fullStart: number,
  fullEnd: number,
  minimumWindow = MINIMUM_WINDOW_MS,
): TimeDomain {
  const fullSpan = Math.max(0, fullEnd - fullStart);
  if (fullSpan === 0) return [fullStart, fullEnd];

  const span = Math.min(fullSpan, Math.max(Math.min(minimumWindow, fullSpan), end - start));
  let nextStart = start;
  let nextEnd = start + span;

  if (nextStart < fullStart) {
    nextStart = fullStart;
    nextEnd = fullStart + span;
  }
  if (nextEnd > fullEnd) {
    nextEnd = fullEnd;
    nextStart = fullEnd - span;
  }
  return [nextStart, nextEnd];
}

export function zoomDomain(
  domain: TimeDomain,
  scale: number,
  anchorRatio: number,
  fullDomain: TimeDomain | null,
): TimeDomain {
  const [start, end] = domain;
  const span = end - start;
  const ratio = Math.max(0, Math.min(1, anchorRatio));
  const nextSpan = span * Math.max(0.01, scale);
  const anchor = start + span * ratio;
  return constrainDomain(
    anchor - nextSpan * ratio,
    anchor + nextSpan * (1 - ratio),
    ...(fullDomain ?? OPEN_DOMAIN_LIMITS),
  );
}

export function panDomain(domain: TimeDomain, offset: number, fullDomain: TimeDomain | null): TimeDomain {
  return constrainDomain(
    domain[0] + offset,
    domain[1] + offset,
    ...(fullDomain ?? OPEN_DOMAIN_LIMITS),
  );
}

export function navigateWheelDomain(
  domain: TimeDomain,
  fullDomain: TimeDomain | null,
  action: "pan" | "zoom",
  deltaX: number,
  deltaY: number,
  anchorRatio: number,
  plotWidth: number,
): TimeDomain {
  const movement = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;
  if (action === "zoom") {
    const scale = Math.exp(Math.max(-4, Math.min(4, movement * 0.002)));
    return zoomDomain(domain, scale, anchorRatio, fullDomain);
  }
  return panDomain(domain, (movement / Math.max(1, plotWidth)) * (domain[1] - domain[0]), fullDomain);
}

export function clipDomain(domain: TimeDomain, viewport: TimeDomain): TimeDomain | null {
  const start = Math.max(domain[0], viewport[0]);
  const end = Math.min(domain[1], viewport[1]);
  return end > start ? [start, end] : null;
}

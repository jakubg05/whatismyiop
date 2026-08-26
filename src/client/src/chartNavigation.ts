export type TimeDomain = readonly [start: number, end: number];

const MINIMUM_WINDOW_MS = 60_000;

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
  fullDomain: TimeDomain,
): TimeDomain {
  const [start, end] = domain;
  const span = end - start;
  const ratio = Math.max(0, Math.min(1, anchorRatio));
  const nextSpan = span * Math.max(0.01, scale);
  const anchor = start + span * ratio;
  return constrainDomain(
    anchor - nextSpan * ratio,
    anchor + nextSpan * (1 - ratio),
    fullDomain[0],
    fullDomain[1],
  );
}

export function panDomain(domain: TimeDomain, offset: number, fullDomain: TimeDomain): TimeDomain {
  return constrainDomain(
    domain[0] + offset,
    domain[1] + offset,
    fullDomain[0],
    fullDomain[1],
  );
}

export function navigateWheelDomain(
  domain: TimeDomain,
  fullDomain: TimeDomain,
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

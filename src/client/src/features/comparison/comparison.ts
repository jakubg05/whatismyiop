import { dateTimeBoundary, formatDateInput, formatTimeInput, type Eye, type SessionPoint } from "../measurements";

export type ComparisonDirection = "before" | "after";
export type ComparisonTargetType = "period" | "event";

export type ComparisonPeriod = {
  id: string;
  label: string;
  start: string;
  startTime: string;
  end: string;
  endTime: string;
  openEnded: boolean;
};

export type ComparisonEvent = { id: string; label: string; time: number };
export type ComparisonCatalog = { periods: readonly ComparisonPeriod[]; events: readonly ComparisonEvent[]; now?: number };

export type ComparisonSegmentDefinition =
  | { kind: "period"; periodId: string; label: string; sourceFrom: number; sourceTo: number }
  | {
      kind: "relative";
      days: number | null;
      direction: ComparisonDirection;
      targetType: ComparisonTargetType;
      targetId: string;
      label: string;
      sourceFrom: number;
      sourceTo: number;
    };

export type ComparisonSegment = {
  id: string;
  label: string;
  start: string;
  startTime: string;
  end: string;
  endTime: string;
  openEnded: boolean;
};

export type ComparisonExpectedState =
  | "segment-start"
  | "duration"
  | "direction"
  | "target-value"
  | "and"
  | "maximum";

export type ComparisonTokenRole =
  | "segment-keyword"
  | "duration"
  | "direction"
  | "direct-period-value"
  | "period-value"
  | "event-value"
  | "and";

export type ComparisonToken = {
  from: number;
  to: number;
  canonical: string;
  style: "keyword" | "value" | "and";
  role: ComparisonTokenRole;
};

export type ComparisonParseResult = {
  text: string;
  segments: ComparisonSegmentDefinition[];
  tokens: ComparisonToken[];
  expected: ComparisonExpectedState;
  inactiveFrom: number | null;
  canonicalPrefix: string;
  canonicalText: string;
  maximumReached: boolean;
};

export type ComparisonCompletion = {
  label: string;
  detail?: string;
  type: "keyword" | "duration" | "period" | "event" | "delimiter";
};

export type ComparisonCompletionContext = {
  expected: ComparisonExpectedState;
  from: number;
  to: number;
  options: ComparisonCompletion[];
  message: string;
};

export type DiurnalPoint = {
  bin: number;
  minuteOfDay: number;
  mean: number;
  sd: number;
  count: number;
  periodLabel: string;
  eye: Eye;
};

const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_COMPARISON_DAYS = 36_500;
export const MAX_COMPARISON_SEGMENTS = 6;
export const NOW_COMPARISON_EVENT_ID = "comparison-now";
export const RECOMMENDED_DURATIONS = ["7d", "14d", "30d", "90d"] as const;
const LABEL_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}_-]*$/u;
const RESERVED_LABELS = new Set(["and", "range", "before", "after", "now"]);

export function isValidComparisonLabel(label: string): boolean {
  return LABEL_PATTERN.test(label);
}

export function comparisonLabelError(
  label: string,
  type: ComparisonTargetType,
  catalog: ComparisonCatalog,
  excludingId?: string,
): string | null {
  if (/\s/u.test(label)) return "Names cannot contain spaces. Use hyphens or underscores instead.";
  if (!isValidComparisonLabel(label)) return "Labels may contain letters, numbers, hyphens, and underscores, and must begin with a letter or number.";
  const normalized = label.toLocaleLowerCase();
  if (RESERVED_LABELS.has(normalized)) return "Labels cannot use the reserved comparison words AND, range, before, after, or now.";
  const duplicate = [
    ...catalog.periods.map((value) => ({ ...value, type: "period" as const })),
    ...catalog.events.map((value) => ({ ...value, type: "event" as const })),
  ].find((value) => !(value.type === type && value.id === excludingId) && value.label.toLocaleLowerCase() === normalized);
  if (duplicate) {
    return `A period or event named ${label} already exists.`;
  }
  return null;
}

function durationValue(text: string): number | null {
  if (!/^[1-9][0-9]*d$/.test(text)) return null;
  const days = Number(text.slice(0, -1));
  return Number.isSafeInteger(days) && days <= MAX_COMPARISON_DAYS ? days : null;
}

function firstNonWhitespace(text: string, from: number): number | null {
  for (let index = from; index < text.length; index += 1) if (!/\s/.test(text[index])) return index;
  return null;
}

function skipWhitespace(text: string, from: number): number {
  let position = from;
  while (position < text.length && /\s/.test(text[position])) position += 1;
  return position;
}

function readColonKeyword(text: string, from: number): { word: string; from: number; to: number } | null {
  const start = skipWhitespace(text, from);
  const match = /^([\p{L}]+)\s*:/u.exec(text.slice(start));
  return match ? { word: match[1].toLocaleLowerCase(), from: start, to: start + match[0].length } : null;
}

function readWord(text: string, from: number): { word: string; from: number; to: number } | null {
  const start = skipWhitespace(text, from);
  const match = /^[^\s:]+/.exec(text.slice(start));
  return match ? { word: match[0], from: start, to: start + match[0].length } : null;
}

function isMatchingTargetLabel(candidate: string, label: string): boolean {
  const normalized = label.toLocaleLowerCase();
  if (RESERVED_LABELS.has(normalized)) return false;
  return isValidComparisonLabel(candidate)
    && !RESERVED_LABELS.has(candidate.toLocaleLowerCase())
    && candidate.toLocaleLowerCase() === normalized;
}

function targetValueByLabel(catalog: ComparisonCatalog, label: string): { type: ComparisonTargetType; value: ComparisonPeriod | ComparisonEvent } | null {
  if (label.toLocaleLowerCase() === "now") {
    return { type: "event", value: { id: NOW_COMPARISON_EVENT_ID, label: "now", time: catalog.now ?? Date.now() } };
  }
  const matches = [
    ...catalog.periods
      .filter((value) => isMatchingTargetLabel(value.label, label))
      .map((value) => ({ type: "period" as const, value })),
    ...catalog.events
      .filter((value) => isMatchingTargetLabel(value.label, label))
      .map((value) => ({ type: "event" as const, value })),
  ];
  return matches.length === 1 ? matches[0] : null;
}

export function parseComparisonExpression(text: string, catalog: ComparisonCatalog): ComparisonParseResult {
  let position = 0;
  let canonicalPrefix = "";
  let expected: ComparisonExpectedState = "segment-start";
  let inactiveFrom: number | null = null;
  let maximumReached = false;
  const tokens: ComparisonToken[] = [];
  const segments: ComparisonSegmentDefinition[] = [];

  const append = (token: ComparisonToken, prefix = "") => {
    tokens.push(token);
    canonicalPrefix += prefix + token.canonical;
    position = token.to;
  };
  const fail = (state: ComparisonExpectedState, from: number) => {
    expected = state;
    inactiveFrom = firstNonWhitespace(text, from);
  };

  while (segments.length < MAX_COMPARISON_SEGMENTS) {
    expected = "segment-start";
    const segmentFrom = skipWhitespace(text, position);
    if (segmentFrom >= text.length) break;
    const startKeyword = readColonKeyword(text, position);
    let days: number | null = null;
    let direction: ComparisonDirection | null = null;
    let targetType: ComparisonTargetType | null = null;
    let targetId = "";
    let targetLabel = "";

    if (!startKeyword || !["range", "before", "after"].includes(startKeyword.word)) {
      const value = readWord(text, position);
      if (!value) break;
      const target = targetValueByLabel(catalog, value.word);
      if (target?.type !== "period") {
        fail("segment-start", value.from);
        break;
      }
      const period = target.value as ComparisonPeriod;
      append({ from: value.from, to: value.to, canonical: period.label, style: "value", role: "direct-period-value" });
      segments.push({ kind: "period", periodId: period.id, label: period.label, sourceFrom: segmentFrom, sourceTo: position });
    } else {
      append({ from: startKeyword.from, to: startKeyword.to, canonical: `${startKeyword.word}:`, style: "keyword", role: "segment-keyword" });
      if (startKeyword.word === "range") {
        expected = "duration";
        const value = readWord(text, position);
        if (!value) break;
        days = durationValue(value.word);
        if (days === null) {
          fail("duration", value.from);
          break;
        }
        append({ from: value.from, to: value.to, canonical: value.word, style: "value", role: "duration" });

        expected = "direction";
        const directionKeyword = readColonKeyword(text, position);
        const directionStart = skipWhitespace(text, position);
        if (!directionKeyword || (directionKeyword.word !== "before" && directionKeyword.word !== "after")) {
          if (directionStart < text.length) fail("direction", directionStart);
          break;
        }
        direction = directionKeyword.word;
        append({ from: directionKeyword.from, to: directionKeyword.to, canonical: `${direction}:`, style: "keyword", role: "direction" }, " ");
      } else {
        direction = startKeyword.word as ComparisonDirection;
        tokens[tokens.length - 1].role = "direction";
      }

      expected = "target-value";
      const value = readWord(text, position);
      if (!value) break;
      const target = targetValueByLabel(catalog, value.word);
      if (!target || (target.type === "period" && direction === "after" && (target.value as ComparisonPeriod).openEnded)) {
        fail("target-value", value.from);
        break;
      }
      targetType = target.type;
      targetId = target.value.id;
      targetLabel = target.value.label;
      if (targetType === "period") {
        append({ from: value.from, to: value.to, canonical: targetLabel, style: "value", role: "period-value" });
      } else {
        append({ from: value.from, to: value.to, canonical: targetLabel, style: "value", role: "event-value" });
      }
      const label = `${days === null ? "" : `range:${days}d `}${direction}:${targetLabel}`;
      segments.push({ kind: "relative", days, direction, targetType, targetId, label, sourceFrom: segmentFrom, sourceTo: position });
    }

    if (segments.length === MAX_COMPARISON_SEGMENTS) {
      expected = "maximum";
      maximumReached = true;
      inactiveFrom = position < text.length ? position : null;
      break;
    }

    expected = "and";
    const delimiterStart = skipWhitespace(text, position);
    if (delimiterStart >= text.length) break;
    const delimiter = readWord(text, position);
    if (!delimiter || delimiter.word.toLocaleLowerCase() !== "and") {
      fail("and", delimiterStart);
      break;
    }
    append({ from: delimiter.from, to: delimiter.to, canonical: "AND", style: "and", role: "and" }, " ");
    canonicalPrefix += " ";
  }

  const suffixFrom = inactiveFrom ?? text.length;
  let canonicalText = canonicalPrefix;
  if (inactiveFrom !== null) {
    const separator = expected === "direction" || expected === "and" ? " " : "";
    canonicalText += separator + text.slice(suffixFrom).replace(/\r\n|[\r\n]/g, " ");
  }
  return {
    text,
    segments,
    tokens,
    expected,
    inactiveFrom,
    canonicalPrefix,
    canonicalText: maximumReached && inactiveFrom !== null ? canonicalText.trimStart() : canonicalText.trim(),
    maximumReached,
  };
}

function optionMessage(expected: ComparisonExpectedState, count: number): string {
  if (expected === "maximum") return "Six comparison segments are already shown";
  if (expected === "duration") return count ? `${count} suggested durations` : "Expected a whole-day duration such as 14d";
  if (expected === "target-value") return count ? `${count} matching periods and events` : "No matching period or event";
  if (expected === "and") return count ? "Add another comparison segment" : "Expected AND";
  return count ? `${count} suggestions` : `Expected ${expected === "direction" ? "before: or after:" : "a comparison keyword or saved period"}`;
}

function completionsForState(expected: ComparisonExpectedState, catalog: ComparisonCatalog, direction: ComparisonDirection | null): ComparisonCompletion[] {
  const periodOptions = catalog.periods
    .filter((period) => targetValueByLabel(catalog, period.label)?.value.id === period.id && !(direction === "after" && period.openEnded))
    .map((period) => ({ label: period.label, detail: `${period.start} ${period.openEnded ? "now" : period.end}`, type: "period" as const }));
  const eventOptions = catalog.events
    .filter((event) => targetValueByLabel(catalog, event.label)?.value.id === event.id)
    .map((event) => ({ label: event.label, detail: formatDateInput(event.time), type: "event" as const }));
  eventOptions.push({ label: "now", detail: formatDateInput(catalog.now ?? Date.now()), type: "event" });
  if (expected === "segment-start") return [
    { label: "range:", detail: "Window around a target", type: "keyword" },
    { label: "before:", detail: "Time before a target", type: "keyword" },
    { label: "after:", detail: "Time after a target", type: "keyword" },
    ...periodOptions,
  ];
  if (expected === "duration") return RECOMMENDED_DURATIONS.map((label) => ({
    label,
    detail: `${Number.parseInt(label, 10)} day window`,
    type: "duration" as const,
  }));
  if (expected === "direction") return [
    { label: "before:", detail: "Use time before the target", type: "keyword" },
    { label: "after:", detail: "Use time after the target", type: "keyword" },
  ];
  if (expected === "target-value") return [...periodOptions, ...eventOptions];
  if (expected === "and") return [{ label: "AND", detail: "Add another comparison segment", type: "delimiter" }];
  return [];
}

function tokenExpected(token: ComparisonToken): ComparisonExpectedState {
  if (token.role === "duration") return "duration";
  if (token.role === "direction") return "direction";
  if (token.role === "period-value" || token.role === "event-value") return "target-value";
  if (token.role === "and") return "and";
  return "segment-start";
}

function directionBefore(text: string, position: number, catalog: ComparisonCatalog): ComparisonDirection | null {
  const prefix = parseComparisonExpression(text.slice(0, position), catalog);
  for (let index = prefix.tokens.length - 1; index >= 0; index -= 1) {
    const token = prefix.tokens[index];
    if (token.role === "and") return null;
    if (token.role === "direct-period-value") return null;
    if (token.role === "direction") return token.canonical.startsWith("after") ? "after" : "before";
  }
  return null;
}

export function comparisonCompletionContext(text: string, position: number, catalog: ComparisonCatalog): ComparisonCompletionContext {
  const parsed = parseComparisonExpression(text, catalog);
  const semantic = parsed.tokens.find((token) => position >= token.from && position < token.to);
  const prefix = parseComparisonExpression(text.slice(0, position), catalog);
  let expected = semantic ? tokenExpected(semantic) : prefix.expected;
  let from = semantic?.from ?? position;
  let to = semantic?.to ?? position;
  let firstInvalidTo: number | null = null;
  if (!semantic) {
    if (prefix.inactiveFrom !== null) {
      while (from > 0 && !/\s/.test(text[from - 1])) from -= 1;
      while (to < text.length && !/\s/.test(text[to])) to += 1;
    }
    if (parsed.inactiveFrom !== null) {
      firstInvalidTo = parsed.inactiveFrom;
      while (firstInvalidTo < text.length && !/\s/.test(text[firstInvalidTo])) firstInvalidTo += 1;
      if (position >= parsed.inactiveFrom && position <= firstInvalidTo) {
        from = parsed.inactiveFrom;
        to = firstInvalidTo;
        expected = parsed.expected;
      }
    }
    if (parsed.maximumReached && position >= (parsed.inactiveFrom ?? text.length)) expected = "maximum";
  }
  const direction = directionBefore(text, from, catalog);
  let options = completionsForState(expected, catalog, direction);
  if (!semantic && parsed.inactiveFrom !== null && expected !== "maximum") {
    if (position > (firstInvalidTo ?? parsed.inactiveFrom)) options = [];
  }
  return { expected, from, to, options, message: optionMessage(expected, options.length) };
}

export function canonicalizeComparisonExpression(text: string, catalog: ComparisonCatalog): string {
  return parseComparisonExpression(text.replace(/[\r\n]+/g, " "), catalog).canonicalText;
}

export function resolveComparisonSegments(
  definitions: readonly ComparisonSegmentDefinition[],
  catalog: ComparisonCatalog,
  domainStart: number,
  domainEnd: number,
  presentTime = domainEnd,
): ComparisonSegment[] {
  return definitions.flatMap((definition, index) => {
    let start: number | null = null;
    let end: number | null = null;
    let openEnded = false;
    if (definition.kind === "period") {
      const period = catalog.periods.find((item) => item.id === definition.periodId);
      if (!period) return [];
      start = dateTimeBoundary(period.start, period.startTime);
      openEnded = period.openEnded;
      end = openEnded ? presentTime : dateTimeBoundary(period.end, period.endTime, true);
    } else if (definition.targetType === "event") {
      const event = definition.targetId === NOW_COMPARISON_EVENT_ID
        ? { id: NOW_COMPARISON_EVENT_ID, label: "now", time: presentTime }
        : catalog.events.find((item) => item.id === definition.targetId);
      if (!event) return [];
      if (definition.days === null) {
        start = definition.direction === "before" ? domainStart : event.time;
        end = definition.direction === "before" ? event.time - 60_000 : domainEnd;
      } else {
        const duration = definition.days * DAY_MS;
        start = definition.direction === "before" ? event.time - duration : event.time;
        end = definition.direction === "before" ? event.time - 60_000 : event.time + duration - 60_000;
      }
    } else {
      const period = catalog.periods.find((item) => item.id === definition.targetId);
      if (!period || (definition.direction === "after" && period.openEnded)) return [];
      const boundary = definition.direction === "before"
        ? dateTimeBoundary(period.start, period.startTime)
        : dateTimeBoundary(period.end, period.endTime, true);
      if (boundary === null) return [];
      if (definition.days === null) {
        start = definition.direction === "before" ? domainStart : boundary + 60_000;
        end = definition.direction === "before" ? boundary - 60_000 : domainEnd;
      } else {
        const duration = definition.days * DAY_MS;
        start = definition.direction === "before" ? boundary - duration : boundary + 60_000;
        end = definition.direction === "before" ? boundary - 60_000 : boundary + duration;
      }
    }
    if (start === null || end === null) return [];
    return [{
      id: `comparison-${index}`,
      label: definition.label,
      start: formatDateInput(start),
      startTime: formatTimeInput(start),
      end: openEnded ? "" : formatDateInput(end),
      endTime: openEnded ? "" : formatTimeInput(end),
      openEnded,
    }];
  });
}

export function binDiurnalSessions(
  observations: readonly (Pick<SessionPoint, "time" | "eye" | "iop"> & Partial<Pick<SessionPoint, "sessionStart" | "sessionEnd">>)[],
  eye: Eye,
  range: { label: string; start: string; startTime: string },
  end: string,
  endTime: string,
  exactEnd?: number,
): DiurnalPoint[] {
  const rangeStart = dateTimeBoundary(range.start, range.startTime);
  const rangeEnd = exactEnd ?? dateTimeBoundary(end, endTime, true);
  if (rangeStart === null || rangeEnd === null) return [];
  const buckets = Array.from({ length: 8 }, () => [] as number[]);
  observations
    .filter((observation) => observation.eye === eye
      && (observation.sessionStart ?? observation.time) >= rangeStart
      && (observation.sessionEnd ?? observation.time) <= rangeEnd)
    .forEach((observation) => {
      const date = new Date(observation.time);
      const minuteOfDay = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
      buckets[Math.min(7, Math.floor(minuteOfDay / 180))].push(observation.iop);
    });
  return buckets.flatMap((values, bin) => {
    if (values.length === 0) return [];
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.length > 1 ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1) : 0;
    return [{ bin, minuteOfDay: bin * 180 + 90, mean, sd: Math.sqrt(variance), count: values.length, periodLabel: range.label, eye }];
  });
}

export type DiurnalYAxisScale = {
  domain: [number, number];
  ticks: number[];
};

function niceWholeNumberStep(value: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(1, value)));
  const normalized = value / magnitude;
  const multiplier = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 3 ? 3 : normalized <= 5 ? 5 : 10;
  return multiplier * magnitude;
}

export function diurnalYAxisScale(points: readonly DiurnalPoint[], target?: number): DiurnalYAxisScale {
  const safeTarget = target !== undefined && Number.isFinite(target)
    ? Math.min(100, Math.max(0.1, target))
    : undefined;
  if (points.length === 0) {
    if (safeTarget !== undefined && (safeTarget < 10 || safeTarget > 35)) {
      const lower = Math.min(10, Math.floor(safeTarget / 5) * 5 - 5);
      const upper = Math.max(35, Math.ceil(safeTarget / 5) * 5 + 5);
      return { domain: [lower, upper], ticks: Array.from({ length: (upper - lower) / 5 + 1 }, (_, index) => lower + index * 5) };
    }
    return { domain: [10, 35], ticks: [10, 15, 20, 25, 30, 35] };
  }

  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    minimum = Math.min(minimum, point.mean - point.sd);
    maximum = Math.max(maximum, point.mean + point.sd);
  }
  if (safeTarget !== undefined) {
    minimum = Math.min(minimum, safeTarget);
    maximum = Math.max(maximum, safeTarget);
  }

  const span = Math.max(1, maximum - minimum);
  const padding = Math.max(1, span * 0.08);
  const step = niceWholeNumberStep((span + padding * 2) / 7);
  const lower = Math.floor((minimum - padding) / step) * step;
  const upper = Math.ceil((maximum + padding) / step) * step;
  const ticks = Array.from({ length: Math.round((upper - lower) / step) + 1 }, (_, index) => lower + index * step);

  return { domain: [lower, upper], ticks };
}

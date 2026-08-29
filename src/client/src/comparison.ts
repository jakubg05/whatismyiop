import { dateTimeBoundary, formatDateInput, formatTimeInput, type Eye, type SessionPoint } from "./analysis";

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
export type ComparisonCatalog = { periods: readonly ComparisonPeriod[]; events: readonly ComparisonEvent[] };

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
  openEnded: false;
};

export type ComparisonExpectedState =
  | "segment-start"
  | "duration"
  | "direction"
  | "target-type"
  | "period-value"
  | "event-value"
  | "and"
  | "maximum";

export type ComparisonTokenRole =
  | "segment-keyword"
  | "duration"
  | "direction"
  | "target-type"
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
export const RECOMMENDED_DURATIONS = ["7d", "14d", "30d", "90d"] as const;
const LABEL_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}_-]*$/u;

export function isValidComparisonLabel(label: string): boolean {
  return LABEL_PATTERN.test(label);
}

export function comparisonLabelError(
  label: string,
  type: ComparisonTargetType,
  catalog: ComparisonCatalog,
  excludingId?: string,
): string | null {
  if (!isValidComparisonLabel(label)) return "Labels may contain letters, numbers, hyphens, and underscores, and must begin with a letter or number.";
  const values = type === "period" ? catalog.periods : catalog.events;
  if (values.some((value) => value.id !== excludingId && value.label.toLocaleLowerCase() === label.toLocaleLowerCase())) {
    return `A ${type} named ${label} already exists.`;
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

function targetByLabel<T extends { label: string }>(values: readonly T[], label: string): T | null {
  const normalized = label.toLocaleLowerCase();
  return values.find((value) => isValidComparisonLabel(value.label) && value.label.toLocaleLowerCase() === normalized) ?? null;
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
    if (!startKeyword || !["period", "range", "before", "after"].includes(startKeyword.word)) {
      fail("segment-start", segmentFrom);
      break;
    }
    append({ from: startKeyword.from, to: startKeyword.to, canonical: `${startKeyword.word}:`, style: "keyword", role: "segment-keyword" });

    let days: number | null = null;
    let direction: ComparisonDirection | null = null;
    let targetType: ComparisonTargetType | null = null;
    let targetId = "";
    let targetLabel = "";

    if (startKeyword.word === "period") {
      expected = "period-value";
      const value = readWord(text, position);
      if (!value) break;
      const period = targetByLabel(catalog.periods, value.word);
      if (!period) {
        fail("period-value", value.from);
        break;
      }
      append({ from: value.from, to: value.to, canonical: period.label, style: "value", role: "period-value" });
      const label = `period:${period.label}`;
      segments.push({ kind: "period", periodId: period.id, label, sourceFrom: segmentFrom, sourceTo: position });
    } else {
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

      expected = "target-type";
      const typeKeyword = readColonKeyword(text, position);
      const typeStart = skipWhitespace(text, position);
      if (!typeKeyword || (typeKeyword.word !== "period" && typeKeyword.word !== "event")) {
        if (typeStart < text.length) fail("target-type", typeStart);
        break;
      }
      targetType = typeKeyword.word;
      append({ from: typeKeyword.from, to: typeKeyword.to, canonical: `${targetType}:`, style: "keyword", role: "target-type" });

      expected = targetType === "period" ? "period-value" : "event-value";
      const value = readWord(text, position);
      if (!value) break;
      if (targetType === "period") {
        const period = targetByLabel(catalog.periods, value.word);
        if (!period || (direction === "after" && period.openEnded)) {
          fail("period-value", value.from);
          break;
        }
        targetId = period.id;
        targetLabel = period.label;
        append({ from: value.from, to: value.to, canonical: period.label, style: "value", role: "period-value" });
      } else {
        const event = targetByLabel(catalog.events, value.word);
        if (!event) {
          fail("event-value", value.from);
          break;
        }
        targetId = event.id;
        targetLabel = event.label;
        append({ from: value.from, to: value.to, canonical: event.label, style: "value", role: "event-value" });
      }
      const label = `${days === null ? "" : `range:${days}d `}${direction}:${targetType}:${targetLabel}`;
      segments.push({ kind: "relative", days, direction, targetType, targetId, label, sourceFrom: segmentFrom, sourceTo: position });
    }

    if (segments.length === MAX_COMPARISON_SEGMENTS) {
      expected = "maximum";
      maximumReached = true;
      inactiveFrom = firstNonWhitespace(text, position);
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
    const separator = expected === "direction" || expected === "and" || expected === "maximum" ? " " : "";
    canonicalText += separator + text.slice(suffixFrom).replace(/[\r\n]+/g, " ");
  }
  return { text, segments, tokens, expected, inactiveFrom, canonicalPrefix, canonicalText: canonicalText.trim(), maximumReached };
}

function optionMessage(expected: ComparisonExpectedState, count: number): string {
  if (expected === "maximum") return "Six comparison segments are already shown";
  if (expected === "duration") return count ? `${count} suggested durations` : "Expected a whole-day duration such as 14d";
  if (expected === "target-type") return count ? "Choose period: or event:" : "Expected period: or event:";
  if (expected === "period-value") return count ? `${count} matching periods` : "No matching period";
  if (expected === "event-value") return count ? `${count} matching annotations` : "No matching annotation";
  if (expected === "and") return count ? "Add another comparison segment" : "Expected AND";
  return count ? `${count} suggestions` : `Expected ${expected === "direction" ? "before: or after:" : "a comparison keyword"}`;
}

function completionsForState(expected: ComparisonExpectedState, catalog: ComparisonCatalog, direction: ComparisonDirection | null): ComparisonCompletion[] {
  if (expected === "segment-start") return ["period:", "range:", "before:", "after:"].map((label) => ({ label, type: "keyword" as const }));
  if (expected === "duration") return RECOMMENDED_DURATIONS.map((label) => ({ label, type: "duration" as const }));
  if (expected === "direction") return ["before:", "after:"].map((label) => ({ label, type: "keyword" as const }));
  if (expected === "target-type") return ["period:", "event:"].map((label) => ({ label, type: "keyword" as const }));
  if (expected === "period-value") return catalog.periods
    .filter((period) => isValidComparisonLabel(period.label) && !(direction === "after" && period.openEnded))
    .map((period) => ({ label: period.label, detail: period.openEnded ? "Open-ended period" : `${period.start} – ${period.end}`, type: "period" as const }));
  if (expected === "event-value") return catalog.events
    .filter((event) => isValidComparisonLabel(event.label))
    .map((event) => ({ label: event.label, detail: `${formatDateInput(event.time)} ${formatTimeInput(event.time)}`, type: "event" as const }));
  if (expected === "and") return [{ label: "AND", type: "delimiter" }];
  return [];
}

function tokenExpected(token: ComparisonToken): ComparisonExpectedState {
  if (token.role === "duration") return "duration";
  if (token.role === "direction") return "direction";
  if (token.role === "target-type") return "target-type";
  if (token.role === "period-value") return "period-value";
  if (token.role === "event-value") return "event-value";
  if (token.role === "and") return "and";
  return "segment-start";
}

function directionBefore(text: string, position: number, catalog: ComparisonCatalog): ComparisonDirection | null {
  const prefix = parseComparisonExpression(text.slice(0, position), catalog);
  const last = [...prefix.tokens].reverse().find((token) => token.role === "direction");
  return last?.canonical.startsWith("after") ? "after" : last?.canonical.startsWith("before") ? "before" : null;
}

export function comparisonCompletionContext(text: string, position: number, catalog: ComparisonCatalog): ComparisonCompletionContext {
  const parsed = parseComparisonExpression(text, catalog);
  const semantic = parsed.tokens.find((token) => position >= token.from && position < token.to);
  const prefix = parseComparisonExpression(text.slice(0, position), catalog);
  let expected = semantic ? tokenExpected(semantic) : prefix.expected;
  let from = semantic?.from ?? position;
  let to = semantic?.to ?? position;
  if (!semantic) {
    if (prefix.inactiveFrom !== null) {
      from = prefix.inactiveFrom;
      while (to < text.length && !/\s/.test(text[to])) to += 1;
    }
    if (parsed.maximumReached && position >= (parsed.inactiveFrom ?? text.length)) expected = "maximum";
  }
  const direction = directionBefore(text, from, catalog);
  const options = completionsForState(expected, catalog, direction);
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
    if (definition.kind === "period") {
      const period = catalog.periods.find((item) => item.id === definition.periodId);
      if (!period) return [];
      start = dateTimeBoundary(period.start, period.startTime);
      end = period.openEnded ? presentTime : dateTimeBoundary(period.end, period.endTime, true);
    } else if (definition.targetType === "event") {
      const event = catalog.events.find((item) => item.id === definition.targetId);
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
      end: formatDateInput(end),
      endTime: formatTimeInput(end),
      openEnded: false as const,
    }];
  });
}

export function binDiurnalSessions(
  sessions: SessionPoint[],
  eye: Eye,
  range: { label: string; start: string; startTime: string },
  end: string,
  endTime: string,
): DiurnalPoint[] {
  const rangeStart = dateTimeBoundary(range.start, range.startTime);
  const rangeEnd = dateTimeBoundary(end, endTime, true);
  if (rangeStart === null || rangeEnd === null) return [];
  const buckets = Array.from({ length: 8 }, () => [] as number[]);
  sessions
    .filter((session) => session.eye === eye && session.sessionStart >= rangeStart && session.sessionEnd <= rangeEnd)
    .forEach((session) => {
      const date = new Date(session.time);
      const minuteOfDay = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
      buckets[Math.min(7, Math.floor(minuteOfDay / 180))].push(session.iop);
    });
  return buckets.flatMap((values, bin) => {
    if (values.length === 0) return [];
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.length > 1 ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1) : 0;
    return [{ bin, minuteOfDay: bin * 180 + 90, mean, sd: Math.sqrt(variance), count: values.length, periodLabel: range.label, eye }];
  });
}

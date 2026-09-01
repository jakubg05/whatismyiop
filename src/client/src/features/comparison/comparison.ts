import {
  formatDateInput,
  formatTimeInput,
  parseDateTimeBoundary,
} from "../../shared/lib/wallClock";
import type { TimelineEvent, TreatmentPeriod } from "../annotations";

type ComparisonDirection = "before" | "after";
type ComparisonTargetType = "period" | "event";

export type ComparisonCatalog = {
  periods: readonly TreatmentPeriod[];
  events: readonly TimelineEvent[];
  now: number;
};

type ComparisonSegmentDefinition =
  | { kind: "period"; periodId: string; label: string }
  | {
      kind: "relative";
      days: number | null;
      direction: ComparisonDirection;
      targetType: ComparisonTargetType;
      targetId: string;
      label: string;
    };

type ComparisonSegment = {
  id: string;
  label: string;
  start: string;
  startTime: string;
  end: string;
  endTime: string;
  openEnded: boolean;
};

type ComparisonExpectedState =
  | "segment-start"
  | "duration"
  | "direction"
  | "target-value"
  | "and"
  | "maximum";

type ComparisonTokenRole =
  | "segment-keyword"
  | "duration"
  | "direction"
  | "direct-period-value"
  | "period-value"
  | "event-value"
  | "and";

type ComparisonToken = {
  from: number;
  to: number;
  canonical: string;
  style: "keyword" | "value" | "and";
  role: ComparisonTokenRole;
};

type ComparisonParseResult = {
  segments: ComparisonSegmentDefinition[];
  tokens: ComparisonToken[];
  expected: ComparisonExpectedState;
  inactiveFrom: number | null;
  canonicalText: string;
};

export type ComparisonCompletion = {
  label: string;
  detail?: string;
  type: "keyword" | "duration" | "period" | "event" | "delimiter";
};

type ComparisonCompletionContext = {
  parsed: ComparisonParseResult;
  expected: ComparisonExpectedState;
  from: number;
  to: number;
  options: ComparisonCompletion[];
  message: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_COMPARISON_DAYS = 36_500;
const MAX_COMPARISON_SEGMENTS = 6;
export const NOW_COMPARISON_EVENT_ID = "comparison-now";
const RECOMMENDED_DURATIONS = ["7d", "14d", "30d", "90d"] as const;
function durationValue(text: string): number | null {
  if (!/^[1-9][0-9]*d$/.test(text)) return null;
  const days = Number(text.slice(0, -1));
  return Number.isSafeInteger(days) && days <= MAX_COMPARISON_DAYS
    ? days
    : null;
}

function firstNonWhitespace(text: string, from: number): number | null {
  for (let index = from; index < text.length; index += 1)
    if (!/\s/.test(text[index])) return index;
  return null;
}

function skipWhitespace(text: string, from: number): number {
  let position = from;
  while (position < text.length && /\s/.test(text[position])) position += 1;
  return position;
}

function readColonKeyword(
  text: string,
  from: number,
): { word: string; from: number; to: number } | null {
  const start = skipWhitespace(text, from);
  const match = /^([\p{L}]+)\s*:/u.exec(text.slice(start));
  return match
    ? {
        word: match[1].toLocaleLowerCase(),
        from: start,
        to: start + match[0].length,
      }
    : null;
}

function readWord(
  text: string,
  from: number,
): { word: string; from: number; to: number } | null {
  const start = skipWhitespace(text, from);
  const match = /^[^\s:]+/.exec(text.slice(start));
  return match
    ? { word: match[0], from: start, to: start + match[0].length }
    : null;
}

type ComparisonTarget =
  | { type: "period"; value: TreatmentPeriod }
  | { type: "event"; value: TimelineEvent };

function targetValueByLabel(
  catalog: ComparisonCatalog,
  label: string,
): ComparisonTarget | null {
  const normalized = label.toLocaleLowerCase();
  if (normalized === "now") {
    return {
      type: "event",
      value: { id: NOW_COMPARISON_EVENT_ID, label: "now", time: catalog.now },
    };
  }
  const period = catalog.periods.find(
    (value) => value.label.toLocaleLowerCase() === normalized,
  );
  if (period) return { type: "period", value: period };
  const event = catalog.events.find(
    (value) => value.label.toLocaleLowerCase() === normalized,
  );
  return event ? { type: "event", value: event } : null;
}

export function parseComparisonExpression(
  text: string,
  catalog: ComparisonCatalog,
): ComparisonParseResult {
  let position = 0;
  let canonicalPrefix = "";
  let expected: ComparisonExpectedState = "segment-start";
  let inactiveFrom: number | null = null;
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
    if (skipWhitespace(text, position) >= text.length) break;
    const startKeyword = readColonKeyword(text, position);
    let days: number | null = null;
    let direction: ComparisonDirection | null = null;

    if (
      !startKeyword ||
      !["range", "before", "after"].includes(startKeyword.word)
    ) {
      const value = readWord(text, position);
      if (!value) break;
      const target = targetValueByLabel(catalog, value.word);
      if (target?.type !== "period") {
        fail("segment-start", value.from);
        break;
      }
      const period = target.value;
      append({
        from: value.from,
        to: value.to,
        canonical: period.label,
        style: "value",
        role: "direct-period-value",
      });
      segments.push({
        kind: "period",
        periodId: period.id,
        label: period.label,
      });
    } else {
      append({
        from: startKeyword.from,
        to: startKeyword.to,
        canonical: `${startKeyword.word}:`,
        style: "keyword",
        role: "segment-keyword",
      });
      if (startKeyword.word === "range") {
        expected = "duration";
        const value = readWord(text, position);
        if (!value) break;
        days = durationValue(value.word);
        if (days === null) {
          fail("duration", value.from);
          break;
        }
        append({
          from: value.from,
          to: value.to,
          canonical: value.word,
          style: "value",
          role: "duration",
        });

        expected = "direction";
        const directionKeyword = readColonKeyword(text, position);
        const directionStart = skipWhitespace(text, position);
        if (
          !directionKeyword ||
          (directionKeyword.word !== "before" &&
            directionKeyword.word !== "after")
        ) {
          if (directionStart < text.length) fail("direction", directionStart);
          break;
        }
        direction = directionKeyword.word;
        append(
          {
            from: directionKeyword.from,
            to: directionKeyword.to,
            canonical: `${direction}:`,
            style: "keyword",
            role: "direction",
          },
          " ",
        );
      } else {
        direction = startKeyword.word as ComparisonDirection;
        tokens[tokens.length - 1].role = "direction";
      }

      expected = "target-value";
      const value = readWord(text, position);
      if (!value) break;
      const target = targetValueByLabel(catalog, value.word);
      if (
        !target ||
        (target.type === "period" &&
          direction === "after" &&
          target.value.openEnded)
      ) {
        fail("target-value", value.from);
        break;
      }
      const targetLabel = target.value.label;
      const targetRole =
        target.type === "period" ? "period-value" : "event-value";
      append({
        from: value.from,
        to: value.to,
        canonical: targetLabel,
        style: "value",
        role: targetRole,
      });
      const label = `${days === null ? "" : `range:${days}d `}${direction}:${targetLabel}`;
      segments.push({
        kind: "relative",
        days,
        direction,
        targetType: target.type,
        targetId: target.value.id,
        label,
      });
    }

    if (segments.length === MAX_COMPARISON_SEGMENTS) {
      expected = "maximum";
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
    append(
      {
        from: delimiter.from,
        to: delimiter.to,
        canonical: "AND",
        style: "and",
        role: "and",
      },
      " ",
    );
    canonicalPrefix += " ";
  }

  const suffixFrom = inactiveFrom ?? text.length;
  let canonicalText = canonicalPrefix;
  if (inactiveFrom !== null) {
    const separator = expected === "direction" || expected === "and" ? " " : "";
    canonicalText +=
      separator + text.slice(suffixFrom).replace(/\r\n|[\r\n]/g, " ");
  }
  return {
    segments,
    tokens,
    expected,
    inactiveFrom,
    canonicalText:
      expected === "maximum" && inactiveFrom !== null
        ? canonicalText.trimStart()
        : canonicalText.trim(),
  };
}

function optionMessage(
  expected: ComparisonExpectedState,
  count: number,
): string {
  if (expected === "maximum")
    return "Six comparison segments are already shown";
  if (expected === "duration")
    return count
      ? `${count} suggested durations`
      : "Expected a whole-day duration such as 14d";
  if (expected === "target-value")
    return count
      ? `${count} matching periods and events`
      : "No matching period or event";
  if (expected === "and")
    return count ? "Add another comparison segment" : "Expected AND";
  return count
    ? `${count} suggestions`
    : `Expected ${expected === "direction" ? "before: or after:" : "a comparison keyword or saved period"}`;
}

function completionsForState(
  expected: ComparisonExpectedState,
  catalog: ComparisonCatalog,
  direction: ComparisonDirection | null,
): ComparisonCompletion[] {
  if (expected === "duration")
    return RECOMMENDED_DURATIONS.map((label) => ({
      label,
      detail: `${Number.parseInt(label, 10)} day window`,
      type: "duration" as const,
    }));
  if (expected === "direction")
    return [
      {
        label: "before:",
        detail: "Use time before the target",
        type: "keyword",
      },
      { label: "after:", detail: "Use time after the target", type: "keyword" },
    ];
  if (expected === "and")
    return [
      {
        label: "AND",
        detail: "Add another comparison segment",
        type: "delimiter",
      },
    ];
  if (expected === "maximum") return [];

  const periodOptions = catalog.periods
    .filter((period) => !(direction === "after" && period.openEnded))
    .map((period) => ({
      label: period.label,
      detail: `${period.start} ${period.openEnded ? "now" : period.end}`,
      type: "period" as const,
    }));
  if (expected === "segment-start")
    return [
      { label: "range:", detail: "Window around a target", type: "keyword" },
      { label: "before:", detail: "Time before a target", type: "keyword" },
      { label: "after:", detail: "Time after a target", type: "keyword" },
      ...periodOptions,
    ];

  const eventOptions = catalog.events.map((event) => ({
    label: event.label,
    detail: formatDateInput(event.time),
    type: "event" as const,
  }));
  eventOptions.push({
    label: "now",
    detail: formatDateInput(catalog.now),
    type: "event",
  });
  return [...periodOptions, ...eventOptions];
}

function tokenExpected(token: ComparisonToken): ComparisonExpectedState {
  if (token.role === "duration") return "duration";
  if (token.role === "direction") return "direction";
  if (token.role === "period-value" || token.role === "event-value")
    return "target-value";
  if (token.role === "and") return "and";
  return "segment-start";
}

function directionFromTokens(
  tokens: readonly ComparisonToken[],
): ComparisonDirection | null {
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens[index];
    if (token.role === "and") return null;
    if (token.role === "direct-period-value") return null;
    if (token.role === "direction")
      return token.canonical.startsWith("after") ? "after" : "before";
  }
  return null;
}

export function comparisonCompletionContext(
  text: string,
  position: number,
  catalog: ComparisonCatalog,
): ComparisonCompletionContext {
  const parsed = parseComparisonExpression(text, catalog);
  const semantic = parsed.tokens.find(
    (token) => position >= token.from && position < token.to,
  );
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
      while (firstInvalidTo < text.length && !/\s/.test(text[firstInvalidTo]))
        firstInvalidTo += 1;
      if (position >= parsed.inactiveFrom && position <= firstInvalidTo) {
        from = parsed.inactiveFrom;
        to = firstInvalidTo;
        expected = parsed.expected;
      }
    }
    if (
      parsed.expected === "maximum" &&
      position >= (parsed.inactiveFrom ?? text.length)
    )
      expected = "maximum";
  }
  const direction = directionFromTokens(prefix.tokens);
  let options = completionsForState(expected, catalog, direction);
  if (!semantic && parsed.inactiveFrom !== null && expected !== "maximum") {
    if (position > (firstInvalidTo ?? parsed.inactiveFrom)) options = [];
  }
  return {
    parsed,
    expected,
    from,
    to,
    options,
    message: optionMessage(expected, options.length),
  };
}

export function canonicalizeComparisonExpression(
  text: string,
  catalog: ComparisonCatalog,
): string {
  return parseComparisonExpression(text.replace(/[\r\n]+/g, " "), catalog)
    .canonicalText;
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
      const period = catalog.periods.find(
        (item) => item.id === definition.periodId,
      );
      if (!period) return [];
      start = parseDateTimeBoundary(period.start, period.startTime);
      openEnded = period.openEnded;
      end = openEnded
        ? presentTime
        : parseDateTimeBoundary(period.end, period.endTime, "end");
    } else if (definition.targetType === "event") {
      const event =
        definition.targetId === NOW_COMPARISON_EVENT_ID
          ? { id: NOW_COMPARISON_EVENT_ID, label: "now", time: presentTime }
          : catalog.events.find((item) => item.id === definition.targetId);
      if (!event) return [];
      if (definition.days === null) {
        start = definition.direction === "before" ? domainStart : event.time;
        end =
          definition.direction === "before" ? event.time - 60_000 : domainEnd;
      } else {
        const duration = definition.days * DAY_MS;
        start =
          definition.direction === "before"
            ? event.time - duration
            : event.time;
        end =
          definition.direction === "before"
            ? event.time - 60_000
            : event.time + duration - 60_000;
      }
    } else {
      const period = catalog.periods.find(
        (item) => item.id === definition.targetId,
      );
      if (!period || (definition.direction === "after" && period.openEnded))
        return [];
      const boundary =
        definition.direction === "before"
          ? parseDateTimeBoundary(period.start, period.startTime)
          : parseDateTimeBoundary(period.end, period.endTime, "end");
      if (boundary === null) return [];
      if (definition.days === null) {
        start =
          definition.direction === "before" ? domainStart : boundary + 60_000;
        end = definition.direction === "before" ? boundary - 60_000 : domainEnd;
      } else {
        const duration = definition.days * DAY_MS;
        start =
          definition.direction === "before"
            ? boundary - duration
            : boundary + 60_000;
        end =
          definition.direction === "before"
            ? boundary - 60_000
            : boundary + duration;
      }
    }
    if (start === null || end === null) return [];
    return [
      {
        id: `comparison-${index}`,
        label: definition.label,
        start: formatDateInput(start),
        startTime: formatTimeInput(start),
        end: openEnded ? "" : formatDateInput(end),
        endTime: openEnded ? "" : formatTimeInput(end),
        openEnded,
      },
    ];
  });
}

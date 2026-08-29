import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  CartesianGrid,
  ErrorBar,
  ReferenceArea,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  formatDateInput,
  formatTimeInput,
  coalesceMeasurementSessions,
  dateTimeBoundary,
  parseMeasurementsCsv,
  type Eye,
  type ParseResult,
} from "./analysis";
import { ComparisonManager } from "./ComparisonManager";
import { binDiurnalSessions, eventRelativePeriod, fullRelativePeriod, rangeRelativePeriod, type ComparisonDirection, type DiurnalPoint } from "./comparison";
import { ChartEditor, MeasurementsChart, normalizeRangeEdges, type ChartMode, type DraftRange, type TrendMode } from "./main-chart";
import { PERIOD_PALETTE, periodPalette } from "./periodPalette";
import { TopNavigation } from "./TopNavigation";
import { Button, SegmentedControl } from "./shared";

type SavedRange = DraftRange & {
  id: string;
  sourceEventId?: string;
  relativeDirection?: ComparisonDirection;
  relativeDays?: number;
};

type SavedEvent = {
  id: string;
  label: string;
  time: number;
};

type ComparisonSelection =
  | { kind: "range"; id: string }
  | { kind: "derived"; id: string; targetKind: "event" | "range"; targetId: string; direction: ComparisonDirection; days: number | null };

type ComparisonManagerSelection =
  | { kind: "period"; id: string; period: SavedRange }
  | { kind: "derived"; id: string; target: { kind: "event"; event: SavedEvent } | { kind: "period"; period: SavedRange }; direction: ComparisonDirection; days: number | null };

type LegacyDerivedComparison = {
  kind?: "derived";
  id: string;
  sourceEventId: string;
  direction: ComparisonDirection;
  days: number;
};

type PersistedState = {
  version: 1;
  fileName: string;
  csvText: string;
  ranges: SavedRange[];
  events: SavedEvent[];
  comparisonRangeIds?: string[];
  comparisonDerived?: LegacyDerivedComparison[];
  comparisons?: Array<ComparisonSelection | LegacyDerivedComparison>;
};

const STORAGE_KEY = "icare-analytics:v1";

function emptyDraftRange(): DraftRange {
  return { label: "", start: "", startTime: "00:00", end: "", endTime: "23:59", openEnded: false };
}

function eyeLabel(eye: Eye): string {
  return eye === "OD" ? "Right eye" : "Left eye";
}

function diurnalBinLabel(bin: number): string {
  const startHour = bin * 3;
  const endHour = startHour + 2;
  return `${String(startHour).padStart(2, "0")}:00–${String(endHour).padStart(2, "0")}:59`;
}

function wallClockTimestamp(time = Date.now()): number {
  const date = new Date(time);
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds());
}

function diurnalTickLabel(value: number): string {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:00`;
}

function DiurnalTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: DiurnalPoint }> }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="diurnal-tooltip">
      <strong>{point.periodLabel} · {eyeLabel(point.eye)}</strong>
      <span>{diurnalBinLabel(point.bin)}</span>
      <span>Mean: {point.mean.toFixed(1)} mmHg</span>
      <span>SD: {point.sd.toFixed(1)} mmHg</span>
      <span>Sessions: {point.count}</span>
    </div>
  );
}

export default function App() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [data, setData] = useState<ParseResult | null>(null);
  const [fileName, setFileName] = useState("");
  const [rawCsv, setRawCsv] = useState("");
  const [error, setError] = useState("");
  const [visibleEyes, setVisibleEyes] = useState<Record<Eye, boolean>>({ OD: true, OS: true });
  const [trendMode, setTrendMode] = useState<TrendMode>("adjusted");
  const [visibleTrendEyes, setVisibleTrendEyes] = useState<Record<Eye, boolean>>({ OD: true, OS: true });
  const [diurnalEye, setDiurnalEye] = useState<Eye>("OD");
  const [chartAnnotationOffset, setChartAnnotationOffset] = useState(0);
  const [mode, setMode] = useState<ChartMode>(null);
  const [now, setNow] = useState(() => wallClockTimestamp());
  const [ranges, setRanges] = useState<SavedRange[]>([]);
  const [comparisons, setComparisons] = useState<ComparisonSelection[]>([]);
  const [events, setEvents] = useState<SavedEvent[]>([]);
  const [draftRange, setDraftRange] = useState<DraftRange>(emptyDraftRange);
  const [draftEvent, setDraftEvent] = useState({ label: "", date: "", clock: "" });
  const [editingRangeId, setEditingRangeId] = useState<string | null>(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const chartDraftRange = draftRange;
  const chartDraftEvent = useDeferredValue(draftEvent);

  const measurements = data?.measurements ?? [];
  const measurementSessions = useMemo(() => coalesceMeasurementSessions(measurements), [measurements]);
  const fullDomainStart = measurements[0]?.time ?? 0;
  const fullDomainEnd = measurements.at(-1)?.time ?? 0;
  const [minimumIop, maximumIop] = useMemo(() => {
    let minimum = Number.POSITIVE_INFINITY;
    let maximum = Number.NEGATIVE_INFINITY;
    for (const measurement of measurements) {
      minimum = Math.min(minimum, measurement.iop);
      maximum = Math.max(maximum, measurement.iop);
    }
    return Number.isFinite(minimum) ? [Math.floor(minimum - 2), Math.ceil(maximum + 2)] : [0, 1];
  }, [measurements]);
  const today = formatDateInput(now);
  const currentTime = formatTimeInput(now);
  const comparisonRanges = useMemo(() => comparisons.flatMap((comparison) => {
    if (comparison.kind === "range") {
      const range = ranges.find((item) => item.id === comparison.id);
      return range ? [range] : [];
    }
    if (comparison.targetKind === "event") {
      const event = events.find((item) => item.id === comparison.targetId);
      if (!event) return [];
      const relative = comparison.days === null
        ? fullRelativePeriod(event, comparison.direction, fullDomainStart, fullDomainEnd)
        : eventRelativePeriod(event, comparison.direction, comparison.days);
      return [{ ...relative, id: comparison.id }];
    }
    const target = ranges.find((item) => item.id === comparison.targetId);
    if (!target) return [];
    const effectiveTarget = target.openEnded ? { ...target, end: today, endTime: currentTime } : target;
    let relative;
    if (comparison.days === null) {
      const boundary = comparison.direction === "before"
        ? dateTimeBoundary(effectiveTarget.start, effectiveTarget.startTime)
        : dateTimeBoundary(effectiveTarget.end, effectiveTarget.endTime, true);
      if (boundary === null) return [];
      relative = fullRelativePeriod(
        { label: effectiveTarget.label, time: comparison.direction === "after" ? boundary + 1 : boundary },
        comparison.direction,
        fullDomainStart,
        fullDomainEnd,
      );
    } else {
      relative = rangeRelativePeriod(effectiveTarget, comparison.direction, comparison.days);
    }
    return relative ? [{ ...relative, id: comparison.id }] : [];
  }), [comparisons, currentTime, events, fullDomainEnd, fullDomainStart, ranges, today]);
  const diurnalSeries = useMemo(() => comparisonRanges.map((range) => {
    const effectiveEnd = range.openEnded ? today : range.end;
    const effectiveEndTime = range.openEnded ? currentTime : range.endTime;
    const comparisonIndex = comparisonRanges.findIndex((item) => item.id === range.id);
    return {
      id: range.id,
      name: range.label,
      color: periodPalette(comparisonIndex).stroke,
      data: binDiurnalSessions(measurementSessions, diurnalEye, range, effectiveEnd, effectiveEndTime),
    };
  }), [comparisonRanges, currentTime, diurnalEye, measurementSessions, today]);
  const diurnalPoints = useMemo(() => diurnalSeries.flatMap((series) => series.data), [diurnalSeries]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(wallClockTimestamp()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    try {
      const state = JSON.parse(saved) as PersistedState;
      if (state.version !== 1 || typeof state.csvText !== "string" || typeof state.fileName !== "string" || !Array.isArray(state.ranges) || !Array.isArray(state.events)) return;
      const result = parseMeasurementsCsv(state.csvText);
      if (result.measurements.length === 0) return;
      setRawCsv(state.csvText);
      setFileName(state.fileName);
      setData(result);
      const restoredEvents = state.events.filter((event, index, all) => event
        && typeof event.id === "string"
        && typeof event.label === "string"
        && event.label.trim().length > 0
        && typeof event.time === "number"
        && Number.isFinite(event.time)
        && all.findIndex((candidate) => candidate?.id === event.id) === index);
      const normalizedRanges = state.ranges.map((range) => ({
        ...range,
        startTime: typeof range.startTime === "string" ? range.startTime : "00:00",
        end: range.openEnded ? "" : range.end,
        endTime: range.openEnded ? "" : typeof range.endTime === "string" ? range.endTime : "23:59",
      }));
      const legacyDefinition = (range: SavedRange): Extract<ComparisonSelection, { kind: "derived" }> | null => {
        if (range.sourceEventId
          && (range.relativeDirection === "before" || range.relativeDirection === "after")
          && typeof range.relativeDays === "number"
          && Number.isFinite(range.relativeDays)) {
          const sourceEvent = restoredEvents.find((event) => event.id === range.sourceEventId);
          if (sourceEvent) return { kind: "derived", id: range.id, targetKind: "event", targetId: sourceEvent.id, direction: range.relativeDirection, days: range.relativeDays };
        }
        const label = /^(\d+)d (before|after) (.+)$/i.exec(range.label);
        if (!label) return null;
        const days = Number(label[1]);
        const direction = label[2].toLowerCase() as ComparisonDirection;
        const event = restoredEvents.find((candidate) => candidate.label.toLowerCase() === label[3].toLowerCase());
        if (!event) return null;
        const expected = eventRelativePeriod(event, direction, days);
        return expected.label.toLowerCase() === range.label.toLowerCase()
          && expected.start === range.start
          && expected.startTime === range.startTime
          && expected.end === range.end
          && expected.endTime === range.endTime
          ? { kind: "derived", id: range.id, targetKind: "event", targetId: event.id, direction, days }
          : null;
      };
      const legacyDefinitions = new Map(normalizedRanges.flatMap((range) => {
        const definition = legacyDefinition(range);
        return definition ? [[range.id, definition] as const] : [];
      }));
      const savedRanges = normalizedRanges.filter((range) => !legacyDefinitions.has(range.id));
      const savedRangeIds = new Set(savedRanges.map((range) => range.id));
      const eventIds = new Set(restoredEvents.map((event) => event.id));
      const legacySelectedIds = Array.isArray(state.comparisonRangeIds)
        ? state.comparisonRangeIds
        : normalizedRanges.map((range) => range.id);
      const legacySelections = legacySelectedIds.flatMap<ComparisonSelection>((id) => {
        if (typeof id !== "string") return [];
        const derived = legacyDefinitions.get(id);
        if (derived) return [derived];
        return savedRangeIds.has(id) ? [{ kind: "range" as const, id }] : [];
      });
      if (Array.isArray(state.comparisonDerived)) {
        legacySelections.push(...state.comparisonDerived.map((comparison) => ({
          kind: "derived" as const,
          id: comparison.id,
          targetKind: "event" as const,
          targetId: comparison.sourceEventId,
          direction: comparison.direction,
          days: comparison.days,
        })));
      }
      const sourceSelections = Array.isArray(state.comparisons) ? state.comparisons : legacySelections;
      const restoredSelections: ComparisonSelection[] = [];
      const seenIds = new Set<string>();
      const seenDefinitions = new Set<string>();
      for (const comparison of sourceSelections) {
        if (!comparison || typeof comparison.id !== "string" || seenIds.has(comparison.id)) continue;
        if (comparison.kind === "range") {
          if (!savedRangeIds.has(comparison.id)) continue;
          restoredSelections.push({ kind: "range", id: comparison.id });
          seenIds.add(comparison.id);
        } else if (comparison.kind === "derived"
          && (comparison.direction === "before" || comparison.direction === "after")
          && (comparison.days === null || Number.isFinite(comparison.days))) {
          const targetKind = "targetKind" in comparison ? comparison.targetKind : "event";
          const targetId = "targetId" in comparison ? comparison.targetId : comparison.sourceEventId;
          const targetRange = targetKind === "range" ? savedRanges.find((range) => range.id === targetId) : undefined;
          if ((targetKind !== "event" && targetKind !== "range")
            || typeof targetId !== "string"
            || (targetKind === "event" ? !eventIds.has(targetId) : !targetRange)
            || (targetKind === "range" && comparison.direction === "after" && targetRange?.openEnded)) continue;
          const days = comparison.days === null ? null : Math.min(3650, Math.max(1, Math.round(comparison.days)));
          const definition = `${targetKind}:${targetId}:${comparison.direction}:${days}`;
          if (seenDefinitions.has(definition)) continue;
          restoredSelections.push({ kind: "derived", id: comparison.id, targetKind, targetId, direction: comparison.direction, days });
          seenIds.add(comparison.id);
          seenDefinitions.add(definition);
        }
        if (restoredSelections.length >= PERIOD_PALETTE.length) break;
      }
      setRanges(savedRanges);
      setEvents(restoredEvents);
      setComparisons(restoredSelections);
    } catch {
      setError("Saved browser data could not be restored.");
    }
  }, []);

  useEffect(() => {
    if (!rawCsv || !data) return;
    const state: PersistedState = { version: 1, fileName, csvText: rawCsv, ranges, events, comparisons };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      setError("The browser could not save this data locally.");
    }
  }, [comparisons, data, events, fileName, ranges, rawCsv]);

  async function loadFile(file: File) {
    setError("");
    try {
      const csvText = await file.text();
      const result = parseMeasurementsCsv(csvText);
      if (result.measurements.length === 0) throw new Error("The file contains no valid measurements.");
      setRawCsv(csvText);
      setData(result);
      setFileName(file.name);
      setRanges([]);
      setComparisons([]);
      setEvents([]);
      setEditingRangeId(null);
      setEditingEventId(null);
      setMode(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not read this CSV file.");
      setData(null);
    }
  }

  function clearStoredData() {
    window.localStorage.removeItem(STORAGE_KEY);
    setRawCsv("");
    setData(null);
    setFileName("");
    setRanges([]);
    setComparisons([]);
    setEvents([]);
    setEditingRangeId(null);
    setEditingEventId(null);
    setMode(null);
    setError("");
  }

  function addRange() {
    const orderedRange = normalizeRangeEdges(draftRange, now);
    const effectiveEnd = orderedRange.openEnded ? today : orderedRange.end;
    const effectiveEndTime = orderedRange.openEnded ? currentTime : orderedRange.endTime;
    if (!orderedRange.label.trim() || !orderedRange.start || !effectiveEnd) return;
    const startBoundary = dateTimeBoundary(orderedRange.start, orderedRange.startTime);
    const endBoundary = dateTimeBoundary(effectiveEnd, effectiveEndTime, true);
    if (startBoundary === null || endBoundary === null || startBoundary > endBoundary) {
      setError("Range start must be before its end.");
      return;
    }
    const saved = {
      ...orderedRange,
      end: orderedRange.openEnded ? "" : effectiveEnd,
      endTime: orderedRange.openEnded ? "" : effectiveEndTime,
      label: orderedRange.label.trim(),
    };
    if (editingRangeId) {
      setRanges((current) => current.map((range) => range.id === editingRangeId ? { ...saved, id: range.id } : range));
      if (saved.openEnded) {
        setComparisons((current) => current.filter((comparison) => comparison.kind !== "derived"
          || comparison.targetKind !== "range"
          || comparison.targetId !== editingRangeId
          || comparison.direction !== "after"));
      }
    } else {
      const id = crypto.randomUUID();
      setRanges((current) => [...current, { ...saved, id }]);
      setComparisons((current) => current.length < PERIOD_PALETTE.length ? [...current, { kind: "range", id }] : current);
    }
    setEditingRangeId(null);
    setDraftRange(emptyDraftRange());
    setMode(null);
    setError("");
  }

  function eventTimestamp(source = draftEvent): number | null {
    return dateTimeBoundary(source.date, source.clock);
  }

  function addEvent() {
    const time = eventTimestamp();
    if (!draftEvent.label.trim() || time === null) return;
    const label = draftEvent.label.trim();
    if (editingEventId) {
      const nextEvent = { id: editingEventId, label, time };
      setEvents((current) => current.map((event) => event.id === editingEventId ? nextEvent : event));
    } else {
      setEvents((current) => [...current, { id: crypto.randomUUID(), label, time }]);
    }
    setEditingEventId(null);
    setDraftEvent({ label: "", date: "", clock: "" });
    setMode(null);
  }

  const cancelDraft = useCallback(() => {
    setMode(null);
    setDraftRange(emptyDraftRange());
    setDraftEvent({ label: "", date: "", clock: "" });
    setEditingRangeId(null);
    setEditingEventId(null);
    setError("");
  }, []);

  function deleteDraft() {
    if (editingRangeId) {
      setRanges((current) => current.filter((range) => range.id !== editingRangeId));
      setComparisons((current) => current.filter((comparison) => comparison.id !== editingRangeId
        && (comparison.kind !== "derived" || comparison.targetKind !== "range" || comparison.targetId !== editingRangeId)));
    }
    if (editingEventId) {
      setEvents((current) => current.filter((event) => event.id !== editingEventId));
      setComparisons((current) => current.filter((comparison) => comparison.kind !== "derived" || comparison.targetKind !== "event" || comparison.targetId !== editingEventId));
    }
    cancelDraft();
  }

  function activateComparisonRange(id: string) {
    setComparisons((current) => current.some((comparison) => comparison.kind === "range" && comparison.id === id) || current.length >= PERIOD_PALETTE.length
      ? current
      : [...current, { kind: "range", id }]);
  }

  function createRelativeComparison(target: { kind: "event"; event: SavedEvent } | { kind: "period"; period: SavedRange }, direction: ComparisonDirection, days: number | null, replacement?: { id: string; index: number }) {
    const safeDays = days === null ? null : Math.min(3650, Math.max(1, Math.round(days)));
    const id = replacement?.id ?? crypto.randomUUID();
    const targetKind = target.kind === "event" ? "event" : "range";
    const targetId = target.kind === "event" ? target.event.id : target.period.id;
    setComparisons((current) => {
      const existingIndex = replacement ? current.findIndex((comparison) => comparison.id === replacement.id) : -1;
      const isReplacing = existingIndex >= 0;
      const targetExists = targetKind === "event"
        ? events.some((item) => item.id === targetId)
        : ranges.some((item) => item.id === targetId && (direction === "before" || !item.openEnded));
      const duplicatesExisting = current.some((comparison) => comparison.kind === "derived"
          && comparison.id !== replacement?.id
          && comparison.targetKind === targetKind
          && comparison.targetId === targetId
          && comparison.direction === direction
          && comparison.days === safeDays);
      if (!targetExists || (!isReplacing && current.length >= PERIOD_PALETTE.length)) return current;
      if (duplicatesExisting) return isReplacing ? current.filter((comparison) => comparison.id !== replacement?.id) : current;
      const next = [...current];
      if (isReplacing) next.splice(existingIndex, 1);
      const insertionIndex = isReplacing ? existingIndex : Math.min(replacement?.index ?? next.length, next.length);
      next.splice(insertionIndex, 0, { kind: "derived", id, targetKind, targetId, direction, days: safeDays });
      return next;
    });
  }

  const setDraftEventTime = useCallback((time: number) => {
    setDraftEvent((current) => ({
      ...current,
      date: formatDateInput(time),
      clock: formatTimeInput(time),
    }));
  }, []);

  const selectRange = useCallback((range: Omit<DraftRange, "label">) => {
    setDraftRange({ label: "", ...range });
    setDraftEvent({ label: "", date: "", clock: "" });
    setMode("range");
    setEditingRangeId(null);
    setEditingEventId(null);
  }, []);

  const selectEvent = useCallback((time: number) => {
    setDraftEvent({ label: "", date: "", clock: "" });
    setDraftRange(emptyDraftRange());
    setDraftEventTime(time);
    setMode("event");
    setEditingRangeId(null);
    setEditingEventId(null);
  }, [setDraftEventTime]);

  const editRange = useCallback((range: SavedRange) => {
    setDraftRange({ label: range.label, start: range.start, startTime: range.startTime, end: range.end, endTime: range.endTime, openEnded: range.openEnded });
    setDraftEvent({ label: "", date: "", clock: "" });
    setEditingRangeId(range.id);
    setEditingEventId(null);
    setMode("range");
  }, []);

  const editEvent = useCallback((event: SavedEvent) => {
    setDraftEvent({
      label: event.label,
      date: formatDateInput(event.time),
      clock: formatTimeInput(event.time),
    });
    setDraftRange(emptyDraftRange());
    setEditingEventId(event.id);
    setEditingRangeId(null);
    setMode("event");
  }, []);

  const toggleEye = useCallback((eye: Eye) => {
    setVisibleEyes((current) => ({ ...current, [eye]: !current[eye] }));
  }, []);
  const toggleTrendEye = useCallback((eye: Eye) => {
    setVisibleTrendEyes((current) => ({ ...current, [eye]: !current[eye] }));
  }, []);
  const toggleTrendSettings = useCallback(() => {
    setMode((current) => current === "trend" ? null : "trend");
    setDraftRange(emptyDraftRange());
    setDraftEvent({ label: "", date: "", clock: "" });
    setEditingRangeId(null);
    setEditingEventId(null);
    setError("");
  }, []);
  const openSessionInfo = useCallback(() => {
    setMode("sessions");
    setDraftRange(emptyDraftRange());
    setDraftEvent({ label: "", date: "", clock: "" });
    setEditingRangeId(null);
    setEditingEventId(null);
    setError("");
  }, []);
  const chartFullDomain = useMemo(() => [fullDomainStart, fullDomainEnd] as [number, number], [fullDomainEnd, fullDomainStart]);
  const chartYDomain = useMemo(() => [minimumIop, maximumIop] as [number, number], [maximumIop, minimumIop]);
  const comparisonManagerSelections = useMemo(() => comparisons.flatMap<ComparisonManagerSelection>((comparison) => {
    if (comparison.kind === "range") {
      const period = ranges.find((item) => item.id === comparison.id);
      return period ? [{ kind: "period", id: comparison.id, period }] : [];
    }
    if (comparison.targetKind === "event") {
      const event = events.find((item) => item.id === comparison.targetId);
      return event ? [{ kind: "derived", id: comparison.id, direction: comparison.direction, days: comparison.days, target: { kind: "event", event } }] : [];
    }
    const period = ranges.find((item) => item.id === comparison.targetId);
    return period ? [{ kind: "derived", id: comparison.id, direction: comparison.direction, days: comparison.days, target: { kind: "period", period } }] : [];
  }), [comparisons, events, ranges]);

  return (
    <main>
      <input ref={fileInput} hidden type="file" accept=".csv,text/csv" onClick={(event) => {
        event.currentTarget.value = "";
      }} onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) void loadFile(file);
      }} />

      {error && <div className="error-banner">{error}</div>}

      {!data ? (
        <section className="empty-state" onClick={() => fileInput.current?.click()}>
          <img className="empty-state-logo" src="/whatismyiop_mark_black.svg" alt="What Is My IOP" />
          <Button variant="primary">Choose measurements.csv</Button>
        </section>
      ) : (
        <>
          <div className={`analysis-shell ${mode ? "analysis-shell--editor-open" : ""}`}>
          <div className="analysis-main" style={{ "--chart-annotation-offset": `${chartAnnotationOffset}px` } as CSSProperties}>
          <TopNavigation
            fileName={fileName}
            measurementCount={measurements.length}
            onClearData={clearStoredData}
            onChooseFile={() => fileInput.current?.click()}
          />

          <ComparisonManager
            periods={ranges}
            events={events}
            selections={comparisonManagerSelections}
            colors={PERIOD_PALETTE.map((color) => color.stroke)}
            onSelectPeriod={activateComparisonRange}
            onRemoveSelection={(id) => setComparisons((current) => current.filter((comparison) => comparison.id !== id))}
            onCreateRelativeComparison={createRelativeComparison}
          />

          <MeasurementsChart
            measurements={measurements}
            visibleEyes={visibleEyes}
            onToggleEye={toggleEye}
            trendMode={trendMode}
            visibleTrendEyes={visibleTrendEyes}
            onOpenTrendSettings={toggleTrendSettings}
            onOpenSessionInfo={openSessionInfo}
            ranges={ranges}
            events={events}
            mode={mode}
            onSelectRange={selectRange}
            onSelectEvent={selectEvent}
            onEditRange={editRange}
            onEditEvent={editEvent}
            onCancelEdit={cancelDraft}
            draftRange={chartDraftRange}
            draftRangeLabel={draftRange.label}
            setDraftRange={setDraftRange}
            draftEventLabel={draftEvent.label}
            onDraftEventLabel={(label) => setDraftEvent((value) => ({ ...value, label }))}
            draftEventTime={eventTimestamp(chartDraftEvent)}
            onDraftEventTime={setDraftEventTime}
            today={today}
            presentTime={now}
            fullDomain={chartFullDomain}
            yDomain={chartYDomain}
            onAnnotationTopOffsetChange={setChartAnnotationOffset}
          />

          <section className="comparison-workspace">
            <section className="diurnal-section">
              <div className="diurnal-chart">
              {diurnalPoints.length > 0 ? <ResponsiveContainer width="100%" height="100%">
                <ScatterChart data={diurnalPoints} margin={{ top: 16, right: 20, bottom: 20, left: 0 }}>
                  <CartesianGrid stroke="var(--line)" vertical={false} />
                  {Array.from({ length: 8 }, (_, bin) => bin % 2 === 1 && (
                    <ReferenceArea key={bin} x1={bin * 180} x2={(bin + 1) * 180} fill="#e8ecee" fillOpacity={0.72} stroke="none" />
                  ))}
                  <XAxis
                    type="number"
                    dataKey="minuteOfDay"
                    domain={[0, 1440]}
                    ticks={Array.from({ length: 8 }, (_, bin) => bin * 180 + 90)}
                    tickFormatter={diurnalTickLabel}
                    minTickGap={18}
                    tick={{ fill: "var(--muted)", fontSize: 11 }}
                  />
                  <YAxis width={52} type="number" dataKey="mean" domain={["dataMin - 2", "dataMax + 2"]} allowDecimals={false} tick={{ fill: "var(--muted)", fontSize: 12 }} label={{ value: "mmHg", angle: -90, position: "insideLeft", fill: "var(--muted)" }} />
                  <Tooltip content={<DiurnalTooltip />} />
                  {diurnalSeries.map((series) => (
                    <Scatter key={series.id} name={series.name} data={series.data} fill={series.color} line={{ stroke: series.color, strokeWidth: 2 }} shape="circle">
                      <ErrorBar dataKey="sd" width={8} stroke={series.color} strokeWidth={1.5} direction="y" />
                    </Scatter>
                  ))}
                </ScatterChart>
              </ResponsiveContainer> : <div className="diurnal-chart__empty">
                <span>{comparisonRanges.length ? `No ${diurnalEye === "OD" ? "right" : "left"}-eye readings in the selected periods` : "Add a period to view its daily pattern"}</span>
                <small>{comparisonRanges.length ? "Choose another eye or add a period containing measurements." : "Use the comparison search to select a saved period or a window around an annotation or period boundary."}</small>
              </div>}
              </div>
              <footer className="diurnal-controls">
                <SegmentedControl label="Eye shown in diurnal chart" value={diurnalEye} options={["OD", "OS"] as const} optionLabel={(eye) => eye === "OD" ? "Right" : "Left"} onChange={setDiurnalEye} />
              </footer>
            </section>
          </section>
          </div>

          <ChartEditor
            mode={mode}
            draftRangeLabel={draftRange.label}
            draftEventLabel={draftEvent.label}
            isEditing={Boolean(editingRangeId || editingEventId)}
            trendMode={trendMode}
            visibleTrendEyes={visibleTrendEyes}
            onSaveRange={addRange}
            onSaveEvent={addEvent}
            onDelete={deleteDraft}
            onCancel={cancelDraft}
            onToggleTrendEye={toggleTrendEye}
            onTrendModeChange={setTrendMode}
            onOpenSessionInfo={openSessionInfo}
          />
          </div>
        </>
      )}
    </main>
  );
}

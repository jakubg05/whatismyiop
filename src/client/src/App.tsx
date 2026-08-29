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
import { ComparisonExpressionEditor } from "./ComparisonExpressionEditor";
import { useComparisonExpression } from "./ComparisonExpressionState";
import {
  binDiurnalSessions,
  comparisonLabelError,
  parseComparisonExpression,
  resolveComparisonSegments,
  type ComparisonCatalog,
  type DiurnalPoint,
} from "./comparison";
import { ChartEditor, MeasurementsChart, normalizeRangeEdges, type ChartMode, type DraftRange, type TrendMode } from "./main-chart";
import { periodPalette } from "./periodPalette";
import { TopNavigation } from "./TopNavigation";
import { Button, SegmentedControl } from "./shared";

type SavedRange = DraftRange & { id: string };

type SavedEvent = {
  id: string;
  label: string;
  time: number;
};

type PersistedState = {
  version: 1;
  fileName: string;
  csvText: string;
  ranges: SavedRange[];
  events: SavedEvent[];
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
  const { expression, setExpression, clearExpression } = useComparisonExpression();
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
  const [events, setEvents] = useState<SavedEvent[]>([]);
  const [toasts, setToasts] = useState<Array<{ id: string; message: string }>>([]);
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
  const comparisonCatalog = useMemo<ComparisonCatalog>(() => ({ periods: ranges, events }), [events, ranges]);
  const comparisonExpression = useMemo(() => parseComparisonExpression(expression, comparisonCatalog), [comparisonCatalog, expression]);
  const comparisonRanges = useMemo(
    () => resolveComparisonSegments(comparisonExpression.segments, comparisonCatalog, fullDomainStart, fullDomainEnd, now),
    [comparisonCatalog, comparisonExpression.segments, fullDomainEnd, fullDomainStart, now],
  );
  const comparisonMode = comparisonExpression.segments.length > 0;
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
    if (!comparisonMode || (mode !== "range" && mode !== "event")) return;
    setMode(null);
    setEditingRangeId(null);
    setEditingEventId(null);
    setDraftRange(emptyDraftRange());
    setDraftEvent({ label: "", date: "", clock: "" });
  }, [comparisonMode, mode]);

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
      setEvents(state.events.filter((event, index, all) => event
        && typeof event.id === "string"
        && typeof event.label === "string"
        && event.label.trim().length > 0
        && typeof event.time === "number"
        && Number.isFinite(event.time)
        && all.findIndex((candidate) => candidate?.id === event.id) === index));
      setRanges(state.ranges.map((range) => ({
        ...range,
        startTime: typeof range.startTime === "string" ? range.startTime : "00:00",
        end: range.openEnded ? "" : range.end,
        endTime: range.openEnded ? "" : typeof range.endTime === "string" ? range.endTime : "23:59",
      })));
    } catch {
      setError("Saved browser data could not be restored.");
    }
  }, []);

  useEffect(() => {
    if (!rawCsv || !data) return;
    const state: PersistedState = { version: 1, fileName, csvText: rawCsv, ranges, events };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      setError("The browser could not save this data locally.");
    }
  }, [data, events, fileName, ranges, rawCsv]);

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
      setEvents([]);
      clearExpression();
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
    setEvents([]);
    clearExpression();
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
    const label = orderedRange.label.trim();
    const labelError = comparisonLabelError(label, "period", comparisonCatalog, editingRangeId ?? undefined);
    if (labelError) {
      setError(labelError);
      return;
    }
    const saved = {
      ...orderedRange,
      end: orderedRange.openEnded ? "" : effectiveEnd,
      endTime: orderedRange.openEnded ? "" : effectiveEndTime,
      label,
    };
    if (editingRangeId) {
      setRanges((current) => current.map((range) => range.id === editingRangeId ? { ...saved, id: range.id } : range));
    } else {
      const id = crypto.randomUUID();
      setRanges((current) => [...current, { ...saved, id }]);
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
    const labelError = comparisonLabelError(label, "event", comparisonCatalog, editingEventId ?? undefined);
    if (labelError) {
      setError(labelError);
      return;
    }
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
    }
    if (editingEventId) {
      setEvents((current) => current.filter((event) => event.id !== editingEventId));
    }
    cancelDraft();
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
  const showComparisonBlockedToast = useCallback(() => {
    const id = crypto.randomUUID();
    setToasts((current) => [...current, { id, message: "Clear the search expressions before creating or editing periods and events." }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 5_000);
  }, []);

  return (
    <main>
      <input ref={fileInput} hidden type="file" accept=".csv,text/csv" onClick={(event) => {
        event.currentTarget.value = "";
      }} onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) void loadFile(file);
      }} />

      {error && <div className="error-banner">{error}</div>}
      <div className="toast-stack" aria-live="polite" aria-label="Notifications">
        {toasts.map((toast) => <div key={toast.id} className="warning-toast" role="status">
          <span>{toast.message}</span>
          <button type="button" aria-label="Dismiss notification" onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}>×</button>
        </div>)}
      </div>

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

          <ComparisonExpressionEditor catalog={comparisonCatalog} value={expression} onChange={setExpression} />

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
            comparisonRanges={comparisonRanges}
            comparisonMode={comparisonMode}
            onComparisonBlocked={showComparisonBlockedToast}
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
                <span>{comparisonMode ? "No readings" : "Add a comparison segment to view its daily pattern"}</span>
                <small>{comparisonMode ? `No ${diurnalEye === "OD" ? "right" : "left"}-eye sessions fall inside the active comparison segments.` : "Use the comparison expression to select a saved period or a window around an annotation or period boundary."}</small>
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

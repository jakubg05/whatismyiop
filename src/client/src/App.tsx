import { Link } from "@tanstack/react-router";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import {
  formatDateInput,
  formatTimeInput,
  coalesceMeasurementSessions,
  dateTimeBoundary,
  parseMeasurementsCsv,
  type Eye,
  type ParseResult,
} from "./analysis";
import { ComparisonExpressionEditor, type ComparisonValuePreview } from "./ComparisonExpressionEditor";
import { useComparisonExpression } from "./ComparisonExpressionState";
import {
  binDiurnalSessions,
  comparisonLabelError,
  NOW_COMPARISON_EVENT_ID,
  parseComparisonExpression,
  resolveComparisonSegments,
  type ComparisonCatalog,
} from "./comparison";
import { DiurnalChart } from "./DiurnalChart";
import { ImportActions } from "./ImportActions";
import { ChartEditor, MeasurementsChart, normalizeRangeEdges, type ChartAnnotationPreview, type ChartMode, type DraftRange, type TimeDomain } from "./main-chart";
import { periodPalette } from "./periodPalette";
import { SiteFooter } from "./SiteFooter";
import { TopNavigation } from "./TopNavigation";

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

const STORAGE_KEY = "whatismyiop:v1";
const EMPTY_MEASUREMENTS_CSV = "Date / Time;IOP (OD);IOP (OS)\n";

function emptyDraftRange(): DraftRange {
  return { label: "", start: "", startTime: "00:00", end: "", endTime: "23:59", openEnded: false };
}

function wallClockTimestamp(time = Date.now()): number {
  const date = new Date(time);
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds());
}

export default function App() {
  const fileInput = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const { expression, setExpression, clearExpression } = useComparisonExpression();
  const [data, setData] = useState<ParseResult | null>(null);
  const [fileName, setFileName] = useState("");
  const [rawCsv, setRawCsv] = useState("");
  const [error, setError] = useState("");
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [visibleEyes, setVisibleEyes] = useState<Record<Eye, boolean>>({ OD: true, OS: true });
  const [diurnalEye, setDiurnalEye] = useState<Eye>("OD");
  const [mode, setMode] = useState<ChartMode>(null);
  const [now, setNow] = useState(() => wallClockTimestamp());
  const [ranges, setRanges] = useState<SavedRange[]>([]);
  const [events, setEvents] = useState<SavedEvent[]>([]);
  const [comparisonValuePreview, setComparisonValuePreview] = useState<ComparisonValuePreview | null>(null);
  const [toasts, setToasts] = useState<Array<{ id: string; message: string }>>([]);
  const toastIds = useRef(new Set<string>());
  const [toastDismissalCount, setToastDismissalCount] = useState(0);
  const [draftRange, setDraftRange] = useState<DraftRange>(emptyDraftRange);
  const [draftEvent, setDraftEvent] = useState({ label: "", date: "", clock: "" });
  const [editingRangeId, setEditingRangeId] = useState<string | null>(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const chartDraftRange = draftRange;
  const chartDraftEvent = useDeferredValue(draftEvent);

  const workspaceActive = data !== null;
  const measurements = data?.measurements ?? [];
  const measurementSessions = useMemo(() => coalesceMeasurementSessions(measurements), [measurements]);
  const fullDomainStart = measurements[0]?.time ?? now - 30 * 86_400_000;
  const fullDomainEnd = measurements.at(-1)?.time ?? now;
  const chartFullDomain = useMemo<TimeDomain>(() => [fullDomainStart, fullDomainEnd], [fullDomainEnd, fullDomainStart]);
  const [chartDomain, setChartDomain] = useState<TimeDomain>(chartFullDomain);
  const [minimumIop, maximumIop] = useMemo(() => {
    let minimum = Number.POSITIVE_INFINITY;
    let maximum = Number.NEGATIVE_INFINITY;
    for (const measurement of measurements) {
      minimum = Math.min(minimum, measurement.iop);
      maximum = Math.max(maximum, measurement.iop);
    }
    return Number.isFinite(minimum) ? [Math.floor(minimum - 2), Math.ceil(maximum + 2)] : [5, 35];
  }, [measurements]);
  const today = formatDateInput(now);
  const currentTime = formatTimeInput(now);
  const comparisonCatalog = useMemo<ComparisonCatalog>(() => ({ periods: ranges, events, now }), [events, now, ranges]);
  const comparisonExpression = useMemo(() => parseComparisonExpression(expression, comparisonCatalog), [comparisonCatalog, expression]);
  const comparisonRanges = useMemo(
    () => resolveComparisonSegments(comparisonExpression.segments, comparisonCatalog, fullDomainStart, fullDomainEnd, now),
    [comparisonCatalog, comparisonExpression.segments, fullDomainEnd, fullDomainStart, now],
  );
  const comparisonMode = comparisonExpression.segments.length > 0;
  const chartAnnotationPreview = useMemo<ChartAnnotationPreview | null>(() => {
    if (comparisonValuePreview?.kind === "period") {
      const paletteIndex = ranges.findIndex((item) => item.label === comparisonValuePreview.label);
      return paletteIndex >= 0 ? { kind: "range", value: ranges[paletteIndex], paletteIndex } : null;
    }
    if (comparisonValuePreview?.kind === "event") {
      if (comparisonValuePreview.label === "now") {
        return {
          kind: "event",
          value: { id: NOW_COMPARISON_EVENT_ID, label: "now", time: now },
          paletteIndex: events.length,
        };
      }
      const paletteIndex = events.findIndex((item) => item.label === comparisonValuePreview.label);
      return paletteIndex >= 0 ? { kind: "event", value: events[paletteIndex], paletteIndex } : null;
    }
    return null;
  }, [comparisonValuePreview, events, now, ranges]);
  const diurnalSeries = useMemo(() => comparisonRanges.map((range) => {
    const effectiveEnd = range.openEnded ? today : range.end;
    const effectiveEndTime = range.openEnded ? currentTime : range.endTime;
    const comparisonIndex = comparisonRanges.findIndex((item) => item.id === range.id);
    return {
      id: range.id,
      name: range.label,
      color: periodPalette(comparisonIndex).stroke,
      data: binDiurnalSessions(measurementSessions, diurnalEye, range, effectiveEnd, effectiveEndTime, range.openEnded ? now : undefined),
    };
  }), [comparisonRanges, currentTime, diurnalEye, measurementSessions, now, today]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(wallClockTimestamp()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setChartDomain(chartFullDomain);
  }, [chartFullDomain, data]);

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
      if (data?.measurements.length !== 0) {
        setRanges([]);
        setEvents([]);
      }
      clearExpression();
      setEditingRangeId(null);
      setEditingEventId(null);
      setMode(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not read this CSV file.");
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

  function continueWithoutMeasurements() {
    setRawCsv(EMPTY_MEASUREMENTS_CSV);
    setData(parseMeasurementsCsv(EMPTY_MEASUREMENTS_CSV));
    setFileName("Treatment history");
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
    const label = orderedRange.label;
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
    const label = draftEvent.label;
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

  function handleDragEnter(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    dragDepth.current += 1;
    setIsDraggingFile(true);
  }

  function handleDragOver(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleDragLeave(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setIsDraggingFile(false);
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    dragDepth.current = 0;
    setIsDraggingFile(false);
    const file = event.dataTransfer.files[0];
    if (file) void loadFile(file);
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
  const openTrendInfo = useCallback(() => {
    setMode("trend");
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
  const openHeatmapInfo = useCallback(() => {
    setMode("heatmap");
    setDraftRange(emptyDraftRange());
    setDraftEvent({ label: "", date: "", clock: "" });
    setEditingRangeId(null);
    setEditingEventId(null);
    setError("");
  }, []);
  const chartYDomain = useMemo(() => [minimumIop, maximumIop] as [number, number], [maximumIop, minimumIop]);
  const dismissToast = useCallback((id: string) => {
    if (!toastIds.current.delete(id)) return;
    setToasts((current) => current.filter((toast) => toast.id !== id));
    setToastDismissalCount((count) => count + 1);
  }, []);
  const showComparisonBlockedToast = useCallback(() => {
    const id = crypto.randomUUID();
    const message = "Clear the search expressions before creating or editing periods and events.";
    toastIds.current.add(id);
    setToasts((current) => [...current, { id, message }]);
    window.setTimeout(() => dismissToast(id), 5_000);
  }, [dismissToast]);

  return (
    <main>
      <input ref={fileInput} hidden type="file" accept=".csv,text/csv" onClick={(event) => {
        event.currentTarget.value = "";
      }} onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) void loadFile(file);
      }} />

      {error && <div className="error-banner">{error}</div>}
      <div className="toast-stack" aria-label="Notifications">
        {toasts.map((toast) => <div key={toast.id} className="warning-toast" role="status">
          <span>{toast.message}</span>
          <button type="button" aria-label="Dismiss notification" onClick={() => dismissToast(toast.id)}>×</button>
        </div>)}
      </div>
      <span className="visually-hidden" aria-live="polite">{toastDismissalCount > 0 && <span key={toastDismissalCount}>Notification dismissed.</span>}</span>

      <div className={`analysis-shell ${mode ? "analysis-shell--editor-open" : ""}`}>
          <div className="analysis-main">
          <TopNavigation />

          {!workspaceActive && <section
            className={`import-dropzone${isDraggingFile ? " import-dropzone--dragging" : ""}`}
            aria-label="Import IOP measurements"
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <svg className="import-dropzone__outline" aria-hidden="true">
              <rect
                x="1"
                y="1"
                width="calc(100% - 2px)"
                height="calc(100% - 2px)"
                rx="13"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            <ImportActions
              onChooseFile={() => fileInput.current?.click()}
              onContinueWithoutMeasurements={continueWithoutMeasurements}
            />
            <div className="import-dropzone__facts" aria-label="Import details">
              <span>Currently supports iCare HOME2 CSV exports</span>
              <span aria-hidden="true">·</span>
              <a
                href="https://github.com/jakubg05/whatismyiop"
                target="_blank"
                rel="noreferrer"
                aria-label="View source on GitHub"
              >
                <svg className="import-dropzone__github" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.75a9.5 9.5 0 0 0-3 18.51c.48.09.65-.2.65-.46v-1.67c-2.67.58-3.23-1.13-3.23-1.13-.44-1.1-1.07-1.4-1.07-1.4-.87-.6.07-.58.07-.58.96.07 1.47.99 1.47.99.86 1.47 2.25 1.05 2.8.8.09-.62.34-1.05.61-1.29-2.13-.24-4.37-1.07-4.37-4.7 0-1.04.37-1.89.99-2.55-.1-.24-.43-1.21.09-2.52 0 0 .8-.26 2.61.97A9.1 9.1 0 0 1 12 7.42a9 9 0 0 1 2.38.32c1.81-1.23 2.61-.97 2.61-.97.52 1.31.19 2.28.09 2.52.62.66.99 1.51.99 2.55 0 3.64-2.24 4.45-4.38 4.69.35.3.65.88.65 1.77v2.5c0 .26.18.56.66.46A9.5 9.5 0 0 0 12 2.75Z" /></svg>
                <span>Source on GitHub</span>
              </a>
            </div>
            <p className="import-dropzone__notice">
              Your file is saved in this browser until you clear it. This tool does not diagnose conditions or recommend treatment. <Link to="/policy">Privacy</Link> · <Link to="/disclaimer">Medical disclaimer</Link>
            </p>
          </section>}

          {!workspaceActive && <section className="import-explainer" aria-labelledby="import-explainer-title">
            <h2 id="import-explainer-title">What this tool does</h2>
            <p>A home tonometer CSV contains many readings that are hard to follow in a spreadsheet. This tool puts them on a chart as individual readings or groups them into sessions. You can filter by body position and measurement quality, add a trend line, and use the heatmap to see pressure patterns and which times of day have fewer measurements.</p>
            <p>Periods let you show ongoing treatments on the chart, while events mark one-time changes or procedures. Use them to compare parts of your history or see what happened before and after a change. If you change eye-care professionals, you have a chronological record of treatment alongside the pressure history.</p>
          </section>}

          {workspaceActive && <div className="comparison-overlay">
            <ComparisonExpressionEditor
              catalog={comparisonCatalog}
              value={expression}
              onChange={setExpression}
              onPreviewChange={setComparisonValuePreview}
            />
          </div>}

          <MeasurementsChart
            measurements={measurements}
            visibleEyes={visibleEyes}
            onToggleEye={toggleEye}
            onOpenTrendInfo={openTrendInfo}
            onOpenSessionInfo={openSessionInfo}
            onOpenHeatmapInfo={openHeatmapInfo}
            ranges={ranges}
            events={events}
            comparisonRanges={comparisonRanges}
            comparisonMode={comparisonMode}
            annotationPreview={chartAnnotationPreview}
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
            domain={chartDomain}
            onDomainChange={setChartDomain}
            fullDomain={chartFullDomain}
            yDomain={chartYDomain}
          />

          <section className="comparison-workspace">
            <section className="diurnal-section">
              <DiurnalChart
                series={diurnalSeries}
                eye={diurnalEye}
                onEyeChange={setDiurnalEye}
                inactive={!workspaceActive ? {
                  title: "Import measurements to view diurnal patterns.",
                  description: "The diurnal chart will summarize readings by time of day.",
                } : !comparisonMode ? {
                  title: "Add a comparison segment to view diurnal patterns.",
                  description: "You can create comparison segments using the search box at the top of the screen.",
                } : undefined}
              />
            </section>
          </section>

          <SiteFooter
            variant="full"
            fileName={fileName}
            measurementCount={measurements.length}
            onChooseFile={() => fileInput.current?.click()}
            onClearData={clearStoredData}
          />
          </div>

          <ChartEditor
            mode={mode}
            draftRangeLabel={draftRange.label}
            draftEventLabel={draftEvent.label}
            isEditing={Boolean(editingRangeId || editingEventId)}
            onSaveRange={addRange}
            onSaveEvent={addEvent}
            onDelete={deleteDraft}
            onCancel={cancelDraft}
            onOpenSessionInfo={openSessionInfo}
          />
      </div>
    </main>
  );
}

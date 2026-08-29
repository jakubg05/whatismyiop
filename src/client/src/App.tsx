import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  ErrorBar,
  Legend,
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
  inDateRange,
  dateTimeBoundary,
  parseMeasurementsCsv,
  summarize,
  type Eye,
  type Measurement,
  type ParseResult,
  type Summary,
} from "./analysis";
import { ChartEditor, MeasurementsChart, normalizeRangeEdges, type ChartMode, type DraftRange, type TrendMode } from "./main-chart";
import { TopNavigation } from "./TopNavigation";
import { Button, SectionHeading, SegmentedControl } from "./shared";

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

type DateRange = { start: string; startTime: string; end: string; endTime: string };

type DiurnalPoint = {
  bin: number;
  minuteOfDay: number;
  mean: number;
  sd: number;
  count: number;
  periodLabel: string;
  eye: Eye;
};

const PERIOD_COLORS = ["#346f9c", "#b47722", "#6b5595", "#43815d", "#a55252", "#477d88"];
const STORAGE_KEY = "icare-analytics:v1";

function emptyDraftRange(): DraftRange {
  return { label: "", start: "", startTime: "00:00", end: "", endTime: "23:59", openEnded: false };
}

function eyeLabel(eye: Eye): string {
  return eye === "OD" ? "Right eye" : "Left eye";
}

function displayDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : "";
}

function oneDecimal(value: number | null): string {
  return value === null ? "–" : value.toFixed(1);
}

function diurnalBinLabel(bin: number): string {
  const startHour = bin * 3;
  const endHour = startHour + 2;
  return `${String(startHour).padStart(2, "0")}:00–${String(endHour).padStart(2, "0")}:59`;
}

function binDiurnalMeasurements(measurements: Measurement[], eye: Eye, range: SavedRange, effectiveEnd: string, effectiveEndTime: string): DiurnalPoint[] {
  const buckets = Array.from({ length: 8 }, () => [] as number[]);
  measurements
    .filter((measurement) => measurement.eye === eye && inDateRange(measurement, range.start, effectiveEnd, range.startTime, effectiveEndTime))
    .forEach((measurement) => {
      const hour = Number(measurement.timestampText.slice(11, 13));
      const minute = Number(measurement.timestampText.slice(14, 16));
      const second = Number(measurement.timestampText.slice(17, 19));
      const bin = Math.min(7, Math.floor((hour * 60 + minute + second / 60) / 180));
      buckets[bin].push(measurement.iop);
    });

  return buckets.flatMap((values, bin) => {
    if (values.length === 0) return [];
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.length > 1
      ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1)
      : 0;
    return [{
      bin,
      minuteOfDay: bin * 180 + 90,
      mean,
      sd: Math.sqrt(variance),
      count: values.length,
      periodLabel: range.label,
      eye,
    }];
  });
}

function SummaryCard({ title, range, measurements, endLabel }: {
  title: string;
  range: DateRange;
  measurements: Measurement[];
  endLabel?: string;
}) {
  const selected = useMemo(
    () => measurements.filter((measurement) => inDateRange(measurement, range.start, range.end, range.startTime, range.endTime)),
    [measurements, range],
  );
  const summaries = useMemo(() => ({
    OD: summarize(selected.filter((measurement) => measurement.eye === "OD")),
    OS: summarize(selected.filter((measurement) => measurement.eye === "OS")),
  }), [selected]);

  const metric = (eye: Eye, summary: Summary) => (
    <div className="eye-summary" key={eye}>
      <div className="eye-summary__title">
        <span className={`dot dot--${eye.toLowerCase()}`} />
        {eyeLabel(eye)}
      </div>
      <div className="big-number">{oneDecimal(summary.median)}</div>
      <div className="big-label">median mmHg</div>
      <dl>
        <div><dt>Mean</dt><dd>{oneDecimal(summary.mean)}</dd></div>
        <div><dt>Range</dt><dd>{summary.min ?? "–"}–{summary.max ?? "–"}</dd></div>
        <div><dt>Readings</dt><dd>{summary.count}</dd></div>
      </dl>
    </div>
  );

  return (
    <section className="summary-card">
      <div className="summary-card__heading">
        <span>{title}</span>
        <span>{range.start && range.end ? `${displayDate(range.start)} – ${endLabel ?? displayDate(range.end)}` : "DD.MM.YYYY"}</span>
      </div>
      <div className="summary-grid">
        {metric("OD", summaries.OD)}
        {metric("OS", summaries.OS)}
      </div>
    </section>
  );
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
      <span>n: {point.count}</span>
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
  const [mode, setMode] = useState<ChartMode>(null);
  const [now, setNow] = useState(Date.now());
  const [ranges, setRanges] = useState<SavedRange[]>([]);
  const [events, setEvents] = useState<SavedEvent[]>([]);
  const [draftRange, setDraftRange] = useState<DraftRange>(emptyDraftRange);
  const [draftEvent, setDraftEvent] = useState({ label: "", date: "", clock: "" });
  const [editingRangeId, setEditingRangeId] = useState<string | null>(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const chartDraftRange = draftRange;
  const chartDraftEvent = useDeferredValue(draftEvent);

  const measurements = data?.measurements ?? [];
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
  const diurnalSeries = useMemo(() => ranges.map((range, rangeIndex) => {
    const effectiveEnd = range.openEnded ? today : range.end;
    const effectiveEndTime = range.openEnded ? currentTime : range.endTime;
    return {
      id: range.id,
      name: range.label,
      color: PERIOD_COLORS[rangeIndex % PERIOD_COLORS.length],
      data: binDiurnalMeasurements(measurements, diurnalEye, range, effectiveEnd, effectiveEndTime),
    };
  }), [currentTime, diurnalEye, measurements, ranges, today]);
  const diurnalPoints = useMemo(() => diurnalSeries.flatMap((series) => series.data), [diurnalSeries]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
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
      setRanges(state.ranges.map((range) => ({
        ...range,
        startTime: typeof range.startTime === "string" ? range.startTime : "00:00",
        end: range.openEnded ? "" : range.end,
        endTime: range.openEnded ? "" : typeof range.endTime === "string" ? range.endTime : "23:59",
      })));
      setEvents(state.events);
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
    setRanges((current) => editingRangeId
      ? current.map((range) => range.id === editingRangeId ? { ...saved, id: range.id } : range)
      : [...current, { ...saved, id: crypto.randomUUID() }]);
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
    setEvents((current) => editingEventId
      ? current.map((event) => event.id === editingEventId ? { ...event, label: draftEvent.label.trim(), time } : event)
      : [...current, { id: crypto.randomUUID(), label: draftEvent.label.trim(), time }]);
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
    if (editingRangeId) setRanges((current) => current.filter((range) => range.id !== editingRangeId));
    if (editingEventId) setEvents((current) => current.filter((event) => event.id !== editingEventId));
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
          <div className="analysis-main">
          <TopNavigation
            fileName={fileName}
            measurementCount={measurements.length}
            onClearData={clearStoredData}
            onChooseFile={() => fileInput.current?.click()}
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
          />

          {ranges.length > 0 && <section className="work-grid">
            <div className="panel controls-panel">
              <SectionHeading eyebrow="Periods" title="Comparison" />
              <div className="comparisons">
                {ranges.map((range) => <SummaryCard key={range.id} title={range.label} range={{
                  start: range.start,
                  startTime: range.startTime,
                  end: range.openEnded ? today : range.end,
                  endTime: range.openEnded ? currentTime : range.endTime,
                }} endLabel={range.openEnded ? "Present" : undefined} measurements={measurements} />)}
              </div>
            </div>
          </section>}

          {ranges.length > 0 && <section className="diurnal-section">
            <SectionHeading
              eyebrow="Periods"
              title="Diurnal pattern"
              actions={<SegmentedControl label="Eye shown in diurnal chart" value={diurnalEye} options={["OD", "OS"] as const} optionLabel={(eye) => eye === "OD" ? "Right" : "Left"} onChange={setDiurnalEye} />}
            />
            <div className="diurnal-chart">
            <ResponsiveContainer width="100%" height="100%">
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
                  tickFormatter={(value) => diurnalBinLabel(Math.floor(value / 180))}
                  tick={{ fill: "var(--muted)", fontSize: 11 }}
                />
                <YAxis width={52} type="number" dataKey="mean" domain={["dataMin - 2", "dataMax + 2"]} allowDecimals={false} tick={{ fill: "var(--muted)", fontSize: 12 }} label={{ value: "mmHg", angle: -90, position: "insideLeft", fill: "var(--muted)" }} />
                <Tooltip content={<DiurnalTooltip />} />
                <Legend height={34} verticalAlign="top" align="right" />
                {diurnalSeries.map((series) => (
                  <Scatter
                    key={series.id}
                    name={series.name}
                    data={series.data}
                    fill={series.color}
                    line={{ stroke: series.color, strokeWidth: 2 }}
                    shape="circle"
                  >
                    <ErrorBar dataKey="sd" width={8} stroke={series.color} strokeWidth={1.5} direction="y" />
                  </Scatter>
                ))}
              </ScatterChart>
            </ResponsiveContainer>
            </div>
          </section>}
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

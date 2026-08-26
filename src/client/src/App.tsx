import { useEffect, useMemo, useRef, useState } from "react";
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
  formatFullTime,
  inDateRange,
  dateBoundary,
  parseMeasurementsCsv,
  summarize,
  type Eye,
  type Measurement,
  type ParseResult,
  type Summary,
} from "./analysis";
import type { TimeDomain } from "./chartNavigation";
import { MeasurementsChart, type ChartMode, type DraftRange } from "./MeasurementsChart";

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

type DateRange = { start: string; end: string };

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

function eyeLabel(eye: Eye): string {
  return eye === "OD" ? "Right eye" : "Left eye";
}

function displayDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : "";
}

function parseDisplayDate(value: string): string | null {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);
  if (!match) return null;
  const [, day, month, year] = match.map(Number);
  const time = Date.UTC(year, month - 1, day);
  const check = new Date(time);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) return null;
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function DateTextInput({ label, value, onChange, disabled = false }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(displayDate(value));

  useEffect(() => setDraft(displayDate(value)), [value]);

  function update(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, 8);
    const formatted = digits.length <= 2
      ? digits
      : digits.length <= 4
        ? `${digits.slice(0, 2)}.${digits.slice(2)}`
        : `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
    setDraft(formatted);
    const parsed = parseDisplayDate(formatted);
    if (parsed) onChange(parsed);
  }

  return (
    <label>{label}
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        maxLength={10}
        placeholder="DD.MM.YYYY"
        disabled={disabled}
        value={draft}
        onChange={(event) => update(event.target.value)}
        onBlur={() => setDraft(displayDate(value))}
      />
    </label>
  );
}

function oneDecimal(value: number | null): string {
  return value === null ? "–" : value.toFixed(1);
}

function diurnalBinLabel(bin: number): string {
  const startHour = bin * 3;
  const endHour = startHour + 2;
  return `${String(startHour).padStart(2, "0")}:00–${String(endHour).padStart(2, "0")}:59`;
}

function binDiurnalMeasurements(measurements: Measurement[], eye: Eye, range: SavedRange, effectiveEnd: string): DiurnalPoint[] {
  const buckets = Array.from({ length: 8 }, () => [] as number[]);
  measurements
    .filter((measurement) => measurement.eye === eye && inDateRange(measurement, range.start, effectiveEnd))
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
    () => measurements.filter((measurement) => inDateRange(measurement, range.start, range.end)),
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
    <div className="chart-tooltip">
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
  const [diurnalEye, setDiurnalEye] = useState<Eye>("OD");
  const [mode, setMode] = useState<ChartMode>(null);
  const [now, setNow] = useState(Date.now());
  const [ranges, setRanges] = useState<SavedRange[]>([]);
  const [events, setEvents] = useState<SavedEvent[]>([]);
  const [draftRange, setDraftRange] = useState<DraftRange>({ label: "", start: "", end: "", openEnded: false });
  const [draftEvent, setDraftEvent] = useState({ label: "", date: "", clock: "" });
  const [viewDomain, setViewDomain] = useState<TimeDomain | null>(null);

  const measurements = data?.measurements ?? [];
  const firstDate = measurements[0]?.timestampText.slice(0, 10) ?? "";
  const lastDate = measurements.at(-1)?.timestampText.slice(0, 10) ?? "";
  const fullDomainStart = measurements[0]?.time ?? 0;
  const fullDomainEnd = measurements.at(-1)?.time ?? 0;
  const domainStart = viewDomain?.[0] ?? fullDomainStart;
  const domainEnd = viewDomain?.[1] ?? fullDomainEnd;
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
  const diurnalSeries = useMemo(() => ranges.map((range, rangeIndex) => {
    const effectiveEnd = range.openEnded ? today : range.end;
    return {
      id: range.id,
      name: range.label,
      color: PERIOD_COLORS[rangeIndex % PERIOD_COLORS.length],
      data: binDiurnalMeasurements(measurements, diurnalEye, range, effectiveEnd),
    };
  }), [diurnalEye, measurements, ranges, today]);
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
      setRanges(state.ranges);
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
      setMode(null);
      setViewDomain(null);
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
    setMode(null);
    setViewDomain(null);
    setError("");
  }

  function addRange() {
    const effectiveEnd = draftRange.openEnded ? today : draftRange.end;
    if (!draftRange.label.trim() || !draftRange.start || !effectiveEnd) return;
    if (draftRange.start > effectiveEnd) {
      setError("Range start must be on or before its end date.");
      return;
    }
    setRanges((current) => [...current, { ...draftRange, end: effectiveEnd, label: draftRange.label.trim(), id: crypto.randomUUID() }]);
    setDraftRange({ label: "", start: "", end: "", openEnded: false });
    setMode(null);
    setError("");
  }

  function eventTimestamp(): number | null {
    const date = dateBoundary(draftEvent.date);
    const clock = /^(\d{2}):(\d{2})$/.exec(draftEvent.clock);
    if (date === null || !clock) return null;
    const hour = Number(clock[1]);
    const minute = Number(clock[2]);
    if (hour > 23 || minute > 59) return null;
    return date + hour * 3_600_000 + minute * 60_000;
  }

  function addEvent() {
    const time = eventTimestamp();
    if (!draftEvent.label.trim() || time === null) return;
    setEvents((current) => [...current, { id: crypto.randomUUID(), label: draftEvent.label.trim(), time }]);
    setDraftEvent({ label: "", date: "", clock: "" });
    setMode(null);
  }

  function setDraftEventTime(time: number) {
    const date = new Date(time);
    setDraftEvent((current) => ({
      ...current,
      date: formatDateInput(time),
      clock: `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`,
    }));
  }

  function beginRange() {
    setDraftRange({ label: "", start: "", end: "", openEnded: false });
    setMode("range");
  }

  function beginEvent() {
    setDraftEvent({ label: "", date: "", clock: "" });
    setMode("event");
  }

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
          <button>Choose measurements.csv</button>
        </section>
      ) : (
        <>
          <div className="file-actions">
            <button className="clear-button" onClick={clearStoredData}>Clear</button>
            <button className="file-button" onClick={() => fileInput.current?.click()}>Choose another CSV</button>
          </div>
          <section className="data-strip">
            <div><span>File</span><strong>{fileName}</strong></div>
            <div><span>Recorded period</span><strong>{firstDate} to {lastDate}</strong></div>
            <div><span>Source rows</span><strong>{data.sourceRows.toLocaleString()}</strong></div>
            <div><span>Measurements</span><strong>{measurements.length.toLocaleString()}</strong></div>
            <div className={data.warnings.length ? "has-warning" : ""}><span>Warnings</span><strong>{data.warnings.length}</strong></div>
          </section>

          <MeasurementsChart
            measurements={measurements}
            visibleEyes={visibleEyes}
            onToggleEye={(eye) => setVisibleEyes((current) => ({ ...current, [eye]: !current[eye] }))}
            ranges={ranges}
            events={events}
            mode={mode}
            onBeginRange={beginRange}
            onBeginEvent={beginEvent}
            draftRange={draftRange}
            setDraftRange={setDraftRange}
            draftEventLabel={draftEvent.label}
            draftEventTime={eventTimestamp()}
            onDraftEventTime={setDraftEventTime}
            today={today}
            domain={[domainStart, domainEnd]}
            fullDomain={[fullDomainStart, fullDomainEnd]}
            yDomain={[minimumIop, maximumIop]}
            onDomainChange={setViewDomain}
          />

          <section className={`work-grid ${ranges.length === 0 ? "work-grid--editor-only" : ""}`}>
            {ranges.length > 0 && <div className="panel controls-panel">
              <div className="comparisons">
                {ranges.map((range) => <SummaryCard key={range.id} title={range.label} range={{ start: range.start, end: range.openEnded ? today : range.end }} endLabel={range.openEnded ? "Present" : undefined} measurements={measurements} />)}
              </div>
            </div>}

            <aside className="panel treatment-panel">
              {mode === "range" && <>
                <label>Name<input value={draftRange.label} onChange={(event) => setDraftRange((value) => ({ ...value, label: event.target.value }))} /></label>
                <div className="treatment-dates">
                  <DateTextInput label="Start" value={draftRange.start} onChange={(start) => setDraftRange((value) => ({ ...value, start }))} />
                  <DateTextInput label="End" value={draftRange.openEnded ? today : draftRange.end} disabled={draftRange.openEnded} onChange={(end) => setDraftRange((value) => ({ ...value, end, openEnded: false }))} />
                </div>
                <label className="present-toggle"><input type="checkbox" checked={draftRange.openEnded} onChange={(event) => setDraftRange((value) => ({ ...value, openEnded: event.target.checked, end: event.target.checked ? today : value.end }))} />Present</label>
                <button className="secondary-button" onClick={addRange}>Add range</button>
              </>}
              {mode === "event" && <>
                <label>Name<input value={draftEvent.label} onChange={(event) => setDraftEvent((value) => ({ ...value, label: event.target.value }))} /></label>
                <div className="treatment-dates">
                  <DateTextInput label="Date" value={draftEvent.date} onChange={(date) => setDraftEvent((value) => ({ ...value, date }))} />
                  <label>Time<input inputMode="numeric" placeholder="HH:MM" maxLength={5} value={draftEvent.clock} onChange={(event) => setDraftEvent((value) => ({ ...value, clock: event.target.value.replace(/[^\d:]/g, "") }))} /></label>
                </div>
                <button className="secondary-button" onClick={addEvent}>Add event</button>
              </>}
              <div className="treatment-list">
                {ranges.map((range) => (
                  <div className="treatment-item" key={range.id}>
                    <span><strong>{range.label}</strong><small>{displayDate(range.start)} – {range.openEnded ? "Present" : displayDate(range.end)}</small></span>
                    <button aria-label={`Remove ${range.label}`} onClick={() => setRanges((current) => current.filter((item) => item.id !== range.id))}>Remove</button>
                  </div>
                ))}
                {events.map((event) => (
                  <div className="treatment-item" key={event.id}>
                    <span><strong>{event.label}</strong><small>{formatFullTime(event.time)}</small></span>
                    <button aria-label={`Remove ${event.label}`} onClick={() => setEvents((current) => current.filter((item) => item.id !== event.id))}>Remove</button>
                  </div>
                ))}
              </div>
            </aside>
          </section>

          {ranges.length > 0 && <section className="diurnal-section">
            <div className="diurnal-eye-toggle" role="group" aria-label="Eye shown in diurnal chart">
              {(["OD", "OS"] as Eye[]).map((eye) => (
                <button key={eye} type="button" aria-pressed={diurnalEye === eye} onClick={() => setDiurnalEye(eye)}>{eyeLabel(eye)}</button>
              ))}
            </div>
            <div className="diurnal-chart">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart data={diurnalPoints} margin={{ top: 16, right: 20, bottom: 20, left: 0 }}>
                <CartesianGrid stroke="#dfe3da" vertical={false} />
                {Array.from({ length: 8 }, (_, bin) => bin % 2 === 1 && (
                  <ReferenceArea key={bin} x1={bin * 180} x2={(bin + 1) * 180} fill="#e8ecee" fillOpacity={0.72} stroke="none" />
                ))}
                <XAxis
                  type="number"
                  dataKey="minuteOfDay"
                  domain={[0, 1440]}
                  ticks={Array.from({ length: 8 }, (_, bin) => bin * 180 + 90)}
                  tickFormatter={(value) => diurnalBinLabel(Math.floor(value / 180))}
                  tick={{ fill: "#667064", fontSize: 11 }}
                />
                <YAxis width={52} type="number" dataKey="mean" domain={["dataMin - 2", "dataMax + 2"]} allowDecimals={false} tick={{ fill: "#667064", fontSize: 12 }} label={{ value: "mmHg", angle: -90, position: "insideLeft", fill: "#667064" }} />
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
        </>
      )}
    </main>
  );
}

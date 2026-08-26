import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from "react";
import {
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  ScatterChart,
  XAxis,
  YAxis,
} from "recharts";
import { dateBoundary, formatChartTime, formatDateInput, type Eye, type Measurement } from "./analysis";
import { navigateWheelDomain, type TimeDomain } from "./chartNavigation";
import { MeasurementCanvas, MEASUREMENT_PLOT } from "./MeasurementCanvas";

export type ChartMode = "range" | "event" | null;

export type DraftRange = {
  label: string;
  start: string;
  end: string;
  openEnded: boolean;
};

type ChartRange = DraftRange & { id: string };
type ChartEvent = { id: string; label: string; time: number };

type Props = {
  measurements: Measurement[];
  visibleEyes: Record<Eye, boolean>;
  onToggleEye: (eye: Eye) => void;
  ranges: ChartRange[];
  events: ChartEvent[];
  mode: ChartMode;
  onBeginRange: () => void;
  onBeginEvent: () => void;
  draftRange: DraftRange;
  setDraftRange: Dispatch<SetStateAction<DraftRange>>;
  draftEventLabel: string;
  draftEventTime: number | null;
  onDraftEventTime: (time: number) => void;
  today: string;
  domain: TimeDomain;
  fullDomain: TimeDomain;
  yDomain: TimeDomain;
  onDomainChange: (domain: TimeDomain) => void;
};

function eyeLabel(eye: Eye): string {
  return eye === "OD" ? "Right eye" : "Left eye";
}

function displayDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : "";
}

function eventLabel(label: string, time: number): string {
  const date = new Date(time);
  const clock = `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
  return `${label} · ${displayDate(formatDateInput(time))} ${clock}`;
}

export function MeasurementsChart({
  measurements,
  visibleEyes,
  onToggleEye,
  ranges,
  events,
  mode,
  onBeginRange,
  onBeginEvent,
  draftRange,
  setDraftRange,
  draftEventLabel,
  draftEventTime,
  onDraftEventTime,
  today,
  domain,
  fullDomain,
  yDomain,
  onDomainChange,
}: Props) {
  const chart = useRef<HTMLDivElement>(null);
  const selectionLayer = useRef<HTMLDivElement>(null);
  const domainRef = useRef(domain);
  const fullDomainRef = useRef(fullDomain);
  const onDomainChangeRef = useRef(onDomainChange);
  const [drag, setDrag] = useState<{ start: number; current: number } | null>(null);
  const [domainStart, domainEnd] = domain;
  const [fullDomainStart, fullDomainEnd] = fullDomain;

  domainRef.current = domain;
  fullDomainRef.current = fullDomain;
  onDomainChangeRef.current = onDomainChange;

  useEffect(() => {
    const element = chart.current;
    if (!element) return;

    function handleWheel(event: WheelEvent) {
      if (!event.ctrlKey && !event.shiftKey) return;
      event.preventDefault();
      event.stopPropagation();

      const bounds = element!.getBoundingClientRect();
      const plotWidth = Math.max(1, bounds.width - MEASUREMENT_PLOT.left - MEASUREMENT_PLOT.right);
      const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? 16
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? bounds.height
          : 1;
      const deltaX = event.deltaX * unit;
      const deltaY = event.deltaY * unit;
      const current = domainRef.current;
      const complete = fullDomainRef.current;
      const next = navigateWheelDomain(
        current,
        complete,
        event.shiftKey ? "zoom" : "pan",
        deltaX,
        deltaY,
        (event.clientX - bounds.left - MEASUREMENT_PLOT.left) / plotWidth,
        plotWidth,
      );

      domainRef.current = next;
      onDomainChangeRef.current(next);
    }

    element.addEventListener("wheel", handleWheel, { passive: false });
    return () => element.removeEventListener("wheel", handleWheel);
  }, []);

  function pointerRatio(event: ReactPointerEvent<HTMLDivElement>): number {
    const bounds = event.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
  }

  function pointerTime(event: ReactPointerEvent<HTMLDivElement>): number {
    return domainStart + pointerRatio(event) * (domainEnd - domainStart);
  }

  function isAtPresent(ratio: number): boolean {
    return ratio >= 0.98 && domainEnd >= fullDomainEnd;
  }

  function ratioForTime(time: number): number {
    if (domainEnd <= domainStart) return 0;
    return Math.max(0, Math.min(1, (time - domainStart) / (domainEnd - domainStart)));
  }

  function timeFromClientX(clientX: number): { time: number; ratio: number } {
    const bounds = selectionLayer.current?.getBoundingClientRect();
    if (!bounds) return { time: domainStart, ratio: 0 };
    const ratio = Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width));
    return { time: domainStart + ratio * (domainEnd - domainStart), ratio };
  }

  function startSelection(event: ReactPointerEvent<HTMLDivElement>) {
    const time = pointerTime(event);
    if (mode === "event") {
      onDraftEventTime(time);
      return;
    }
    if (mode !== "range") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ start: time, current: time });
    setDraftRange((current) => ({
      ...current,
      start: formatDateInput(time),
      end: formatDateInput(time),
      openEnded: false,
    }));
  }

  function moveSelection(event: ReactPointerEvent<HTMLDivElement>) {
    if (mode !== "range" || !drag) return;
    const end = pointerTime(event);
    const openEnded = isAtPresent(pointerRatio(event));
    setDrag((current) => current ? { ...current, current: end } : null);
    setDraftRange((current) => ({
      ...current,
      start: formatDateInput(Math.min(drag.start, end)),
      end: openEnded ? today : formatDateInput(Math.max(drag.start, end)),
      openEnded,
    }));
  }

  function finishSelection(event: ReactPointerEvent<HTMLDivElement>) {
    if (mode !== "range" || !drag) return;
    const end = pointerTime(event);
    const openEnded = isAtPresent(pointerRatio(event));
    setDraftRange((current) => ({
      ...current,
      start: formatDateInput(Math.min(drag.start, end)),
      end: openEnded ? today : formatDateInput(Math.max(drag.start, end)),
      openEnded,
    }));
    setDrag(null);
  }

  function beginHandleDrag(event: ReactPointerEvent<HTMLDivElement>) {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveRangeHandle(event: ReactPointerEvent<HTMLDivElement>, edge: "start" | "end") {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const { time, ratio } = timeFromClientX(event.clientX);
    const openEnded = isAtPresent(ratio);
    setDraftRange((current) => edge === "start"
      ? { ...current, start: formatDateInput(time) }
      : { ...current, end: openEnded ? today : formatDateInput(time), openEnded });
  }

  function moveEventHandle(event: ReactPointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    onDraftEventTime(timeFromClientX(event.clientX).time);
  }

  return (
    <section className="panel chart-panel">
      <div className="panel-heading">
        <div className="annotation-modes">
          <button type="button" aria-pressed={mode === "range"} onClick={onBeginRange}>New range</button>
          <button type="button" aria-pressed={mode === "event"} onClick={onBeginEvent}>Event</button>
        </div>
        <div className="eye-toggles">
          {(["OD", "OS"] as Eye[]).map((eye) => (
            <label key={eye}>
              <input type="checkbox" checked={visibleEyes[eye]} onChange={() => onToggleEye(eye)} />
              <span className={`dot dot--${eye.toLowerCase()}`} />{eyeLabel(eye)}
            </label>
          ))}
        </div>
      </div>
      <div ref={chart} className="chart-wrap">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 12, right: 20, bottom: 10, left: 0 }}>
            <CartesianGrid stroke="#dfe3da" vertical={false} />
            <XAxis type="number" dataKey="time" domain={domain} allowDataOverflow tickFormatter={formatChartTime} tick={{ fill: "#667064", fontSize: 12 }} minTickGap={48} />
            <YAxis width={52} type="number" dataKey="iop" domain={yDomain} allowDataOverflow allowDecimals={false} tick={{ fill: "#667064", fontSize: 12 }} label={{ value: "mmHg", angle: -90, position: "insideLeft", fill: "#667064" }} />
            {ranges.map((range, index) => (
              <ReferenceArea key={range.id} x1={dateBoundary(range.start)!} x2={range.openEnded ? domainEnd : Math.min(dateBoundary(range.end, true)!, domainEnd)} fill={index % 2 === 0 ? "#8aa8c4" : "#d9ad54"} fillOpacity={0.14} stroke={index % 2 === 0 ? "#6c8eac" : "#b9892d"} strokeOpacity={0.55} label={{ value: range.label, fill: "#47534b", fontSize: 11 }} />
            ))}
            {mode === "range" && draftRange.start && draftRange.end && !drag && (
              <ReferenceArea x1={dateBoundary(draftRange.start)!} x2={draftRange.openEnded ? domainEnd : Math.min(dateBoundary(draftRange.end, true)!, domainEnd)} fill="#6c8eac" fillOpacity={0.2} stroke="#6c8eac" strokeDasharray="4 3" />
            )}
            {drag && <ReferenceArea x1={Math.min(drag.start, drag.current)} x2={Math.max(drag.start, drag.current)} fill="#6c8eac" fillOpacity={0.25} />}
            {events.map((event) => (
              <ReferenceLine key={event.id} x={event.time} stroke="#7656a0" strokeWidth={2} label={{ value: eventLabel(event.label, event.time), fill: "#65448f", fontSize: 11, fontWeight: 600, position: "insideTopLeft" }} />
            ))}
            {mode === "event" && draftEventTime !== null && (
              <ReferenceLine x={draftEventTime} stroke="#7656a0" strokeWidth={2} strokeDasharray="4 3" label={{ value: eventLabel(draftEventLabel.trim() || "Event", draftEventTime), fill: "#65448f", fontSize: 11, position: "insideTopLeft" }} />
            )}
          </ScatterChart>
        </ResponsiveContainer>
        <MeasurementCanvas
          measurements={measurements}
          visibleEyes={visibleEyes}
          domainStart={domainStart}
          domainEnd={domainEnd}
          fullDomainStart={fullDomainStart}
          fullDomainEnd={fullDomainEnd}
          onDomainChange={onDomainChange}
          yMin={yDomain[0]}
          yMax={yDomain[1]}
        />
        <div
          ref={selectionLayer}
          className={`chart-selection-layer ${mode ? "chart-selection-layer--active" : ""}`}
          onPointerDown={startSelection}
          onPointerMove={moveSelection}
          onPointerUp={finishSelection}
        >
          {mode === "range" && draftRange.start && <div
            className="selection-handle selection-handle--range"
            style={{ left: `${ratioForTime(dateBoundary(draftRange.start)!) * 100}%` }}
            onPointerDown={beginHandleDrag}
            onPointerMove={(event) => moveRangeHandle(event, "start")}
          ><span /></div>}
          {mode === "range" && draftRange.end && <div
            className="selection-handle selection-handle--range"
            style={{ left: `${draftRange.openEnded ? 100 : ratioForTime(dateBoundary(draftRange.end, true)!) * 100}%` }}
            onPointerDown={beginHandleDrag}
            onPointerMove={(event) => moveRangeHandle(event, "end")}
          ><span /></div>}
          {mode === "event" && draftEventTime !== null && <div
            className="selection-handle selection-handle--event"
            style={{ left: `${ratioForTime(draftEventTime) * 100}%` }}
            onPointerDown={beginHandleDrag}
            onPointerMove={moveEventHandle}
          ><span /></div>}
        </div>
      </div>
    </section>
  );
}

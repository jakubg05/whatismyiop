import {
  Fragment,
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type CSSProperties,
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
import { dateBoundary, formatChartTime, formatDateInput, type Eye, type Measurement, type SessionAggregation } from "./analysis";
import { clipDomain, daylightBackground, navigateWheelDomain, type TimeDomain } from "./chartNavigation";
import { MeasurementCanvas, MEASUREMENT_PLOT } from "./MeasurementCanvas";
import { ChartDateTag, ChartSelect, ChartToggle } from "./ui";

export type ChartMode = "range" | "event" | null;
type PositionFilter = "all" | "sitting" | "laying";

export type DraftRange = {
  label: string;
  start: string;
  end: string;
  openEnded: boolean;
};

type ChartRange = DraftRange & { id: string };
type ChartEvent = { id: string; label: string; time: number };
type AnnotationLabel = {
  id: string;
  focusId?: string;
  kind: "range" | "event";
  text: string;
  time: number;
  endTime?: number;
  color?: string;
  draft?: boolean;
};

type AnnotationDrag = { start: number; current: number; startX: number; moved: boolean };
type HandleDrag = { kind: "range-start" | "range-end" | "event"; time: number; ratio: number };

const RANGE_PALETTE = [
  { stroke: "#5f7f9d", fill: "#a9c2d6" },
  { stroke: "#9a7632", fill: "#e5c982" },
  { stroke: "#66856f", fill: "#b8d0bd" },
  { stroke: "#7d6b9b", fill: "#c9bddd" },
  { stroke: "#9a6674", fill: "#ddb8c1" },
  { stroke: "#4f8585", fill: "#a9cecc" },
] as const;

const EVENT_COLORS = ["#8f6aa8", "#b56f8a", "#b47b5c", "#5d9290", "#7384b5", "#8b9253"] as const;

function rangePalette(index: number) {
  return RANGE_PALETTE[index % RANGE_PALETTE.length];
}

function eventColor(index: number) {
  return EVENT_COLORS[index % EVENT_COLORS.length];
}

type Props = {
  measurements: Measurement[];
  visibleEyes: Record<Eye, boolean>;
  onToggleEye: (eye: Eye) => void;
  ranges: ChartRange[];
  events: ChartEvent[];
  mode: ChartMode;
  onSelectRange: (range: Omit<DraftRange, "label">) => void;
  onSelectEvent: (time: number) => void;
  onEditRange: (range: ChartRange) => void;
  onEditEvent: (event: ChartEvent) => void;
  onCancelEdit: () => void;
  draftRange: DraftRange;
  draftRangeLabel: string;
  setDraftRange: Dispatch<SetStateAction<DraftRange>>;
  draftEventLabel: string;
  onDraftEventLabel: (label: string) => void;
  draftEventTime: number | null;
  onDraftEventTime: (time: number) => void;
  today: string;
  presentTime: number;
  fullDomain: TimeDomain;
  yDomain: TimeDomain;
};

function eyeLabel(eye: Eye): string {
  return eye === "OD" ? "Right" : "Left";
}

function matchesPositionFilter(position: string, filter: PositionFilter): boolean {
  if (filter === "all") return true;
  const normalized = position.trim().toLowerCase();
  return filter === "sitting"
    ? normalized.includes("sitt") || normalized.includes("seat")
    : normalized.includes("supine") || normalized.includes("lying") || normalized.includes("laying") || normalized.includes("recumbent");
}

function displayDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : "";
}

function dragLabel(time: number, includeTime = false): string {
  const date = new Date(time);
  const day = displayDate(formatDateInput(time));
  if (!includeTime) return day;
  return `${day} ${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
}

function placeHandleLabel(label: HTMLElement | null, ratio: number, alwaysRight = false) {
  if (!label) return;
  label.style.left = !alwaysRight && ratio > 0.8 ? "auto" : "7px";
  label.style.right = !alwaysRight && ratio > 0.8 ? "7px" : "auto";
}

export const MeasurementsChart = memo(function MeasurementsChart({
  measurements,
  visibleEyes,
  onToggleEye,
  ranges,
  events,
  mode,
  onSelectRange,
  onSelectEvent,
  onEditRange,
  onEditEvent,
  onCancelEdit,
  draftRange,
  draftRangeLabel,
  setDraftRange,
  draftEventLabel,
  onDraftEventLabel,
  draftEventTime,
  onDraftEventTime,
  today,
  presentTime,
  fullDomain,
  yDomain,
}: Props) {
  const chart = useRef<HTMLDivElement>(null);
  const annotationLabelInput = useRef<HTMLInputElement>(null);
  const startDateTag = useRef<HTMLDivElement>(null);
  const endDateTag = useRef<HTMLDivElement>(null);
  const selectionLayer = useRef<HTMLDivElement>(null);
  const dragPreview = useRef<HTMLDivElement>(null);
  const rangePreview = useRef<HTMLDivElement>(null);
  const dragRef = useRef<AnnotationDrag | null>(null);
  const handleDrag = useRef<HandleDrag | null>(null);
  const [domain, setDomain] = useState<TimeDomain>(fullDomain);
  const domainRef = useRef(domain);
  const pendingDomain = useRef<TimeDomain | null>(null);
  const wheelFrame = useRef<number | null>(null);
  const [chartWidth, setChartWidth] = useState(0);
  const [focusedAnnotation, setFocusedAnnotation] = useState<string | null>(null);
  const [hoveredAnnotation, setHoveredAnnotation] = useState<string | null>(null);
  const [measurementView, setMeasurementView] = useState<"sessions" | "raw">("sessions");
  const [sessionAggregation, setSessionAggregation] = useState<SessionAggregation>("median");
  const [positionFilter, setPositionFilter] = useState<PositionFilter>("all");
  const [qualityFilter, setQualityFilter] = useState("all");
  const [domainStart, domainEnd] = domain;
  const [fullDomainStart, fullDomainEnd] = fullDomain;
  const pressureDomain = useMemo(() => {
    const lower = Math.floor(yDomain[0] / 5) * 5;
    const upper = Math.ceil(yDomain[1] / 5) * 5;
    return (lower === upper ? [lower - 5, upper + 5] : [lower, upper]) as TimeDomain;
  }, [yDomain]);
  const pressureTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let value = pressureDomain[0]; value <= pressureDomain[1]; value += 5) ticks.push(value);
    return ticks;
  }, [pressureDomain]);
  const qualityOptions = useMemo(
    () => [...new Set(measurements.map((measurement) => measurement.quality))].sort((a, b) => a.localeCompare(b)),
    [measurements],
  );
  const filteredMeasurements = useMemo(
    () => measurements.filter((measurement) =>
      matchesPositionFilter(measurement.position, positionFilter)
      && (qualityFilter === "all" || measurement.quality === qualityFilter)),
    [measurements, positionFilter, qualityFilter],
  );
  const daylight = useMemo(
    () => daylightBackground(domain),
    [domain],
  );

  domainRef.current = domain;

  useEffect(() => {
    domainRef.current = fullDomain;
    pendingDomain.current = null;
    setDomain(fullDomain);
  }, [fullDomainStart, fullDomainEnd, measurements]);

  useEffect(() => {
    if (!focusedAnnotation) return;
    annotationLabelInput.current?.focus();
    annotationLabelInput.current?.select();
  }, [focusedAnnotation]);

  useEffect(() => {
    if (qualityFilter !== "all" && !qualityOptions.includes(qualityFilter)) setQualityFilter("all");
  }, [qualityFilter, qualityOptions]);

  const hoverFocus = focusedAnnotation === null ? hoveredAnnotation : null;
  const hoveredRange = hoverFocus?.startsWith("range:")
    ? ranges.find((range) => hoverFocus === `range:${range.id}`) ?? null
    : null;
  const hoveredEvent = hoverFocus?.startsWith("event:")
    ? events.find((event) => hoverFocus === `event:${event.id}`) ?? null
    : null;

  function updateDateTagRows() {
    const start = startDateTag.current?.getBoundingClientRect();
    const end = endDateTag.current?.getBoundingClientRect();
    if (!start || !end) {
      endDateTag.current?.classList.remove("selection-handle__date-control--stacked");
      return;
    }
    const gap = 8;
    endDateTag.current?.classList.toggle(
      "selection-handle__date-control--stacked",
      start.left < end.right + gap && start.right + gap > end.left,
    );
  }

  useLayoutEffect(() => {
    updateDateTagRows();
  }, [chartWidth, domainEnd, domainStart, draftRange.end, draftRange.openEnded, draftRange.start, hoveredRange, mode]);

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
      const next = navigateWheelDomain(
        current,
        null,
        event.shiftKey ? "zoom" : "pan",
        deltaX,
        deltaY,
        (event.clientX - bounds.left - MEASUREMENT_PLOT.left) / plotWidth,
        plotWidth,
      );
      if (next[0] === current[0] && next[1] === current[1]) return;

      domainRef.current = next;
      pendingDomain.current = next;
      if (wheelFrame.current === null) {
        wheelFrame.current = window.requestAnimationFrame(() => {
          wheelFrame.current = null;
          if (pendingDomain.current) setDomain(pendingDomain.current);
          pendingDomain.current = null;
        });
      }
    }

    element.addEventListener("wheel", handleWheel, { passive: false, capture: true });
    return () => {
      element.removeEventListener("wheel", handleWheel, { capture: true });
      if (wheelFrame.current !== null) window.cancelAnimationFrame(wheelFrame.current);
    };
  }, []);

  useEffect(() => {
    const element = chart.current;
    if (!element) return;
    const updateWidth = () => setChartWidth(element.clientWidth);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (mode === null) setFocusedAnnotation(null);
  }, [mode]);

  function changeDomain(next: TimeDomain) {
    domainRef.current = next;
    setDomain(next);
  }

  function pointerRatio(event: ReactPointerEvent<HTMLDivElement>): number {
    const bounds = event.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
  }

  function pointerTime(event: ReactPointerEvent<HTMLDivElement>): number {
    return domainStart + pointerRatio(event) * (domainEnd - domainStart);
  }

  function isAtPresent(ratio: number): boolean {
    const time = domainStart + ratio * (domainEnd - domainStart);
    const plotWidth = Math.max(1, chartWidth - MEASUREMENT_PLOT.left - MEASUREMENT_PLOT.right);
    const tolerance = Math.max(60_000, ((domainEnd - domainStart) / plotWidth) * 8);
    return Math.abs(time - presentTime) <= tolerance;
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
    if (mode || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    startAnnotation(pointerTime(event), event.clientX);
  }

  function moveSelection(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    moveAnnotation(pointerTime(event), event.clientX);
  }

  function finishSelection(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    finishAnnotation(pointerTime(event), pointerRatio(event), event.clientX);
  }

  function startAnnotation(time: number, clientX: number) {
    if (mode) return;
    dragRef.current = { start: time, current: time, startX: clientX, moved: false };
    if (dragPreview.current) dragPreview.current.style.display = "none";
  }

  function moveAnnotation(time: number, clientX: number) {
    const current = dragRef.current;
    if (!current) return;
    current.current = time;
    current.moved ||= Math.abs(clientX - current.startX) >= 4;
    if (!current.moved || !dragPreview.current) return;
    const left = ratioForTime(Math.min(current.start, time)) * 100;
    const right = ratioForTime(Math.max(current.start, time)) * 100;
    dragPreview.current.style.display = "block";
    dragPreview.current.style.left = `${left}%`;
    dragPreview.current.style.width = `${right - left}%`;
  }

  function finishAnnotation(end: number, ratio: number, clientX: number) {
    const drag = dragRef.current;
    if (!drag) return;
    const moved = drag.moved || Math.abs(clientX - drag.startX) >= 4;
    setFocusedAnnotation(null);
    setHoveredAnnotation(null);
    if (moved) {
      const openEnded = isAtPresent(ratio);
      onSelectRange({
        start: formatDateInput(Math.min(drag.start, end)),
        end: openEnded ? today : formatDateInput(Math.max(drag.start, end)),
        openEnded,
      });
    } else {
      onSelectEvent(end);
    }
    dragRef.current = null;
    if (dragPreview.current) dragPreview.current.style.display = "none";
  }

  function beginHandleDrag(event: ReactPointerEvent<HTMLDivElement>) {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const kind = event.currentTarget.dataset.handle as HandleDrag["kind"];
    handleDrag.current = { kind, ...timeFromClientX(event.clientX) };
  }

  function moveRangeHandle(event: ReactPointerEvent<HTMLDivElement>, edge: "start" | "end") {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const { time, ratio } = timeFromClientX(event.clientX);
    handleDrag.current = { kind: edge === "start" ? "range-start" : "range-end", time, ratio };
    event.currentTarget.style.left = `${ratio * 100}%`;
    const tag = event.currentTarget.querySelector<HTMLElement>(".selection-handle__date-control");
    const input = tag?.querySelector<HTMLInputElement>(".selection-handle__date-input");
    const labelText = edge === "end" && isAtPresent(ratio) ? "Present" : dragLabel(time);
    if (input) input.value = formatDateInput(time);
    else if (tag) tag.textContent = labelText;
    placeHandleLabel(tag, ratio, true);
    updateDateTagRows();
    updateRangePreview(edge, ratio);
  }

  function moveEventHandle(event: ReactPointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const next = timeFromClientX(event.clientX);
    handleDrag.current = { kind: "event", ...next };
    event.currentTarget.style.left = `${next.ratio * 100}%`;
    const tag = event.currentTarget.querySelector<HTMLElement>(".selection-handle__date-control");
    const value = tag?.querySelector<HTMLElement>(".selection-handle__date-value");
    if (value) value.textContent = dragLabel(next.time, true);
    placeHandleLabel(tag, next.ratio);
  }

  function updateRangePreview(edge: "start" | "end", ratio: number) {
    if (!rangePreview.current) return;
    const other = edge === "start"
      ? ratioForTime(draftRange.openEnded ? presentTime : dateBoundary(draftRange.end, true) ?? domainEnd)
      : ratioForTime(dateBoundary(draftRange.start) ?? domainStart);
    rangePreview.current.style.left = `${Math.min(ratio, other) * 100}%`;
    rangePreview.current.style.width = `${Math.abs(ratio - other) * 100}%`;
  }

  function finishHandleDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const pending = handleDrag.current;
    handleDrag.current = null;
    if (!pending) return;
    if (pending.kind === "event") {
      onDraftEventTime(pending.time);
      return;
    }
    const openEnded = pending.kind === "range-end" && isAtPresent(pending.ratio);
    setDraftRange((current) => pending.kind === "range-start"
      ? { ...current, start: formatDateInput(pending.time) }
      : { ...current, end: openEnded ? today : formatDateInput(pending.time), openEnded });
  }

  function visibleRange(start: string, end: string, openEnded: boolean): TimeDomain | null {
    const startTime = dateBoundary(start);
    const endTime = openEnded ? presentTime : dateBoundary(end, true);
    if (startTime === null || endTime === null) return null;
    return clipDomain([startTime, endTime], domain);
  }

  const visibleDraftRange = mode === "range"
    ? visibleRange(draftRange.start, draftRange.end, draftRange.openEnded)
    : null;
  const annotationLabels = useMemo(() => {
    const labels: AnnotationLabel[] = [];
    for (const [index, range] of ranges.entries()) {
      const start = dateBoundary(range.start);
      const end = range.openEnded ? presentTime : dateBoundary(range.end, true);
      if (start !== null && end !== null && start <= domainEnd && end >= domainStart) {
        labels.push({
          id: range.id,
          focusId: `range:${range.id}`,
          kind: "range",
          text: focusedAnnotation === `range:${range.id}` ? draftRangeLabel : range.label,
          time: Math.max(start, domainStart),
          endTime: Math.min(end, domainEnd),
          color: rangePalette(index).stroke,
        });
      }
    }
    for (const [index, event] of events.entries()) {
      if (event.time >= domainStart && event.time <= domainEnd) {
        labels.push({ id: event.id, focusId: `event:${event.id}`, kind: "event", text: focusedAnnotation === `event:${event.id}` ? draftEventLabel : event.label, time: event.time, color: eventColor(index) });
      }
    }
    if (mode === "range" && visibleDraftRange) {
      labels.push({ id: "draft-range", kind: "range", text: draftRangeLabel.trim() || "Period", time: visibleDraftRange[0], endTime: visibleDraftRange[1], color: rangePalette(ranges.length).stroke, draft: true });
    }
    if (mode === "event" && draftEventTime !== null && draftEventTime >= domainStart && draftEventTime <= domainEnd) {
      labels.push({ id: "draft-event", kind: "event", text: draftEventLabel.trim() || "Event", time: draftEventTime, color: eventColor(events.length), draft: true });
    }

    const plotWidth = Math.max(1, chartWidth - MEASUREMENT_PLOT.left - MEASUREMENT_PLOT.right);
    const laneEnds: number[] = [];
    return labels
      .filter((label) => focusedAnnotation === null || label.focusId === focusedAnnotation)
      .sort((a, b) => a.time - b.time)
      .map((label) => {
        const left = ((label.time - domainStart) / Math.max(1, domainEnd - domainStart)) * plotWidth;
        const compactWidth = Math.min(300, Math.max(72, label.text.length * 7 + (label.focusId ? 38 : 18)));
        const spanWidth = label.endTime === undefined
          ? 0
          : ((label.endTime - label.time) / Math.max(1, domainEnd - domainStart)) * plotWidth;
        const fullWidth = label.kind === "range" && spanWidth >= compactWidth;
        const width = fullWidth ? spanWidth : compactWidth;
        let lane = laneEnds.findIndex((end) => left >= end + 8);
        if (lane === -1) lane = laneEnds.length;
        laneEnds[lane] = left + width;
        return { ...label, left, width, lane, fullWidth };
      });
  }, [chartWidth, domainEnd, domainStart, draftEventLabel, draftEventTime, draftRange, draftRangeLabel, events, focusedAnnotation, mode, presentTime, ranges, visibleDraftRange]);
  const annotationLaneCount = Math.max(1, ...annotationLabels.map((label) => label.lane + 1));
  const visibleRanges = focusedAnnotation?.startsWith("event:")
    ? []
    : focusedAnnotation?.startsWith("range:")
      ? ranges.filter((range) => focusedAnnotation === `range:${range.id}`)
      : ranges;
  const visibleEvents = focusedAnnotation?.startsWith("range:")
    ? []
    : focusedAnnotation?.startsWith("event:")
      ? events.filter((event) => focusedAnnotation === `event:${event.id}`)
      : events;
  const activeAnnotation = focusedAnnotation ?? hoveredAnnotation;
  const focusedRangeIndex = activeAnnotation?.startsWith("range:")
    ? ranges.findIndex((range) => activeAnnotation === `range:${range.id}`)
    : -1;
  const focusedEventIndex = activeAnnotation?.startsWith("event:")
    ? events.findIndex((event) => activeAnnotation === `event:${event.id}`)
    : -1;
  const selectionColor = mode === "event" || focusedEventIndex >= 0
    ? eventColor(focusedEventIndex >= 0 ? focusedEventIndex : events.length)
    : rangePalette(focusedRangeIndex >= 0 ? focusedRangeIndex : ranges.length).stroke;

  function focusAnnotation(label: AnnotationLabel) {
    if (!label.focusId) return;
    const focusing = focusedAnnotation !== label.focusId;
    setFocusedAnnotation(focusing ? label.focusId : null);
    if (!focusing) {
      onCancelEdit();
      return;
    }
    if (label.kind === "range") {
      const range = ranges.find((item) => `range:${item.id}` === label.focusId);
      if (range) onEditRange(range);
    } else {
      const event = events.find((item) => `event:${item.id}` === label.focusId);
      if (event) onEditEvent(event);
    }
  }

  return (
    <section className="panel chart-panel">
      <div ref={chart} className="chart-wrap" style={{ marginTop: `${annotationLaneCount * 22}px` }}>
        <div className="chart-annotation-labels" style={{ height: `${annotationLaneCount * 22}px` }}>
          {annotationLabels.map((label) => (
            <div
              key={label.id}
              className={`chart-annotation-label chart-annotation-label--${label.kind}${label.fullWidth ? " chart-annotation-label--range-wide" : ""}${label.draft ? " chart-annotation-label--draft" : ""}${hoverFocus && hoverFocus !== label.focusId ? " chart-annotation-label--muted" : ""}`}
              role={label.focusId ? "button" : undefined}
              tabIndex={label.focusId ? 0 : undefined}
              onClick={() => label.focusId && focusAnnotation(label)}
              onKeyDown={(event) => {
                if (!label.focusId || (event.key !== "Enter" && event.key !== " ")) return;
                event.preventDefault();
                focusAnnotation(label);
              }}
              onPointerEnter={() => label.focusId && setHoveredAnnotation(label.focusId)}
              onPointerLeave={() => setHoveredAnnotation(null)}
              style={{
                left: `${label.left}px`,
                top: `${label.lane * 22}px`,
                width: `${label.width}px`,
                borderColor: label.color,
                color: label.color,
                backgroundColor: label.color ? `color-mix(in srgb, ${label.color} 16%, white)` : undefined,
              }}
            >
              {label.draft || label.focusId === focusedAnnotation ? <input
                ref={annotationLabelInput}
                className="chart-annotation-label__input"
                type="text"
                name={`${label.kind}-graph-label`}
                aria-label={`${label.kind === "range" ? "Period" : "Event"} label`}
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                placeholder={label.kind === "range" ? "Period" : "Event"}
                value={label.draft ? label.kind === "range" ? draftRangeLabel : draftEventLabel : label.text}
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
                onChange={(event) => label.kind === "range"
                  ? setDraftRange((current) => ({ ...current, label: event.target.value }))
                  : onDraftEventLabel(event.target.value)}
              /> : <span className="chart-annotation-label__text">{label.text}</span>}
              {label.focusId && <span className="chart-annotation-label__edit" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25Zm17.71-10.12a1 1 0 0 0 0-1.41l-2.43-2.43a1 1 0 0 0-1.41 0l-1.9 1.9 3.75 3.75 1.99-1.81Z" /></svg>
              </span>}
            </div>
          ))}
        </div>
        {daylight && <div
          aria-hidden="true"
          className="chart-daylight-background"
          style={{ opacity: daylight.opacity }}
        >
          {daylight.days.map((day) => <div
            key={day.start}
            className="chart-daylight-day"
            style={{
              left: `${(day.start - domainStart) / (domainEnd - domainStart) * 100}%`,
              width: `${86_400_000 / (domainEnd - domainStart) * 100}%`,
              "--sunrise": `${day.sunrisePercent}%`,
              "--sunset": `${day.sunsetPercent}%`,
            } as CSSProperties}
          />)}
        </div>}
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 12, right: 20, bottom: 10, left: 0 }}>
            <CartesianGrid stroke="rgb(0 0 0 / 10%)" vertical={false} />
            <XAxis type="number" dataKey="time" domain={domain} allowDataOverflow tickFormatter={formatChartTime} tick={{ fill: "var(--muted)", fontSize: 12 }} minTickGap={48} />
            <YAxis width={52} type="number" dataKey="iop" domain={pressureDomain} ticks={pressureTicks} allowDataOverflow allowDecimals={false} tick={{ fill: "var(--muted)", fontSize: 12 }} label={{ value: "mmHg", angle: -90, position: "insideLeft", fill: "var(--muted)" }} />
            {visibleRanges.map((range) => {
              const index = ranges.indexOf(range);
              const visible = visibleRange(range.start, range.end, range.openEnded);
              if (!visible) return null;
              const color = rangePalette(index);
              const muted = hoverFocus !== null && hoverFocus !== `range:${range.id}`;
              return <Fragment key={range.id}>
                <ReferenceArea x1={visible[0]} x2={visible[1]} fill={color.fill} fillOpacity={muted ? 0 : 0.14} stroke="none" />
                <ReferenceLine x={visible[0]} stroke={color.stroke} strokeOpacity={muted ? 0 : 0.55} />
                <ReferenceLine x={visible[1]} stroke={color.stroke} strokeOpacity={muted ? 0 : 0.55} />
              </Fragment>;
            })}
            {focusedAnnotation === null && visibleDraftRange && (
              <ReferenceArea x1={visibleDraftRange[0]} x2={visibleDraftRange[1]} fill={rangePalette(ranges.length).fill} fillOpacity={0.2} stroke="none" />
            )}
            {visibleEvents.map((event) => (
              <ReferenceLine key={event.id} x={event.time} stroke={eventColor(events.indexOf(event))} strokeWidth={2} strokeOpacity={hoverFocus && hoverFocus !== `event:${event.id}` ? 0 : 1} />
            ))}
            {focusedAnnotation === null && mode === "event" && draftEventTime !== null && (
              <ReferenceLine x={draftEventTime} stroke={eventColor(events.length)} strokeWidth={2} strokeDasharray="4 3" />
            )}
          </ScatterChart>
        </ResponsiveContainer>
        <MeasurementCanvas
          measurements={filteredMeasurements}
          showRawReadings={measurementView === "raw"}
          sessionAggregation={sessionAggregation}
          visibleEyes={visibleEyes}
          domainStart={domainStart}
          domainEnd={domainEnd}
          onDomainChange={changeDomain}
          onAnnotationStart={startAnnotation}
          onAnnotationMove={moveAnnotation}
          onAnnotationEnd={finishAnnotation}
          yMin={pressureDomain[0]}
          yMax={pressureDomain[1]}
        />
        <div
          ref={selectionLayer}
          className={`chart-selection-layer ${mode ? "chart-selection-layer--active" : ""}`}
          style={{ "--selection-color": selectionColor } as CSSProperties}
          onPointerDown={startSelection}
          onPointerMove={moveSelection}
          onPointerUp={finishSelection}
        >
          {hoveredRange && <>
            <div className="annotation-date-anchor" style={{ left: `${ratioForTime(dateBoundary(hoveredRange.start) ?? domainStart) * 100}%` }}>
              <ChartDateTag ref={startDateTag} ariaLabel="Period start date" value={hoveredRange.start} displayValue={displayDate(hoveredRange.start)} />
            </div>
            {(!hoveredRange.openEnded || (presentTime >= domainStart && presentTime <= domainEnd)) && <div className="annotation-date-anchor" style={{ left: `${ratioForTime(hoveredRange.openEnded ? presentTime : dateBoundary(hoveredRange.end, true) ?? domainEnd) * 100}%` }}>
              <ChartDateTag
                ref={endDateTag}
                ariaLabel="Period end date"
                value={hoveredRange.openEnded ? today : hoveredRange.end}
                displayValue={displayDate(hoveredRange.openEnded ? today : hoveredRange.end)}
                present={{ checked: hoveredRange.openEnded }}
              />
            </div>}
          </>}
          {hoveredEvent && <div className="annotation-date-anchor" style={{ left: `${ratioForTime(hoveredEvent.time) * 100}%` }}>
            <ChartDateTag
              ariaLabel="Event date and time"
              className="selection-handle__date-control--event"
              value={formatDateInput(hoveredEvent.time)}
              displayValue={dragLabel(hoveredEvent.time, true)}
              alignRight={ratioForTime(hoveredEvent.time) > 0.8}
            />
          </div>}
          <div ref={dragPreview} className="selection-drag-preview" />
          {mode === "range" && visibleDraftRange && <div
            ref={rangePreview}
            className="selection-drag-preview selection-drag-preview--draft"
            style={{ left: `${ratioForTime(visibleDraftRange[0]) * 100}%`, width: `${(ratioForTime(visibleDraftRange[1]) - ratioForTime(visibleDraftRange[0])) * 100}%` }}
          />}
          {mode === "range" && draftRange.start && <div
            className="selection-handle selection-handle--range"
            data-handle="range-start"
            style={{ left: `${ratioForTime(dateBoundary(draftRange.start)!) * 100}%` }}
            onPointerDown={beginHandleDrag}
            onPointerMove={(event) => moveRangeHandle(event, "start")}
            onPointerUp={finishHandleDrag}
            onPointerCancel={finishHandleDrag}
          ><span /><ChartDateTag
            ref={startDateTag}
            active
            ariaLabel="Period start date"
            value={draftRange.start}
            onChange={(value) => setDraftRange((current) => ({ ...current, start: value }))}
          /></div>}
          {mode === "range" && draftRange.end && (!draftRange.openEnded || (presentTime >= domainStart && presentTime <= domainEnd)) && <div
            className="selection-handle selection-handle--range"
            data-handle="range-end"
            style={{ left: `${ratioForTime(draftRange.openEnded ? presentTime : dateBoundary(draftRange.end, true)!) * 100}%` }}
            onPointerDown={beginHandleDrag}
            onPointerMove={(event) => moveRangeHandle(event, "end")}
            onPointerUp={finishHandleDrag}
            onPointerCancel={finishHandleDrag}
          ><span /><ChartDateTag
            ref={endDateTag}
            active
            ariaLabel="Period end date"
            disabled={draftRange.openEnded}
            value={draftRange.openEnded ? today : draftRange.end}
            onChange={(value) => setDraftRange((current) => ({ ...current, end: value, openEnded: false }))}
            present={{
              checked: draftRange.openEnded,
              onChange: () => setDraftRange((current) => ({ ...current, openEnded: !current.openEnded, end: !current.openEnded ? today : current.end })),
            }}
          />
          </div>}
          {mode === "event" && draftEventTime !== null && <div
            className="selection-handle selection-handle--event"
            data-handle="event"
            style={{ left: `${ratioForTime(draftEventTime) * 100}%` }}
            onPointerDown={beginHandleDrag}
            onPointerMove={moveEventHandle}
            onPointerUp={finishHandleDrag}
            onPointerCancel={finishHandleDrag}
          ><span /><ChartDateTag
            ariaLabel="Event date and time"
            className="selection-handle__date-control--event"
            value={formatDateInput(draftEventTime)}
            displayValue={dragLabel(draftEventTime, true)}
            alignRight={ratioForTime(draftEventTime) > 0.8}
          /></div>}
        </div>
      </div>
      <div className="chart-toolbar">
        <div className="chart-filters" role="group" aria-label="Measurement filters">
          <ChartSelect
            className="chart-filter chart-filter--position"
            label="Position"
            value={positionFilter}
            options={[
              { value: "all", label: "All positions" },
              { value: "sitting", label: "Sitting" },
              { value: "laying", label: "Laying down" },
            ]}
            onChange={setPositionFilter}
          />
          <ChartSelect
            className="chart-filter chart-filter--quality"
            label="Quality"
            value={qualityFilter}
            options={[
              { value: "all", label: "All qualities" },
              ...qualityOptions.map((quality) => ({ value: quality, label: quality })),
            ]}
            onChange={setQualityFilter}
          />
        </div>
        <div className="measurement-view-control" role="group" aria-label="Measurement view">
          <ChartSelect
            className={`measurement-view-control__sessions${measurementView === "sessions" ? " measurement-view-control__sessions--active" : ""}`}
            label="Sessions"
            value={sessionAggregation}
            options={[
              { value: "median", label: "Median" },
              { value: "average", label: "Average" },
            ]}
            pressed={measurementView === "sessions"}
            onTrigger={() => setMeasurementView("sessions")}
            onChange={(aggregation) => {
              setSessionAggregation(aggregation);
              setMeasurementView("sessions");
            }}
          />
          <button className="measurement-view-control__raw" type="button" aria-pressed={measurementView === "raw"} onClick={() => setMeasurementView("raw")}>Raw</button>
        </div>
        <div className="eye-toggles">
          {(["OD", "OS"] as Eye[]).map((eye) => (
            <ChartToggle key={eye} label={eyeLabel(eye)} colorClass={`dot--${eye.toLowerCase()}`} checked={visibleEyes[eye]} onChange={() => onToggleEye(eye)} />
          ))}
        </div>
      </div>
    </section>
  );
});

import {
  Fragment,
  memo,
  useCallback,
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
import { dateTimeBoundary, formatDateInput, formatTimeInput, type Eye, type Measurement, type SessionAggregation } from "../analysis";
import { periodPalette as rangePalette } from "../periodPalette";
import { clipDomain, daylightBackground, intersectDomains, navigateWheelDomain, type TimeDomain } from "./chartNavigation";
import { MeasurementCanvas, MEASUREMENT_PLOT } from "./MeasurementCanvas";
import { moveRangeEdge, rangeTimeDomain, type EditableRange } from "./range";
import { type TrendMode } from "./trend";
import { ChartDateTag, ChartSelect, ChartToggle } from "./controls";
import { formatChartTime } from "./format";

export type ChartMode = "range" | "event" | "trend" | "sessions" | null;
type PositionFilter = "all" | "sitting" | "laying";

export type DraftRange = EditableRange;

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

type AnnotationDrag = { start: number; startX: number; moved: boolean };
type RangeEdge = "start" | "end";
type HandleDrag = { kind: RangeEdge | "event"; time: number };

const EVENT_COLORS = ["#8f6aa8", "#b56f8a", "#b47b5c", "#5d9290", "#7384b5", "#8b9253"] as const;

function eventColor(index: number) {
  return EVENT_COLORS[index % EVENT_COLORS.length];
}

type Props = {
  measurements: Measurement[];
  visibleEyes: Record<Eye, boolean>;
  onToggleEye: (eye: Eye) => void;
  trendMode: TrendMode;
  visibleTrendEyes: Record<Eye, boolean>;
  onOpenTrendSettings: () => void;
  onOpenSessionInfo: () => void;
  ranges: ChartRange[];
  events: ChartEvent[];
  comparisonRanges: ChartRange[];
  comparisonMode: boolean;
  onComparisonBlocked: () => void;
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
  onAnnotationTopOffsetChange?: (offset: number) => void;
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

function alignDateTagToPlot(tag: HTMLElement | null, ratio: number) {
  tag?.classList.toggle("selection-handle__date-control--right", ratio > 0.8);
}

export const MeasurementsChart = memo(function MeasurementsChart({
  measurements,
  visibleEyes,
  onToggleEye,
  trendMode,
  visibleTrendEyes,
  onOpenTrendSettings,
  onOpenSessionInfo,
  ranges,
  events,
  comparisonRanges,
  comparisonMode,
  onComparisonBlocked,
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
  onAnnotationTopOffsetChange,
}: Props) {
  const chartPanel = useRef<HTMLElement>(null);
  const chart = useRef<HTMLDivElement>(null);
  const annotationLabelsContainer = useRef<HTMLDivElement>(null);
  const focusedRangeLabel = useRef<HTMLDivElement>(null);
  const plotOverlayRef = useRef<HTMLDivElement>(null);
  const dragPreview = useRef<HTMLDivElement>(null);
  const rangePreview = useRef<HTMLDivElement>(null);
  const dragRef = useRef<AnnotationDrag | null>(null);
  const handleDrag = useRef<HandleDrag | null>(null);
  const draftRangeRef = useRef(draftRange);
  const [domain, setDomain] = useState<TimeDomain>(fullDomain);
  const domainRef = useRef(domain);
  const pendingDomain = useRef<TimeDomain | null>(null);
  const wheelFrame = useRef<number | null>(null);
  const [chartWidth, setChartWidth] = useState(0);
  const [focusedAnnotation, setFocusedAnnotation] = useState<string | null>(null);
  const [hoveredAnnotation, setHoveredAnnotation] = useState<string | null>(null);
  const [hoveredRegionRangeIds, setHoveredRegionRangeIds] = useState<string[]>([]);
  const [draggedRangeFocus, setDraggedRangeFocus] = useState<TimeDomain | null>(null);
  const [measurementView, setMeasurementView] = useState<"sessions" | "raw">("sessions");
  const [sessionAggregation, setSessionAggregation] = useState<SessionAggregation>("median");
  const [positionFilter, setPositionFilter] = useState<PositionFilter>("all");
  const [qualityFilter, setQualityFilter] = useState("all");
  const [showPeriods, setShowPeriods] = useState(true);
  const [showEvents, setShowEvents] = useState(true);
  const [periodHandleEdges, setPeriodHandleEdges] = useState<readonly [RangeEdge, RangeEdge]>(["start", "end"]);
  const annotationEditorOpen = mode === "range" || mode === "event";
  const displayRanges = comparisonMode ? comparisonRanges : ranges;
  const displayEvents = comparisonMode ? [] : events;
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

  if (!handleDrag.current || handleDrag.current.kind === "event") draftRangeRef.current = draftRange;

  domainRef.current = domain;

  useEffect(() => {
    domainRef.current = fullDomain;
    pendingDomain.current = null;
    setDomain(fullDomain);
  }, [fullDomainStart, fullDomainEnd, measurements]);

  const focusAnnotationLabelInput = useCallback((input: HTMLInputElement | null) => {
    if (!input) return;
    input.focus();
    input.select();
  }, []);

  useEffect(() => {
    if (qualityFilter !== "all" && !qualityOptions.includes(qualityFilter)) setQualityFilter("all");
  }, [qualityFilter, qualityOptions]);

  useEffect(() => {
    setHoveredAnnotation((current) => {
      if (!showPeriods && current?.startsWith("range:")) return null;
      if (!showEvents && current?.startsWith("event:")) return null;
      return current;
    });
  }, [showEvents, showPeriods]);

  const handlePlotHoverTimeChange = useCallback((time: number | null) => {
    const nextIds = time === null || comparisonMode || !showPeriods || focusedAnnotation !== null || annotationEditorOpen
      ? []
      : ranges.flatMap((range) => {
        const start = dateTimeBoundary(range.start, range.startTime);
        const end = range.openEnded ? presentTime : dateTimeBoundary(range.end, range.endTime, true);
        return start !== null && end !== null && time >= start && time <= end ? [range.id] : [];
      });
    setHoveredRegionRangeIds((current) =>
      current.length === nextIds.length && current.every((id, index) => id === nextIds[index])
        ? current
        : nextIds);
  }, [annotationEditorOpen, comparisonMode, focusedAnnotation, presentTime, ranges, showPeriods]);

  const hoverFocus = !annotationEditorOpen && focusedAnnotation === null ? hoveredAnnotation : null;
  const hoveredRange = hoverFocus?.startsWith("range:")
    ? ranges.find((range) => hoverFocus === `range:${range.id}`) ?? null
    : null;
  const hoveredEvent = hoverFocus?.startsWith("event:")
    ? events.find((event) => hoverFocus === `event:${event.id}`) ?? null
    : null;
  const hoveredPeriodStart = hoveredRange
    ? dateTimeBoundary(hoveredRange.start, hoveredRange.startTime) ?? domainStart
    : null;
  const hoveredPeriodEnd = hoveredRange
    ? hoveredRange.openEnded
      ? presentTime
      : dateTimeBoundary(hoveredRange.end, hoveredRange.endTime, true) ?? domainEnd
    : null;

  function annotationIsMuted(focusId: string | undefined): boolean {
    if (hoverFocus) return hoverFocus !== focusId;
    if (hoveredRegionRangeIds.length === 0) return false;
    return !focusId?.startsWith("range:")
      || !hoveredRegionRangeIds.some((id) => focusId === `range:${id}`);
  }

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
    setHoveredAnnotation(null);
    setHoveredRegionRangeIds([]);
    setDraggedRangeFocus(null);
    if (mode === null) setFocusedAnnotation(null);
  }, [mode]);

  function changeDomain(next: TimeDomain) {
    domainRef.current = next;
    setDomain(next);
  }

  function ratioForTime(time: number): number {
    if (domainEnd <= domainStart) return 0;
    return Math.max(0, Math.min(1, (time - domainStart) / (domainEnd - domainStart)));
  }

  function timeFromClientX(clientX: number): { time: number; ratio: number } {
    const bounds = plotOverlayRef.current?.getBoundingClientRect();
    if (!bounds) return { time: domainStart, ratio: 0 };
    const ratio = Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width));
    return { time: domainStart + ratio * (domainEnd - domainStart), ratio };
  }

  function startAnnotation(time: number, clientX: number) {
    if (mode) return;
    if (comparisonMode) {
      onComparisonBlocked();
      dragRef.current = null;
      return;
    }
    dragRef.current = { start: time, startX: clientX, moved: false };
    if (dragPreview.current) dragPreview.current.style.display = "none";
  }

  function moveAnnotation(time: number, clientX: number) {
    const current = dragRef.current;
    if (!current) return;
    current.moved ||= Math.abs(clientX - current.startX) >= 4;
    if (!current.moved || !dragPreview.current) return;
    const left = ratioForTime(Math.min(current.start, time)) * 100;
    const right = ratioForTime(Math.max(current.start, time)) * 100;
    dragPreview.current.style.display = "block";
    dragPreview.current.style.left = `${left}%`;
    dragPreview.current.style.width = `${right - left}%`;
  }

  function finishAnnotation(end: number, _ratio: number, clientX: number) {
    if (comparisonMode) return;
    const drag = dragRef.current;
    if (!drag) return;
    const moved = drag.moved || Math.abs(clientX - drag.startX) >= 4;
    setFocusedAnnotation(null);
    setHoveredAnnotation(null);
    if (moved) {
      onSelectRange({
        start: formatDateInput(Math.min(drag.start, end)),
        startTime: formatTimeInput(Math.min(drag.start, end)),
        end: formatDateInput(Math.max(drag.start, end)),
        endTime: formatTimeInput(Math.max(drag.start, end)),
        openEnded: false,
      });
    } else {
      onSelectEvent(end);
    }
    dragRef.current = null;
    if (dragPreview.current) dragPreview.current.style.display = "none";
  }

  function beginHandleDrag(event: ReactPointerEvent<HTMLDivElement>, kind: HandleDrag["kind"]) {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    handleDrag.current = { kind, time: timeFromClientX(event.clientX).time };
  }

  function moveRangeHandle(event: ReactPointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const { time, ratio } = timeFromClientX(event.clientX);
    const active = handleDrag.current;
    if (!active || active.kind === "event") return;
    const edge = active.kind;
    const current = draftRangeRef.current;
    const otherTime = edge === "start"
      ? current.openEnded ? presentTime : dateTimeBoundary(current.end, current.endTime, true) ?? domainEnd
      : dateTimeBoundary(current.start, current.startTime) ?? domainStart;
    const crossed = edge === "start" ? time > otherTime : time < otherTime;
    const nextEdge: RangeEdge = crossed ? edge === "start" ? "end" : "start" : edge;
    const nextRange = moveRangeEdge(current, edge, time, presentTime);
    draftRangeRef.current = nextRange;
    setDraftRange(nextRange);
    if (crossed) setPeriodHandleEdges(([first, second]) => [second, first]);
    handleDrag.current = { kind: nextEdge, time };
    event.currentTarget.style.left = `${ratio * 100}%`;
    const tag = event.currentTarget.querySelector<HTMLElement>(".selection-handle__date-control");
    const input = tag?.querySelector<HTMLInputElement>(".selection-handle__date-input");
    const timeInput = tag?.querySelector<HTMLInputElement>(".selection-handle__time-input");
    if (input) input.value = formatDateInput(time);
    if (timeInput) timeInput.value = formatTimeInput(time);
    alignDateTagToPlot(tag, ratio);
    if (rangePreview.current) {
      const otherRatio = ratioForTime(otherTime);
      rangePreview.current.style.left = `${Math.min(ratio, otherRatio) * 100}%`;
      rangePreview.current.style.width = `${Math.abs(ratio - otherRatio) * 100}%`;
    }
    const liveRange = [Math.min(time, otherTime), Math.max(time, otherTime)] as TimeDomain;
    updateFocusedRangeLabel(liveRange);
    setDraggedRangeFocus(liveRange);
  }

  function updateFocusedRangeLabel([start, end]: TimeDomain) {
    const label = focusedRangeLabel.current;
    if (!label) return;
    const plotWidth = Math.max(1, chartWidth - MEASUREMENT_PLOT.left - MEASUREMENT_PLOT.right);
    const left = ratioForTime(start) * plotWidth;
    const spanWidth = Math.max(0, ratioForTime(end) * plotWidth - left);
    const compactWidth = Math.min(300, Math.max(72, draftRangeLabel.length * 7 + 38));
    const fullWidth = spanWidth >= compactWidth;
    label.style.left = `${left}px`;
    label.style.width = `${fullWidth ? spanWidth : compactWidth}px`;
    label.classList.toggle("chart-annotation-label--range-wide", fullWidth);
  }

  function moveEventHandle(event: ReactPointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const next = timeFromClientX(event.clientX);
    handleDrag.current = { kind: "event", time: next.time };
    event.currentTarget.style.left = `${next.ratio * 100}%`;
    const tag = event.currentTarget.querySelector<HTMLElement>(".selection-handle__date-control");
    const dateInput = tag?.querySelector<HTMLInputElement>(".selection-handle__date-input");
    const timeInput = tag?.querySelector<HTMLInputElement>(".selection-handle__time-input");
    if (dateInput) dateInput.value = formatDateInput(next.time);
    if (timeInput) timeInput.value = formatTimeInput(next.time);
    alignDateTagToPlot(tag, next.ratio);
  }

  function finishHandleDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const pending = handleDrag.current;
    handleDrag.current = null;
    setDraggedRangeFocus(null);
    setPeriodHandleEdges(["start", "end"]);
    if (!pending) return;
    if (pending.kind === "event") {
      onDraftEventTime(pending.time);
      return;
    }
  }

  function updateDraftEventDateTime(date: string, clock: string) {
    const time = dateTimeBoundary(date, clock);
    if (time !== null) onDraftEventTime(time);
  }

  function visibleRangeDomain(range: EditableRange): TimeDomain | null {
    const period = rangeTimeDomain(range, presentTime);
    return period ? clipDomain(period, domain) : null;
  }

  const visibleDraftRange = mode === "range"
    ? visibleRangeDomain(draftRange)
    : null;
  const annotationLabels = useMemo(() => {
    const labels: AnnotationLabel[] = [];
    for (const [index, range] of displayRanges.entries()) {
      const editing = !comparisonMode && focusedAnnotation === `range:${range.id}`;
      if (!comparisonMode && !showPeriods && !editing) continue;
      const liveDomain = editing
        ? draggedRangeFocus ?? rangeTimeDomain(draftRange, presentTime)
        : rangeTimeDomain(range, presentTime);
      const start = liveDomain?.[0] ?? null;
      const end = liveDomain?.[1] ?? null;
      if (start !== null && end !== null && start <= domainEnd && end >= domainStart) {
        labels.push({
          id: range.id,
          focusId: comparisonMode ? undefined : `range:${range.id}`,
          kind: "range",
          text: editing ? draftRangeLabel : range.label,
          time: Math.max(start, domainStart),
          endTime: Math.min(end, domainEnd),
          color: rangePalette(index).stroke,
        });
      }
    }
    for (const [index, event] of displayEvents.entries()) {
      if (!showEvents && focusedAnnotation !== `event:${event.id}`) continue;
      if (event.time >= domainStart && event.time <= domainEnd) {
        labels.push({ id: event.id, focusId: `event:${event.id}`, kind: "event", text: focusedAnnotation === `event:${event.id}` ? draftEventLabel : event.label, time: event.time, color: eventColor(index) });
      }
    }
    if (!comparisonMode && mode === "range" && visibleDraftRange) {
      labels.push({ id: "draft-range", kind: "range", text: draftRangeLabel.trim() || "Period", time: visibleDraftRange[0], endTime: visibleDraftRange[1], color: rangePalette(ranges.length).stroke, draft: true });
    }
    if (!comparisonMode && mode === "event" && draftEventTime !== null && draftEventTime >= domainStart && draftEventTime <= domainEnd) {
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
  }, [chartWidth, comparisonMode, displayEvents, displayRanges, domainEnd, domainStart, draftEventLabel, draftEventTime, draftRange, draftRangeLabel, draggedRangeFocus, events.length, focusedAnnotation, mode, presentTime, ranges.length, showEvents, showPeriods, visibleDraftRange]);
  const annotationLaneCount = Math.max(1, ...annotationLabels.map((label) => label.lane + 1));

  useLayoutEffect(() => {
    if (!onAnnotationTopOffsetChange) return;
    if (annotationLabels.length === 0) {
      onAnnotationTopOffsetChange(0);
      return;
    }
    const panelTop = chartPanel.current?.getBoundingClientRect().top;
    const labelsTop = annotationLabelsContainer.current?.getBoundingClientRect().top;
    if (panelTop === undefined || labelsTop === undefined) return;
    onAnnotationTopOffsetChange(Math.max(0, Math.round(panelTop - labelsTop)));
  }, [annotationLabels.length, annotationLaneCount, chartWidth, onAnnotationTopOffsetChange]);
  const visibleRanges = comparisonMode ? comparisonRanges : focusedAnnotation?.startsWith("event:")
    ? []
    : focusedAnnotation?.startsWith("range:")
      ? ranges.filter((range) => focusedAnnotation === `range:${range.id}`)
      : showPeriods ? ranges : [];
  const visibleEvents = comparisonMode ? [] : focusedAnnotation?.startsWith("range:")
    ? []
    : focusedAnnotation?.startsWith("event:")
      ? events.filter((event) => focusedAnnotation === `event:${event.id}`)
      : showEvents ? events : [];
  const activeAnnotation = focusedAnnotation ?? hoverFocus;
  const focusedRangeIndex = activeAnnotation?.startsWith("range:")
    ? ranges.findIndex((range) => activeAnnotation === `range:${range.id}`)
    : -1;
  const focusedEventIndex = activeAnnotation?.startsWith("event:")
    ? events.findIndex((event) => activeAnnotation === `event:${event.id}`)
    : -1;
  const selectionColor = mode === "event" || focusedEventIndex >= 0
    ? eventColor(focusedEventIndex >= 0 ? focusedEventIndex : events.length)
    : rangePalette(focusedRangeIndex >= 0 ? focusedRangeIndex : ranges.length).stroke;
  const activeRange = activeAnnotation?.startsWith("range:")
    ? ranges.find((range) => activeAnnotation === `range:${range.id}`) ?? null
    : null;
  const hoveredRegionConjunction = intersectDomains(hoveredRegionRangeIds.flatMap((id) => {
    const range = ranges.find((item) => item.id === id);
    if (!range) return [];
    const rangeDomain = rangeTimeDomain(range, presentTime);
    return rangeDomain ? [rangeDomain] : [];
  }));
  const emphasizedRange = draggedRangeFocus
    ?? (mode === "range"
      ? rangeTimeDomain(draftRange, presentTime)
      : activeRange
        ? rangeTimeDomain(activeRange, presentTime)
        : hoveredRegionConjunction);
  const dimMeasurements = mode === "range"
    || mode === "event"
    || activeAnnotation?.startsWith("event:") === true
    || emphasizedRange !== null;

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

  function renderPeriodHandle(edge: RangeEdge, slot: number) {
    const isStart = edge === "start";
    if (!isStart && ((!draftRange.end && !draftRange.openEnded)
      || (draftRange.openEnded && (presentTime < domainStart || presentTime > domainEnd)))) return null;

    const time = isStart
      ? dateTimeBoundary(draftRange.start, draftRange.startTime)
      : draftRange.openEnded
        ? presentTime
        : dateTimeBoundary(draftRange.end, draftRange.endTime, true);
    if (time === null) return null;
    const ratio = ratioForTime(time);

    return <div
      key={`period-handle-${slot}`}
      className="selection-handle selection-handle--range"
      style={{ left: `${ratio * 100}%` }}
      onPointerDown={(event) => beginHandleDrag(event, edge)}
      onPointerMove={moveRangeHandle}
      onPointerUp={finishHandleDrag}
      onPointerCancel={finishHandleDrag}
    ><span /><ChartDateTag
      active
      alignRight={ratio > 0.8}
      secondRow={!isStart}
      ariaLabel={`Period ${edge} date`}
      disabled={!isStart && draftRange.openEnded}
      value={isStart ? draftRange.start : draftRange.openEnded ? today : draftRange.end}
      timeValue={isStart ? draftRange.startTime : draftRange.openEnded ? formatTimeInput(presentTime) : draftRange.endTime}
      onChange={isStart
        ? (start) => setDraftRange((current) => ({ ...current, start }))
        : (end) => setDraftRange((current) => ({ ...current, end, openEnded: false }))}
      onTimeChange={isStart
        ? (startTime) => setDraftRange((current) => ({ ...current, startTime }))
        : (endTime) => setDraftRange((current) => ({ ...current, endTime, openEnded: false }))}
      present={!isStart ? {
        checked: draftRange.openEnded,
        onChange: () => setDraftRange((current) => ({
          ...current,
          openEnded: !current.openEnded,
          end: current.openEnded ? today : "",
          endTime: current.openEnded ? formatTimeInput(presentTime) : "",
        })),
      } : undefined}
    /></div>;
  }

  return (
    <section ref={chartPanel} className="panel chart-panel">
      <div ref={chart} className="chart-wrap" style={{ marginTop: `${annotationLaneCount * 22}px` }}>
        <div ref={annotationLabelsContainer} className="chart-annotation-labels" style={{ height: `${annotationLaneCount * 22}px` }}>
          {annotationLabels.map((label) => (
            <div
              key={label.id}
              ref={label.kind === "range" && label.focusId === focusedAnnotation ? focusedRangeLabel : undefined}
              className={`chart-annotation-label chart-annotation-label--${label.kind}${label.fullWidth ? " chart-annotation-label--range-wide" : ""}${label.draft ? " chart-annotation-label--draft" : ""}${annotationIsMuted(label.focusId) ? " chart-annotation-label--muted" : ""}`}
              role={label.focusId ? "button" : undefined}
              tabIndex={label.focusId ? 0 : undefined}
              onClick={() => label.focusId && focusAnnotation(label)}
              onKeyDown={(event) => {
                if (!label.focusId || (event.key !== "Enter" && event.key !== " ")) return;
                event.preventDefault();
                focusAnnotation(label);
              }}
              onPointerEnter={() => {
                setHoveredRegionRangeIds([]);
                if (label.focusId) setHoveredAnnotation(label.focusId);
              }}
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
                ref={focusAnnotationLabelInput}
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
              const index = displayRanges.indexOf(range);
              const visible = visibleRangeDomain(range);
              if (!visible) return null;
              const color = rangePalette(index);
              const editing = focusedAnnotation === `range:${range.id}`;
              const muted = annotationIsMuted(`range:${range.id}`);
              return <Fragment key={range.id}>
                <ReferenceArea x1={visible[0]} x2={visible[1]} fill={color.fill} fillOpacity={muted ? 0.035 : 0.14} stroke="none" />
                <ReferenceLine x={visible[0]} stroke={color.stroke} strokeWidth={2} strokeDasharray={editing ? "4 3" : undefined} strokeOpacity={muted ? 0.14 : 0.55} />
                <ReferenceLine x={visible[1]} stroke={color.stroke} strokeWidth={2} strokeDasharray={editing ? "4 3" : undefined} strokeOpacity={muted ? 0.14 : 0.55} />
              </Fragment>;
            })}
            {!comparisonMode && focusedAnnotation === null && visibleDraftRange && (
              <ReferenceArea x1={visibleDraftRange[0]} x2={visibleDraftRange[1]} fill={rangePalette(ranges.length).fill} fillOpacity={0.2} stroke="none" />
            )}
            {visibleEvents.map((event) => (
              <ReferenceLine key={event.id} x={event.time} stroke={eventColor(displayEvents.indexOf(event))} strokeWidth={2} strokeOpacity={annotationIsMuted(`event:${event.id}`) ? 0.2 : 1} />
            ))}
            {!comparisonMode && focusedAnnotation === null && mode === "event" && draftEventTime !== null && (
              <ReferenceLine x={draftEventTime} stroke={eventColor(events.length)} strokeWidth={2} strokeDasharray="4 3" />
            )}
          </ScatterChart>
        </ResponsiveContainer>
        <MeasurementCanvas
          measurements={filteredMeasurements}
          showRawReadings={measurementView === "raw"}
          sessionAggregation={sessionAggregation}
          trendMode={trendMode}
          visibleEyes={visibleEyes}
          visibleTrendEyes={visibleTrendEyes}
          domainStart={domainStart}
          domainEnd={domainEnd}
          onDomainChange={changeDomain}
          onAnnotationStart={startAnnotation}
          onAnnotationMove={moveAnnotation}
          onAnnotationEnd={finishAnnotation}
          onPlotHoverTimeChange={handlePlotHoverTimeChange}
          dimMeasurements={dimMeasurements}
          emphasizedRange={emphasizedRange}
          yMin={pressureDomain[0]}
          yMax={pressureDomain[1]}
        />
        <div
          ref={plotOverlayRef}
          className="chart-selection-layer"
          style={{ "--selection-color": selectionColor } as CSSProperties}
        >
          {hoveredRange && <>
            <div className="annotation-date-anchor" style={{ left: `${ratioForTime(hoveredPeriodStart ?? domainStart) * 100}%` }}>
              <ChartDateTag
                alignRight={ratioForTime(hoveredPeriodStart ?? domainStart) > 0.8}
                ariaLabel="Period start date"
                value={hoveredRange.start}
                timeValue={hoveredRange.startTime}
                displayValue={displayDate(hoveredRange.start)}
              />
            </div>
            {(!hoveredRange.openEnded || (presentTime >= domainStart && presentTime <= domainEnd)) && <div className="annotation-date-anchor" style={{ left: `${ratioForTime(hoveredPeriodEnd ?? domainEnd) * 100}%` }}>
              <ChartDateTag
                alignRight={ratioForTime(hoveredPeriodEnd ?? domainEnd) > 0.8}
                secondRow
                ariaLabel="Period end date"
                value={hoveredRange.openEnded ? today : hoveredRange.end}
                timeValue={hoveredRange.openEnded ? formatTimeInput(presentTime) : hoveredRange.endTime}
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
              timeValue={formatTimeInput(hoveredEvent.time)}
              displayValue={displayDate(formatDateInput(hoveredEvent.time))}
              alignRight={ratioForTime(hoveredEvent.time) > 0.8}
            />
          </div>}
          <div ref={dragPreview} className="selection-drag-preview" />
          {mode === "range" && visibleDraftRange && <div
            ref={rangePreview}
            className="selection-drag-preview selection-drag-preview--draft"
            style={{ left: `${ratioForTime(visibleDraftRange[0]) * 100}%`, width: `${(ratioForTime(visibleDraftRange[1]) - ratioForTime(visibleDraftRange[0])) * 100}%` }}
          />}
          {mode === "range" && periodHandleEdges.map(renderPeriodHandle)}
          {mode === "event" && draftEventTime !== null && <div
            className="selection-handle selection-handle--event"
            style={{ left: `${ratioForTime(draftEventTime) * 100}%` }}
            onPointerDown={(event) => beginHandleDrag(event, "event")}
            onPointerMove={moveEventHandle}
            onPointerUp={finishHandleDrag}
            onPointerCancel={finishHandleDrag}
          ><span /><ChartDateTag
            ariaLabel="Event date and time"
            className="selection-handle__date-control--event"
            active
            value={formatDateInput(draftEventTime)}
            timeValue={formatTimeInput(draftEventTime)}
            onChange={(date) => updateDraftEventDateTime(date, formatTimeInput(draftEventTime))}
            onTimeChange={(clock) => updateDraftEventDateTime(formatDateInput(draftEventTime), clock)}
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
            action={{ label: "How sessions work?", onSelect: onOpenSessionInfo }}
            pressed={measurementView === "sessions"}
            onTrigger={() => setMeasurementView("sessions")}
            onChange={(aggregation) => {
              setSessionAggregation(aggregation);
              setMeasurementView("sessions");
            }}
          />
          <button className="measurement-view-control__raw" type="button" aria-pressed={measurementView === "raw"} onClick={() => setMeasurementView("raw")}>Raw</button>
        </div>
        <button className="chart-settings-trigger" type="button" aria-pressed={mode === "trend"} onClick={onOpenTrendSettings}>
          <span>Trend</span>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 4 4 4-4 4" /></svg>
        </button>
        <div className="annotation-toggles" role="group" aria-label="Annotation visibility">
          <ChartToggle label="Periods" checked={showPeriods} ariaDisabled={comparisonMode} onChange={() => comparisonMode ? onComparisonBlocked() : setShowPeriods((current) => !current)} />
          <ChartToggle label="Events" checked={showEvents} ariaDisabled={comparisonMode} onChange={() => comparisonMode ? onComparisonBlocked() : setShowEvents((current) => !current)} />
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

import {
  Fragment,
  memo,
  useCallback,
  useEffect,
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
import {
  type Eye,
  type Measurement,
  type MeasurementView,
  type SessionAggregation,
} from "../../measurements";
import type {
  EditablePeriod,
  TimelineEvent,
  TreatmentPeriod,
} from "../../annotations";
import {
  CHART_PLOT_INSETS,
  CHART_PLOT_LEFT,
  CHART_PLOT_RIGHT,
} from "../chartLayout";
import { chartTimeTicks, formatChartTime } from "../timeAxis";
import {
  formatDateInput,
  formatTimeInput,
  parseDateTimeBoundary,
} from "../../../shared/lib/wallClock";
import {
  EyeToggleGroup,
  MaterialSymbol,
  ToggleButtonGroup,
  useDismissiblePopover,
} from "../../../shared/ui";
import {
  eventPalette,
  periodPalette,
} from "../../../shared/theme/periodPalette";
import {
  clipDomain,
  daylightBackground,
  intersectDomains,
  type TimeDomain,
} from "./chartNavigation";
import { MeasurementCanvas } from "./MeasurementCanvas";
import { HistoryHeatmap } from "../diurnal";
import { RightAxisTicks, TimeAxisTick } from "./RightAxisTicks";
import {
  ChartDateTag,
  ChartSelect,
  HeatmapControl,
  MeasurementViewControl,
  TargetControl,
  TrendControl,
} from "./controls";
import { type ChartDimming, type ChartDimmingFocus } from "./dimming";
import {
  ANNOTATION_LANE_HEIGHT,
  annotationIsKind,
  annotationKey,
  annotationLaneCount,
  layoutAnnotationLabels,
  type AnnotationKey,
  type AnnotationLabel,
} from "./annotationLayout";
import { movePeriodEdge, periodTimeDomain } from "./period";
import { useChartViewport } from "./useChartViewport";

export type ChartMode =
  "period" | "event" | "trend" | "sessions" | "heatmap" | null;
type PositionFilter = "all" | "sitting" | "reclined";

export type ChartAnnotationPreview =
  | { kind: "period"; value: TreatmentPeriod; paletteIndex: number }
  | { kind: "event"; value: TimelineEvent; paletteIndex: number };

type AnnotationDrag = { start: number; startX: number; moved: boolean };
type PeriodEdge = "start" | "end";
type HandleDrag =
  { kind: "period"; edge: PeriodEdge } | { kind: "event"; time: number };

const DAY_MS = 86_400_000;
const POSITION_FILTER_OPTIONS: readonly {
  value: PositionFilter;
  label: string;
}[] = [
  { value: "all", label: "All positions" },
  { value: "sitting", label: "Sitting" },
  { value: "reclined", label: "Laying down" },
];

function paletteIndex<T extends { id: string }>(
  values: readonly T[],
  value: T,
  fallback: number,
): number {
  const index = values.findIndex((item) => item.id === value.id);
  return index >= 0 ? index : fallback;
}

type Props = {
  measurements: Measurement[];
  visibleEyes: Record<Eye, boolean>;
  onToggleEye: (eye: Eye) => void;
  onOpenTrendInfo: () => void;
  onOpenSessionInfo: () => void;
  onOpenHeatmapInfo: () => void;
  periods: TreatmentPeriod[];
  events: TimelineEvent[];
  comparisonPeriods: TreatmentPeriod[];
  comparisonMode: boolean;
  annotationPreview: ChartAnnotationPreview | null;
  onComparisonBlocked: () => void;
  mode: ChartMode;
  onSelectPeriod: (period: Omit<EditablePeriod, "label">) => void;
  onSelectEvent: (time: number) => void;
  onEditPeriod: (period: TreatmentPeriod) => void;
  onEditEvent: (event: TimelineEvent) => void;
  onCancelEdit: () => void;
  draftPeriod: EditablePeriod;
  draftPeriodLabel: string;
  draftLabelError: string | null;
  setDraftPeriod: Dispatch<SetStateAction<EditablePeriod>>;
  draftEventLabel: string;
  onDraftEventLabel: (label: string) => void;
  draftEventTime: number | null;
  onDraftEventTime: (time: number) => void;
  today: string;
  presentTime: number;
  domain: TimeDomain;
  onDomainChange: (domain: TimeDomain) => void;
  fullDomain: TimeDomain;
  yDomain: TimeDomain;
  targetEnabled: boolean;
  targetValue: number;
  onTargetEnabledChange: (enabled: boolean) => void;
  onTargetValueChange: (value: number) => void;
};

function matchesPositionFilter(
  position: string,
  filter: PositionFilter,
): boolean {
  if (filter === "all") return true;
  const normalized = position.trim().toLowerCase();
  return filter === "sitting"
    ? normalized.includes("sitt") || normalized.includes("seat")
    : normalized.includes("supine") ||
        normalized.includes("lying") ||
        normalized.includes("laying") ||
        normalized.includes("recumbent");
}

function displayDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : "";
}

function alignDateTagToPlot(tag: HTMLElement | null, ratio: number) {
  tag?.classList.toggle("selection-handle__date-control--right", ratio > 0.8);
}

function ChartShortcuts() {
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useDismissiblePopover(root, open, () => setOpen(false));

  return (
    <div
      ref={root}
      className="chart-shortcuts"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setOpen(false);
      }}
    >
      <button
        className="chart-shortcuts__trigger"
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>Shortcuts</span>
        <MaterialSymbol name="expand_more" />
      </button>
      {open && (
        <div
          className="chart-shortcuts__menu"
          role="dialog"
          aria-label="Chart shortcuts"
        >
          <dl>
            <div className="chart-shortcuts__primary">
              <dt>
                <kbd>Ctrl</kbd> + click
              </dt>
              <dd>Add an event</dd>
            </div>
            <div className="chart-shortcuts__primary">
              <dt>
                <kbd>Ctrl</kbd> + drag
              </dt>
              <dd>Add a period</dd>
            </div>
            <div>
              <dt>Drag</dt>
              <dd>Pan the chart</dd>
            </div>
            <div>
              <dt>
                <kbd>Ctrl</kbd> + scroll
              </dt>
              <dd>Pan the chart</dd>
            </div>
            <div>
              <dt>
                <kbd>Shift</kbd> + scroll
              </dt>
              <dd>Zoom the chart</dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}

export const MeasurementsChart = memo(function MeasurementsChart({
  measurements,
  visibleEyes,
  onToggleEye,
  onOpenTrendInfo,
  onOpenSessionInfo,
  onOpenHeatmapInfo,
  periods,
  events,
  comparisonPeriods,
  comparisonMode,
  annotationPreview,
  onComparisonBlocked,
  mode,
  onSelectPeriod,
  onSelectEvent,
  onEditPeriod,
  onEditEvent,
  onCancelEdit,
  draftPeriod,
  draftPeriodLabel,
  draftLabelError,
  setDraftPeriod,
  draftEventLabel,
  onDraftEventLabel,
  draftEventTime,
  onDraftEventTime,
  today,
  presentTime,
  domain,
  onDomainChange,
  fullDomain,
  yDomain,
  targetEnabled,
  targetValue,
  onTargetEnabledChange,
  onTargetValueChange,
}: Props) {
  const {
    chartRef: chart,
    width: chartWidth,
    changeDomain,
  } = useChartViewport(domain, onDomainChange, CHART_PLOT_INSETS);
  const focusedPeriodLabel = useRef<HTMLDivElement>(null);
  const plotOverlayRef = useRef<HTMLDivElement>(null);
  const dragPreview = useRef<HTMLDivElement>(null);
  const periodPreview = useRef<HTMLDivElement>(null);
  const dragRef = useRef<AnnotationDrag | null>(null);
  const handleDrag = useRef<HandleDrag | null>(null);
  const draftPeriodRef = useRef(draftPeriod);
  const [focusedAnnotation, setFocusedAnnotation] =
    useState<AnnotationKey | null>(null);
  const [hoveredAnnotation, setHoveredAnnotation] =
    useState<AnnotationKey | null>(null);
  const [hoveredPeriodIds, setHoveredPeriodIds] = useState<string[]>([]);
  const [draggedPeriodFocus, setDraggedPeriodFocus] =
    useState<TimeDomain | null>(null);
  const [measurementView, setMeasurementView] =
    useState<MeasurementView>("sessions");
  const [sessionAggregation, setSessionAggregation] =
    useState<SessionAggregation>("median");
  const [positionFilter, setPositionFilter] = useState<PositionFilter>("all");
  const [qualityFilter, setQualityFilter] = useState("all");
  const [showPeriods, setShowPeriods] = useState(true);
  const [showEvents, setShowEvents] = useState(true);
  const [showTrend, setShowTrend] = useState(true);
  const [visibleTrendEyes, setVisibleTrendEyes] = useState<
    Record<Eye, boolean>
  >({ OD: true, OS: true });
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [renderHeatmap, setRenderHeatmap] = useState(false);
  const [heatmapClosing, setHeatmapClosing] = useState(false);
  const [heatmapEye, setHeatmapEye] = useState<Eye>("OS");
  const [showUncertainRegions, setShowUncertainRegions] = useState(true);
  const [measurementDimmingFocus, setMeasurementDimmingFocus] =
    useState<ChartDimmingFocus | null>(null);
  const [periodHandleEdges, setPeriodHandleEdges] = useState<
    readonly [PeriodEdge, PeriodEdge]
  >(["start", "end"]);
  const annotationEditorOpen = mode === "period" || mode === "event";
  const annotationPreviewActive = annotationPreview !== null;
  const annotationDisplayMode = comparisonMode || annotationPreviewActive;
  const previewFocusKey = annotationPreview
    ? annotationKey(annotationPreview.kind, annotationPreview.value.id)
    : null;
  const [domainStart, domainEnd] = domain;
  const pressureDomain = useMemo(() => {
    const lower = Math.floor(yDomain[0] / 5) * 5;
    const upper = Math.ceil(yDomain[1] / 5) * 5;
    return (
      lower === upper ? [lower - 5, upper + 5] : [lower, upper]
    ) as TimeDomain;
  }, [yDomain]);
  const pressureTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let value = pressureDomain[0]; value <= pressureDomain[1]; value += 5)
      ticks.push(value);
    return ticks;
  }, [pressureDomain]);
  const qualityOptions = useMemo(
    () =>
      [...new Set(measurements.map((measurement) => measurement.quality))].sort(
        (a, b) => a.localeCompare(b),
      ),
    [measurements],
  );
  const filteredMeasurements = useMemo(
    () =>
      measurements.filter(
        (measurement) =>
          matchesPositionFilter(measurement.position, positionFilter) &&
          (qualityFilter === "all" || measurement.quality === qualityFilter),
      ),
    [measurements, positionFilter, qualityFilter],
  );
  const timeTicks = useMemo(
    () =>
      chartTimeTicks(
        domain,
        Math.max(
          1,
          chartWidth - CHART_PLOT_INSETS.left - CHART_PLOT_INSETS.right,
        ),
      ),
    [chartWidth, domain],
  );
  const daylight = useMemo(() => daylightBackground(domain), [domain]);

  if (!handleDrag.current || handleDrag.current.kind === "event")
    draftPeriodRef.current = draftPeriod;

  const focusAnnotationLabelInput = useCallback(
    (input: HTMLInputElement | null) => {
      if (!input) return;
      input.focus();
      input.select();
    },
    [],
  );

  useEffect(() => {
    if (qualityFilter !== "all" && !qualityOptions.includes(qualityFilter))
      setQualityFilter("all");
  }, [qualityFilter, qualityOptions]);

  useEffect(() => {
    if (showHeatmap) {
      setRenderHeatmap(true);
      setHeatmapClosing(false);
      return;
    }
    if (!renderHeatmap) return;
    setHeatmapClosing(true);
    const timeout = window.setTimeout(() => {
      setRenderHeatmap(false);
      setHeatmapClosing(false);
    }, 280);
    return () => window.clearTimeout(timeout);
  }, [renderHeatmap, showHeatmap]);

  useEffect(() => {
    setHoveredAnnotation((current) => {
      if (!showPeriods && annotationIsKind(current, "period")) return null;
      if (!showEvents && annotationIsKind(current, "event")) return null;
      return current;
    });
  }, [showEvents, showPeriods]);

  const handlePlotHoverTimeChange = useCallback(
    (time: number | null) => {
      const nextIds =
        time === null ||
        annotationDisplayMode ||
        !showPeriods ||
        focusedAnnotation !== null ||
        annotationEditorOpen
          ? []
          : periods.flatMap((period) => {
              const start = parseDateTimeBoundary(
                period.start,
                period.startTime,
              );
              const end = period.openEnded
                ? presentTime
                : parseDateTimeBoundary(period.end, period.endTime, "end");
              return start !== null &&
                end !== null &&
                time >= start &&
                time <= end
                ? [period.id]
                : [];
            });
      setHoveredPeriodIds((current) =>
        current.length === nextIds.length &&
        current.every((id, index) => id === nextIds[index])
          ? current
          : nextIds,
      );
    },
    [
      annotationDisplayMode,
      annotationEditorOpen,
      focusedAnnotation,
      periods,
      presentTime,
      showPeriods,
    ],
  );

  const hoverFocus =
    previewFocusKey ??
    (!annotationEditorOpen && focusedAnnotation === null
      ? hoveredAnnotation
      : null);
  const hoveredPeriod = annotationIsKind(hoverFocus, "period")
    ? (periods.find(
        (period) => hoverFocus === annotationKey("period", period.id),
      ) ?? null)
    : null;
  const hoveredEvent = annotationIsKind(hoverFocus, "event")
    ? (events.find(
        (event) => hoverFocus === annotationKey("event", event.id),
      ) ?? null)
    : null;
  const hoveredPeriodStart = hoveredPeriod
    ? (parseDateTimeBoundary(hoveredPeriod.start, hoveredPeriod.startTime) ??
      domainStart)
    : null;
  const hoveredPeriodEnd = hoveredPeriod
    ? hoveredPeriod.openEnded
      ? presentTime
      : (parseDateTimeBoundary(
          hoveredPeriod.end,
          hoveredPeriod.endTime,
          "end",
        ) ?? domainEnd)
    : null;

  function annotationIsMuted(focusKey: AnnotationKey | undefined): boolean {
    if (hoverFocus) return hoverFocus !== focusKey;
    if (hoveredPeriodIds.length === 0) return false;
    return (
      !focusKey ||
      !annotationIsKind(focusKey, "period") ||
      !hoveredPeriodIds.some((id) => focusKey === annotationKey("period", id))
    );
  }

  useEffect(() => {
    setHoveredAnnotation(null);
    setHoveredPeriodIds([]);
    setDraggedPeriodFocus(null);
    if (mode === null) setFocusedAnnotation(null);
  }, [mode]);

  useEffect(() => {
    if (!draftLabelError) return;
    const input = chart.current?.querySelector<HTMLInputElement>(
      '.chart-annotation-label__input[aria-invalid="true"]',
    );
    input?.focus();
    input?.select();
  }, [draftLabelError]);

  function toggleTrendEye(eye: Eye) {
    const otherEye = eye === "OD" ? "OS" : "OD";
    if (visibleTrendEyes[eye] && !visibleTrendEyes[otherEye]) {
      setVisibleTrendEyes({ OD: true, OS: true });
      setShowTrend(false);
      return;
    }
    setVisibleTrendEyes((current) => ({ ...current, [eye]: !current[eye] }));
  }

  function ratioForTime(time: number): number {
    if (domainEnd <= domainStart) return 0;
    return Math.max(
      0,
      Math.min(1, (time - domainStart) / (domainEnd - domainStart)),
    );
  }

  function timeFromClientX(clientX: number): { time: number; ratio: number } {
    const bounds = plotOverlayRef.current?.getBoundingClientRect();
    if (!bounds) return { time: domainStart, ratio: 0 };
    const ratio = Math.max(
      0,
      Math.min(1, (clientX - bounds.left) / bounds.width),
    );
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

  function finishAnnotation(end: number, clientX: number) {
    if (comparisonMode) return;
    const drag = dragRef.current;
    if (!drag) return;
    const moved = drag.moved || Math.abs(clientX - drag.startX) >= 4;
    setFocusedAnnotation(null);
    setHoveredAnnotation(null);
    if (moved) {
      onSelectPeriod({
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

  function beginPeriodHandleDrag(
    event: ReactPointerEvent<HTMLDivElement>,
    edge: PeriodEdge,
  ) {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    handleDrag.current = { kind: "period", edge };
  }

  function beginEventHandleDrag(event: ReactPointerEvent<HTMLDivElement>) {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    handleDrag.current = {
      kind: "event",
      time: timeFromClientX(event.clientX).time,
    };
  }

  function movePeriodHandle(event: ReactPointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const { time, ratio } = timeFromClientX(event.clientX);
    const active = handleDrag.current;
    if (!active || active.kind !== "period") return;
    const edge = active.edge;
    const current = draftPeriodRef.current;
    const otherTime =
      edge === "start"
        ? current.openEnded
          ? presentTime
          : (parseDateTimeBoundary(current.end, current.endTime, "end") ??
            domainEnd)
        : (parseDateTimeBoundary(current.start, current.startTime) ??
          domainStart);
    const crossed = edge === "start" ? time > otherTime : time < otherTime;
    const nextEdge: PeriodEdge = crossed
      ? edge === "start"
        ? "end"
        : "start"
      : edge;
    const nextPeriod = movePeriodEdge(current, edge, time, presentTime);
    draftPeriodRef.current = nextPeriod;
    setDraftPeriod(nextPeriod);
    if (crossed) setPeriodHandleEdges(([first, second]) => [second, first]);
    handleDrag.current = { kind: "period", edge: nextEdge };
    event.currentTarget.style.left = `${ratio * 100}%`;
    const tag = event.currentTarget.querySelector<HTMLElement>(
      ".selection-handle__date-control",
    );
    const input = tag?.querySelector<HTMLInputElement>(
      ".selection-handle__date-input",
    );
    const timeInput = tag?.querySelector<HTMLInputElement>(
      ".selection-handle__time-input",
    );
    if (input) input.value = formatDateInput(time);
    if (timeInput) timeInput.value = formatTimeInput(time);
    alignDateTagToPlot(tag, ratio);
    if (periodPreview.current) {
      const otherRatio = ratioForTime(otherTime);
      periodPreview.current.style.left = `${Math.min(ratio, otherRatio) * 100}%`;
      periodPreview.current.style.width = `${Math.abs(ratio - otherRatio) * 100}%`;
    }
    const liveDomain = [
      Math.min(time, otherTime),
      Math.max(time, otherTime),
    ] as TimeDomain;
    updateFocusedPeriodLabel(liveDomain);
    setDraggedPeriodFocus(liveDomain);
  }

  function updateFocusedPeriodLabel([start, end]: TimeDomain) {
    const label = focusedPeriodLabel.current;
    if (!label) return;
    const plotWidth = Math.max(
      1,
      chartWidth - CHART_PLOT_INSETS.left - CHART_PLOT_INSETS.right,
    );
    const left = ratioForTime(start) * plotWidth;
    const spanWidth = Math.max(0, ratioForTime(end) * plotWidth - left);
    const compactWidth = Math.min(
      300,
      Math.max(72, draftPeriodLabel.length * 7 + 38),
    );
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
    const tag = event.currentTarget.querySelector<HTMLElement>(
      ".selection-handle__date-control",
    );
    const dateInput = tag?.querySelector<HTMLInputElement>(
      ".selection-handle__date-input",
    );
    const timeInput = tag?.querySelector<HTMLInputElement>(
      ".selection-handle__time-input",
    );
    if (dateInput) dateInput.value = formatDateInput(next.time);
    if (timeInput) timeInput.value = formatTimeInput(next.time);
    alignDateTagToPlot(tag, next.ratio);
  }

  function finishHandleDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const pending = handleDrag.current;
    handleDrag.current = null;
    setDraggedPeriodFocus(null);
    setPeriodHandleEdges(["start", "end"]);
    if (pending?.kind === "event") onDraftEventTime(pending.time);
  }

  function updateDraftEventDateTime(date: string, clock: string) {
    const time = parseDateTimeBoundary(date, clock);
    if (time !== null) onDraftEventTime(time);
  }

  function visiblePeriodDomain(period: EditablePeriod): TimeDomain | null {
    const periodDomain = periodTimeDomain(period, presentTime);
    return periodDomain ? clipDomain(periodDomain, domain) : null;
  }

  const visibleDraftPeriod =
    mode === "period" ? visiblePeriodDomain(draftPeriod) : null;
  const visiblePeriods = useMemo(() => {
    if (annotationPreview?.kind === "period") return [annotationPreview.value];
    if (annotationPreviewActive) return [];
    if (comparisonMode) return comparisonPeriods;
    if (annotationIsKind(focusedAnnotation, "event")) return [];
    if (annotationIsKind(focusedAnnotation, "period")) {
      return periods.filter(
        (period) => focusedAnnotation === annotationKey("period", period.id),
      );
    }
    return showPeriods ? periods : [];
  }, [
    annotationPreview,
    annotationPreviewActive,
    comparisonMode,
    comparisonPeriods,
    focusedAnnotation,
    periods,
    showPeriods,
  ]);
  const visibleEvents = useMemo(() => {
    if (annotationPreview?.kind === "event") return [annotationPreview.value];
    if (
      annotationPreviewActive ||
      comparisonMode ||
      annotationIsKind(focusedAnnotation, "period")
    )
      return [];
    if (annotationIsKind(focusedAnnotation, "event")) {
      return events.filter(
        (event) => focusedAnnotation === annotationKey("event", event.id),
      );
    }
    return showEvents ? events : [];
  }, [
    annotationPreview,
    annotationPreviewActive,
    comparisonMode,
    events,
    focusedAnnotation,
    showEvents,
  ]);
  const annotationLabels = useMemo(() => {
    const labels: AnnotationLabel[] = [];
    for (const [index, period] of visiblePeriods.entries()) {
      const focusKey = annotationKey("period", period.id);
      const editing = !annotationDisplayMode && focusedAnnotation === focusKey;
      const liveDomain = editing
        ? (draggedPeriodFocus ?? periodTimeDomain(draftPeriod, presentTime))
        : periodTimeDomain(period, presentTime);
      const start = liveDomain?.[0] ?? null;
      const end = liveDomain?.[1] ?? null;
      if (
        start !== null &&
        end !== null &&
        start <= domainEnd &&
        end >= domainStart
      ) {
        labels.push({
          id: period.id,
          focusKey:
            annotationDisplayMode && !annotationPreviewActive
              ? undefined
              : focusKey,
          kind: "period",
          text: editing ? draftPeriodLabel : period.label,
          time: Math.max(start, domainStart),
          endTime: Math.min(end, domainEnd),
          color: periodPalette(
            annotationPreview?.kind === "period" &&
              annotationPreview.value.id === period.id
              ? annotationPreview.paletteIndex
              : paletteIndex(periods, period, index),
          ).stroke,
        });
      }
    }
    for (const [index, event] of visibleEvents.entries()) {
      if (event.time >= domainStart && event.time <= domainEnd) {
        const focusKey = annotationKey("event", event.id);
        const colorIndex =
          annotationPreview?.kind === "event" &&
          annotationPreview.value.id === event.id
            ? annotationPreview.paletteIndex
            : paletteIndex(events, event, index);
        labels.push({
          id: event.id,
          focusKey,
          kind: "event",
          text: focusedAnnotation === focusKey ? draftEventLabel : event.label,
          time: event.time,
          color: eventPalette(colorIndex),
        });
      }
    }
    if (!annotationDisplayMode && mode === "period" && visibleDraftPeriod) {
      labels.push({
        id: "draft-period",
        kind: "period",
        text: draftPeriodLabel.trim() || "Period name",
        time: visibleDraftPeriod[0],
        endTime: visibleDraftPeriod[1],
        color: periodPalette(periods.length).stroke,
        draft: true,
      });
    }
    if (
      !annotationDisplayMode &&
      mode === "event" &&
      draftEventTime !== null &&
      draftEventTime >= domainStart &&
      draftEventTime <= domainEnd
    ) {
      labels.push({
        id: "draft-event",
        kind: "event",
        text: draftEventLabel.trim() || "Event name",
        time: draftEventTime,
        color: eventPalette(events.length),
        draft: true,
      });
    }

    const plotWidth = Math.max(
      1,
      chartWidth - CHART_PLOT_INSETS.left - CHART_PLOT_INSETS.right,
    );
    return layoutAnnotationLabels(
      labels,
      domain,
      plotWidth,
      focusedAnnotation,
      annotationPreviewActive,
    );
  }, [
    annotationDisplayMode,
    annotationPreview,
    annotationPreviewActive,
    chartWidth,
    domain,
    domainEnd,
    domainStart,
    draftEventLabel,
    draftEventTime,
    draftPeriod,
    draftPeriodLabel,
    draggedPeriodFocus,
    events,
    focusedAnnotation,
    mode,
    periods,
    presentTime,
    visibleDraftPeriod,
    visibleEvents,
    visiblePeriods,
  ]);
  const labelLaneCount = annotationLaneCount(annotationLabels);

  const activeAnnotation = previewFocusKey ?? focusedAnnotation ?? hoverFocus;
  const focusedPeriodIndex = annotationIsKind(activeAnnotation, "period")
    ? periods.findIndex(
        (period) => activeAnnotation === annotationKey("period", period.id),
      )
    : -1;
  const focusedEventIndex = annotationIsKind(activeAnnotation, "event")
    ? events.findIndex(
        (event) => activeAnnotation === annotationKey("event", event.id),
      )
    : -1;
  const selectionColor =
    mode === "event" || focusedEventIndex >= 0
      ? eventPalette(focusedEventIndex >= 0 ? focusedEventIndex : events.length)
      : periodPalette(
          focusedPeriodIndex >= 0 ? focusedPeriodIndex : periods.length,
        ).stroke;
  const activePeriod = annotationIsKind(activeAnnotation, "period")
    ? (periods.find(
        (period) => activeAnnotation === annotationKey("period", period.id),
      ) ?? null)
    : null;
  const hoveredPeriodIntersection = intersectDomains(
    hoveredPeriodIds.flatMap((id) => {
      const period = periods.find((item) => item.id === id);
      if (!period) return [];
      const periodDomain = periodTimeDomain(period, presentTime);
      return periodDomain ? [periodDomain] : [];
    }),
  );
  const transientEmphasizedRange =
    draggedPeriodFocus ??
    (mode === "period"
      ? periodTimeDomain(draftPeriod, presentTime)
      : activePeriod
        ? periodTimeDomain(activePeriod, presentTime)
        : hoveredPeriodIntersection);
  const emphasizedRanges = useMemo(() => {
    if (transientEmphasizedRange) return [transientEmphasizedRange];
    if (!comparisonMode) return [];
    return comparisonPeriods.flatMap((period) => {
      const periodDomain = periodTimeDomain(period, presentTime);
      return periodDomain ? [periodDomain] : [];
    });
  }, [
    comparisonMode,
    comparisonPeriods,
    presentTime,
    transientEmphasizedRange,
  ]);
  const dimMeasurements =
    mode === "period" ||
    mode === "event" ||
    annotationIsKind(activeAnnotation, "event") ||
    emphasizedRanges.length > 0;
  const dimming = useMemo<ChartDimming>(
    () => ({
      dimOutsideEmphasizedRanges: dimMeasurements,
      emphasizedRanges,
      focus: measurementDimmingFocus,
    }),
    [dimMeasurements, emphasizedRanges, measurementDimmingFocus],
  );
  const handleDimmingFocusChange = useCallback(
    (focus: ChartDimmingFocus | null) => {
      setMeasurementDimmingFocus((current) =>
        current?.id === focus?.id && current?.sessionId === focus?.sessionId
          ? current
          : focus,
      );
    },
    [],
  );

  function focusAnnotation(label: AnnotationLabel) {
    if (!label.focusKey) return;
    const focusing = focusedAnnotation !== label.focusKey;
    setFocusedAnnotation(focusing ? label.focusKey : null);
    if (!focusing) {
      onCancelEdit();
      return;
    }
    if (label.kind === "period") {
      const period = periods.find(
        (item) => annotationKey("period", item.id) === label.focusKey,
      );
      if (period) onEditPeriod(period);
    } else {
      const event = events.find(
        (item) => annotationKey("event", item.id) === label.focusKey,
      );
      if (event) onEditEvent(event);
    }
  }

  function renderPeriodHandle(edge: PeriodEdge, slot: number) {
    const isStart = edge === "start";
    if (
      !isStart &&
      ((!draftPeriod.end && !draftPeriod.openEnded) ||
        (draftPeriod.openEnded &&
          (presentTime < domainStart || presentTime > domainEnd)))
    )
      return null;

    const time = isStart
      ? parseDateTimeBoundary(draftPeriod.start, draftPeriod.startTime)
      : draftPeriod.openEnded
        ? presentTime
        : parseDateTimeBoundary(draftPeriod.end, draftPeriod.endTime, "end");
    if (time === null) return null;
    const ratio = ratioForTime(time);

    return (
      <div
        key={`period-handle-${slot}`}
        className="selection-handle selection-handle--range"
        style={{ left: `${ratio * 100}%` }}
        onPointerDown={(event) => beginPeriodHandleDrag(event, edge)}
        onPointerMove={movePeriodHandle}
        onPointerUp={finishHandleDrag}
        onPointerCancel={finishHandleDrag}
      >
        <span />
        <ChartDateTag
          active
          alignRight={ratio > 0.8}
          secondRow={!isStart}
          ariaLabel={`Period ${edge} date`}
          disabled={!isStart && draftPeriod.openEnded}
          value={
            isStart
              ? draftPeriod.start
              : draftPeriod.openEnded
                ? today
                : draftPeriod.end
          }
          timeValue={
            isStart
              ? draftPeriod.startTime
              : draftPeriod.openEnded
                ? formatTimeInput(presentTime)
                : draftPeriod.endTime
          }
          onChange={
            isStart
              ? (start) => setDraftPeriod((current) => ({ ...current, start }))
              : (end) =>
                  setDraftPeriod((current) => ({
                    ...current,
                    end,
                    openEnded: false,
                  }))
          }
          onTimeChange={
            isStart
              ? (startTime) =>
                  setDraftPeriod((current) => ({ ...current, startTime }))
              : (endTime) =>
                  setDraftPeriod((current) => ({
                    ...current,
                    endTime,
                    openEnded: false,
                  }))
          }
          present={
            !isStart
              ? {
                  checked: draftPeriod.openEnded,
                  onChange: () =>
                    setDraftPeriod((current) => ({
                      ...current,
                      openEnded: !current.openEnded,
                      end: current.openEnded ? today : "",
                      endTime: current.openEnded
                        ? formatTimeInput(presentTime)
                        : "",
                    })),
                }
              : undefined
          }
        />
      </div>
    );
  }

  return (
    <section className="panel chart-panel">
      <div
        className={`chart-composite${renderHeatmap && measurements.length > 0 ? " chart-composite--heatmap" : ""}`}
        style={{ marginTop: `${labelLaneCount * ANNOTATION_LANE_HEIGHT}px` }}
      >
        <div ref={chart} className="chart-wrap">
          <div
            className="chart-annotation-labels"
            style={{ height: `${labelLaneCount * ANNOTATION_LANE_HEIGHT}px` }}
          >
            {annotationLabels.map((label) => (
              <div
                key={`${label.kind}:${label.id}`}
                ref={
                  label.kind === "period" &&
                  label.focusKey === focusedAnnotation
                    ? focusedPeriodLabel
                    : undefined
                }
                className={`chart-annotation-label chart-annotation-label--${label.kind === "period" ? "range" : "event"}${label.fullWidth ? " chart-annotation-label--range-wide" : ""}${label.draft ? " chart-annotation-label--draft" : ""}${draftLabelError && (label.draft || label.focusKey === focusedAnnotation) ? " chart-annotation-label--warning" : ""}${annotationIsMuted(label.focusKey) ? " chart-annotation-label--muted" : ""}`}
                role={label.focusKey ? "button" : undefined}
                tabIndex={label.focusKey ? 0 : undefined}
                onClick={() => label.focusKey && focusAnnotation(label)}
                onKeyDown={(event) => {
                  if (
                    !label.focusKey ||
                    (event.key !== "Enter" && event.key !== " ")
                  )
                    return;
                  event.preventDefault();
                  focusAnnotation(label);
                }}
                onPointerEnter={() => {
                  setHoveredPeriodIds([]);
                  if (label.focusKey) setHoveredAnnotation(label.focusKey);
                }}
                onPointerLeave={() => setHoveredAnnotation(null)}
                style={{
                  left: `${label.left}px`,
                  top: `${label.lane * ANNOTATION_LANE_HEIGHT}px`,
                  width: `${label.width}px`,
                  borderColor: label.color,
                  color: label.color,
                  backgroundColor: label.color
                    ? `color-mix(in srgb, ${label.color} 16%, white)`
                    : undefined,
                }}
              >
                {label.draft || label.focusKey === focusedAnnotation ? (
                  <input
                    ref={focusAnnotationLabelInput}
                    className="chart-annotation-label__input"
                    type="text"
                    name={`${label.kind}-graph-label`}
                    aria-label={`${label.kind === "period" ? "Period" : "Event"} label`}
                    aria-invalid={
                      draftLabelError &&
                      (label.draft || label.focusKey === focusedAnnotation)
                        ? true
                        : undefined
                    }
                    aria-describedby="annotation-name-guidance"
                    autoComplete="off"
                    data-1p-ignore
                    data-lpignore="true"
                    placeholder={
                      label.kind === "period" ? "Period name" : "Event name"
                    }
                    value={
                      label.draft
                        ? label.kind === "period"
                          ? draftPeriodLabel
                          : draftEventLabel
                        : label.text
                    }
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                    onChange={(event) =>
                      label.kind === "period"
                        ? setDraftPeriod((current) => ({
                            ...current,
                            label: event.target.value,
                          }))
                        : onDraftEventLabel(event.target.value)
                    }
                  />
                ) : (
                  <span className="chart-annotation-label__text">
                    {label.text}
                  </span>
                )}
                {label.focusKey && (
                  <span
                    className="chart-annotation-label__edit"
                    aria-hidden="true"
                  >
                    <MaterialSymbol name="edit" />
                  </span>
                )}
              </div>
            ))}
          </div>
          {daylight && (
            <div
              aria-hidden="true"
              className="chart-daylight-background"
              style={{ opacity: daylight.opacity }}
            >
              {daylight.days.map((day) => (
                <div
                  key={day.start}
                  className="chart-daylight-day"
                  style={
                    {
                      left: `${((day.start - domainStart) / (domainEnd - domainStart)) * 100}%`,
                      width: `${(DAY_MS / (domainEnd - domainStart)) * 100}%`,
                      "--sunrise": `${day.sunrisePercent}%`,
                      "--sunset": `${day.sunsetPercent}%`,
                    } as CSSProperties
                  }
                />
              ))}
            </div>
          )}
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart
              margin={{ top: 12, right: CHART_PLOT_RIGHT, bottom: 10, left: 0 }}
            >
              <CartesianGrid stroke="rgb(0 0 0 / 10%)" vertical={false} />
              <XAxis
                type="number"
                dataKey="time"
                domain={domain}
                allowDataOverflow
                ticks={timeTicks}
                interval={0}
                height={30}
                tickFormatter={formatChartTime}
                tick={renderHeatmap ? false : <TimeAxisTick />}
                tickLine={!renderHeatmap}
              />
              <YAxis
                width={CHART_PLOT_LEFT}
                type="number"
                dataKey="iop"
                domain={pressureDomain}
                ticks={renderHeatmap ? pressureTicks.slice(1) : pressureTicks}
                allowDataOverflow
                allowDecimals={false}
                tick={{ fill: "var(--muted)", fontSize: 12 }}
                label={{
                  value: "mmHg",
                  angle: -90,
                  position: "insideLeft",
                  fill: "var(--muted)",
                }}
              />
              {visiblePeriods.map((period) => {
                const index =
                  annotationPreview?.kind === "period" &&
                  annotationPreview.value.id === period.id
                    ? annotationPreview.paletteIndex
                    : paletteIndex(
                        periods,
                        period,
                        visiblePeriods.indexOf(period),
                      );
                const visible = visiblePeriodDomain(period);
                if (!visible) return null;
                const color = periodPalette(index);
                const focusKey = annotationKey("period", period.id);
                const editing = focusedAnnotation === focusKey;
                const muted = annotationIsMuted(focusKey);
                return (
                  <Fragment key={period.id}>
                    <ReferenceArea
                      x1={visible[0]}
                      x2={visible[1]}
                      fill={color.fill}
                      fillOpacity={muted ? 0.035 : 0.14}
                      stroke="none"
                    />
                    <ReferenceLine
                      x={visible[0]}
                      stroke={color.stroke}
                      strokeWidth={2}
                      strokeDasharray={editing ? "4 3" : undefined}
                      strokeOpacity={muted ? 0.14 : 0.55}
                    />
                    <ReferenceLine
                      x={visible[1]}
                      stroke={color.stroke}
                      strokeWidth={2}
                      strokeDasharray={editing ? "4 3" : undefined}
                      strokeOpacity={muted ? 0.14 : 0.55}
                    />
                  </Fragment>
                );
              })}
              {!annotationDisplayMode &&
                focusedAnnotation === null &&
                visibleDraftPeriod && (
                  <ReferenceArea
                    x1={visibleDraftPeriod[0]}
                    x2={visibleDraftPeriod[1]}
                    fill={periodPalette(periods.length).fill}
                    fillOpacity={0.2}
                    stroke="none"
                  />
                )}
              {visibleEvents.map((event) => {
                const index =
                  annotationPreview?.kind === "event" &&
                  annotationPreview.value.id === event.id
                    ? annotationPreview.paletteIndex
                    : paletteIndex(events, event, visibleEvents.indexOf(event));
                return (
                  <ReferenceLine
                    key={event.id}
                    x={event.time}
                    stroke={eventPalette(index)}
                    strokeWidth={2}
                    strokeOpacity={
                      annotationIsMuted(annotationKey("event", event.id))
                        ? 0.2
                        : 1
                    }
                  />
                );
              })}
              {!annotationDisplayMode &&
                focusedAnnotation === null &&
                mode === "event" &&
                draftEventTime !== null && (
                  <ReferenceLine
                    x={draftEventTime}
                    stroke={eventPalette(events.length)}
                    strokeWidth={2}
                    strokeDasharray="4 3"
                  />
                )}
            </ScatterChart>
          </ResponsiveContainer>
          <RightAxisTicks
            className="chart-right-axis--history"
            ticks={renderHeatmap ? pressureTicks.slice(1) : pressureTicks}
            domain={pressureDomain}
          />
          <MeasurementCanvas
            measurements={filteredMeasurements}
            showRawReadings={measurementView === "raw"}
            sessionAggregation={sessionAggregation}
            showTrend={showTrend}
            visibleEyes={visibleEyes}
            visibleTrendEyes={visibleTrendEyes}
            domainStart={domainStart}
            domainEnd={domainEnd}
            onDomainChange={changeDomain}
            onAnnotationStart={startAnnotation}
            onAnnotationMove={moveAnnotation}
            onAnnotationEnd={finishAnnotation}
            onPlotHoverTimeChange={handlePlotHoverTimeChange}
            dimming={dimming}
            onDimmingFocusChange={handleDimmingFocusChange}
            yMin={pressureDomain[0]}
            yMax={pressureDomain[1]}
            targetValue={targetEnabled ? targetValue : undefined}
          />
          <div
            ref={plotOverlayRef}
            className="chart-selection-layer"
            style={{ "--selection-color": selectionColor } as CSSProperties}
          >
            {hoveredPeriod && (
              <>
                <div
                  className="annotation-date-anchor"
                  style={{
                    left: `${ratioForTime(hoveredPeriodStart ?? domainStart) * 100}%`,
                  }}
                >
                  <ChartDateTag
                    alignRight={
                      ratioForTime(hoveredPeriodStart ?? domainStart) > 0.8
                    }
                    ariaLabel="Period start date"
                    value={hoveredPeriod.start}
                    timeValue={hoveredPeriod.startTime}
                    displayValue={displayDate(hoveredPeriod.start)}
                  />
                </div>
                {(!hoveredPeriod.openEnded ||
                  (presentTime >= domainStart && presentTime <= domainEnd)) && (
                  <div
                    className="annotation-date-anchor"
                    style={{
                      left: `${ratioForTime(hoveredPeriodEnd ?? domainEnd) * 100}%`,
                    }}
                  >
                    <ChartDateTag
                      alignRight={
                        ratioForTime(hoveredPeriodEnd ?? domainEnd) > 0.8
                      }
                      secondRow
                      ariaLabel="Period end date"
                      value={
                        hoveredPeriod.openEnded ? today : hoveredPeriod.end
                      }
                      timeValue={
                        hoveredPeriod.openEnded
                          ? formatTimeInput(presentTime)
                          : hoveredPeriod.endTime
                      }
                      displayValue={displayDate(
                        hoveredPeriod.openEnded ? today : hoveredPeriod.end,
                      )}
                      present={{ checked: hoveredPeriod.openEnded }}
                    />
                  </div>
                )}
              </>
            )}
            {hoveredEvent && (
              <div
                className="annotation-date-anchor"
                style={{ left: `${ratioForTime(hoveredEvent.time) * 100}%` }}
              >
                <ChartDateTag
                  ariaLabel="Event date and time"
                  className="selection-handle__date-control--event"
                  value={formatDateInput(hoveredEvent.time)}
                  timeValue={formatTimeInput(hoveredEvent.time)}
                  displayValue={displayDate(formatDateInput(hoveredEvent.time))}
                  alignRight={ratioForTime(hoveredEvent.time) > 0.8}
                />
              </div>
            )}
            <div ref={dragPreview} className="selection-drag-preview" />
            {mode === "period" && visibleDraftPeriod && (
              <div
                ref={periodPreview}
                className="selection-drag-preview selection-drag-preview--draft"
                style={{
                  left: `${ratioForTime(visibleDraftPeriod[0]) * 100}%`,
                  width: `${(ratioForTime(visibleDraftPeriod[1]) - ratioForTime(visibleDraftPeriod[0])) * 100}%`,
                }}
              />
            )}
            {mode === "period" && periodHandleEdges.map(renderPeriodHandle)}
            {mode === "event" && draftEventTime !== null && (
              <div
                className="selection-handle selection-handle--event"
                style={{ left: `${ratioForTime(draftEventTime) * 100}%` }}
                onPointerDown={beginEventHandleDrag}
                onPointerMove={moveEventHandle}
                onPointerUp={finishHandleDrag}
                onPointerCancel={finishHandleDrag}
              >
                <span />
                <ChartDateTag
                  ariaLabel="Event date and time"
                  className="selection-handle__date-control--event"
                  active
                  value={formatDateInput(draftEventTime)}
                  timeValue={formatTimeInput(draftEventTime)}
                  onChange={(date) =>
                    updateDraftEventDateTime(
                      date,
                      formatTimeInput(draftEventTime),
                    )
                  }
                  onTimeChange={(clock) =>
                    updateDraftEventDateTime(
                      formatDateInput(draftEventTime),
                      clock,
                    )
                  }
                  alignRight={ratioForTime(draftEventTime) > 0.8}
                />
              </div>
            )}
          </div>
        </div>
        {renderHeatmap && measurements.length > 0 && (
          <HistoryHeatmap
            measurements={filteredMeasurements}
            measurementView={measurementView}
            sessionAggregation={sessionAggregation}
            eye={heatmapEye}
            domain={domain}
            fullDomain={fullDomain}
            timeTicks={timeTicks}
            closing={heatmapClosing}
            showUncertainRegions={showUncertainRegions}
            dimming={dimming}
            onDomainChange={changeDomain}
          />
        )}
      </div>
      <div
        className="chart-toolbar"
        role="group"
        aria-label="History chart controls"
      >
        <ChartShortcuts />
        <div
          className="chart-filters"
          role="group"
          aria-label="Measurement filters"
        >
          <ChartSelect
            className="chart-filter chart-filter--position"
            label="Position"
            value={positionFilter}
            options={POSITION_FILTER_OPTIONS}
            onChange={setPositionFilter}
          />
          <ChartSelect
            className="chart-filter chart-filter--quality"
            label="Quality"
            value={qualityFilter}
            options={[
              { value: "all", label: "All qualities" },
              ...qualityOptions.map((quality) => ({
                value: quality,
                label: quality,
              })),
            ]}
            onChange={setQualityFilter}
          />
        </div>
        <MeasurementViewControl
          label="History chart measurement view"
          view={measurementView}
          aggregation={sessionAggregation}
          onViewChange={setMeasurementView}
          onAggregationChange={setSessionAggregation}
          onOpenExplanation={onOpenSessionInfo}
        />
        <TargetControl
          enabled={targetEnabled}
          value={targetValue}
          onEnabledChange={onTargetEnabledChange}
          onValueChange={onTargetValueChange}
        />
        <TrendControl
          visible={showTrend}
          eyes={visibleTrendEyes}
          onToggleVisible={() => setShowTrend((current) => !current)}
          onToggleEye={toggleTrendEye}
          onOpenExplanation={onOpenTrendInfo}
        />
        <HeatmapControl
          visible={showHeatmap}
          eye={heatmapEye}
          uncertainRegions={showUncertainRegions}
          onToggleVisible={() => setShowHeatmap((current) => !current)}
          onEyeChange={setHeatmapEye}
          onToggleUncertainRegions={() =>
            setShowUncertainRegions((current) => !current)
          }
          onOpenExplanation={onOpenHeatmapInfo}
        />
        <ToggleButtonGroup
          className="annotation-toggles"
          label="Annotation visibility"
          options={[
            {
              value: "periods",
              label: "Periods",
              checked: showPeriods,
              ariaDisabled: comparisonMode,
            },
            {
              value: "events",
              label: "Events",
              checked: showEvents,
              ariaDisabled: comparisonMode,
            },
          ]}
          onChange={(value) => {
            if (comparisonMode) {
              onComparisonBlocked();
            } else if (value === "periods") {
              setShowPeriods((current) => !current);
            } else {
              setShowEvents((current) => !current);
            }
          }}
        />
        <EyeToggleGroup
          mode="multiple"
          label="Measurement eyes"
          value={visibleEyes}
          onChange={onToggleEye}
        />
      </div>
    </section>
  );
});

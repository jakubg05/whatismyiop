import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  aggregateMeasurementSessions,
  type Eye,
  type Measurement,
  type SessionAggregation,
  type SessionPoint,
} from "../../../measurements";
import { CHART_PLOT_INSETS } from "../../shared/chartLayout";
import { panDomain, type TimeDomain } from "../chart/chartNavigation";
import { TargetLineOverlay } from "../chart/ChartControls";
import {
  chartVisibilityAlpha,
  type ChartDimming,
  type ChartDimmingFocus,
} from "../chart/dimming";
import {
  buildTrendSeries,
  interpolateTrend,
  splitTrendSegment,
  trendEstimatesForDomain,
  type EyeTrend,
  type TrendEstimate,
} from "../trend/trend";
import { MeasurementTooltip } from "./MeasurementTooltip";
import {
  createPlotProjection,
  lowerBoundByTime,
  positionMeasurementTooltip,
  positionTrendTooltip,
  timeIndexRange,
  type CanvasMeasurementPoint,
  type CanvasPoint,
  type PositionedCanvasPoint,
} from "./measurementCanvasModel";

type Props = {
  measurements: Measurement[];
  showRawReadings: boolean;
  sessionAggregation: SessionAggregation;
  showTrend: boolean;
  visibleEyes: Record<Eye, boolean>;
  visibleTrendEyes: Record<Eye, boolean>;
  domainStart: number;
  domainEnd: number;
  onDomainChange: (domain: TimeDomain) => void;
  onAnnotationStart: (time: number, clientX: number) => void;
  onAnnotationMove: (time: number, clientX: number) => void;
  onAnnotationEnd: (time: number, clientX: number) => void;
  onPlotHoverTimeChange: (time: number | null) => void;
  dimming: ChartDimming;
  onDimmingFocusChange: (focus: ChartDimmingFocus | null) => void;
  yMin: number;
  yMax: number;
  targetValue?: number;
};

type PanGesture = {
  pointerId: number;
  x: number;
  domain: TimeDomain;
  moved: boolean;
  point: PositionedCanvasPoint | null;
};
type AnnotationDrag = { pointerId: number };
type NavigationModifier = "annotate" | "zoom" | null;
const COLORS = { OD: "#a63d74", OS: "#3f7d4e" } as const;
const HIT_RADIUS = 12;
const RAW_RADIUS = 2;
const SESSION_RADIUS = 4;
const COLLIDING_SESSION_GAP = 2;
const SESSION_POINT_SEPARATION = SESSION_RADIUS * 2 + COLLIDING_SESSION_GAP;

export function MeasurementCanvas({
  measurements,
  showRawReadings,
  sessionAggregation,
  showTrend,
  visibleEyes,
  visibleTrendEyes,
  domainStart,
  domainEnd,
  onDomainChange,
  onAnnotationStart,
  onAnnotationMove,
  onAnnotationEnd,
  onPlotHoverTimeChange,
  dimming,
  onDimmingFocusChange,
  yMin,
  yMax,
  targetValue,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const panGesture = useRef<PanGesture | null>(null);
  const annotationDrag = useRef<AnnotationDrag | null>(null);
  const currentDomain = useRef<TimeDomain>([domainStart, domainEnd]);
  const pendingDomain = useRef<TimeDomain | null>(null);
  const domainChangeFrame = useRef<number | null>(null);
  const redraw = useRef<(() => void) | null>(null);
  const visibilityFrame = useRef<number | null>(null);
  const visibilityAlphaAt = useRef<
    (
      time: number,
      pointId: string,
      pointSessionId: number | null,
      baseAlpha: number,
    ) => number
  >((_time, _pointId, _pointSessionId, baseAlpha) => baseAlpha);
  const viewProgress = useRef(0);
  const selectionPop = useRef(0);
  const animatedSelectionPulse = useRef(0);
  const [hovered, setHovered] = useState<PositionedCanvasPoint | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<CanvasPoint | null>(null);
  const [selectionPulse, setSelectionPulse] = useState(0);
  const [navigating, setNavigating] = useState(false);
  const [navigationModifier, setNavigationModifier] =
    useState<NavigationModifier>(null);
  const visibleMeasurements = useMemo(
    () => measurements.filter((measurement) => visibleEyes[measurement.eye]),
    [measurements, visibleEyes],
  );
  const sessionPoints = useMemo(
    () => aggregateMeasurementSessions(measurements, sessionAggregation),
    [measurements, sessionAggregation],
  );
  const visibleSessionPoints = useMemo(
    () => sessionPoints.filter((point) => visibleEyes[point.eye]),
    [sessionPoints, visibleEyes],
  );
  const trendSeries = useMemo(
    () =>
      showTrend
        ? buildTrendSeries(
            measurements,
            showRawReadings ? "raw" : "sessions",
            sessionAggregation,
          ).filter((series) => visibleTrendEyes[series.eye])
        : [],
    [
      measurements,
      sessionAggregation,
      showRawReadings,
      showTrend,
      visibleTrendEyes,
    ],
  );
  const bilateralSessionIds = useMemo(() => {
    const eyeCounts = new Map<number, number>();
    for (const point of sessionPoints)
      eyeCounts.set(point.sessionId, (eyeCounts.get(point.sessionId) ?? 0) + 1);
    return new Set(
      [...eyeCounts.entries()]
        .filter(([, count]) => count > 1)
        .map(([sessionId]) => sessionId),
    );
  }, [sessionPoints]);
  const chartPoints = useMemo<CanvasMeasurementPoint[]>(
    () =>
      [
        ...visibleMeasurements.map((measurement) => ({
          kind: "raw" as const,
          id: `raw:${measurement.sourceRow}:${measurement.eye}`,
          time: measurement.time,
          eye: measurement.eye,
          iop: measurement.iop,
          measurement,
        })),
        ...visibleSessionPoints.map((session) => ({
          kind: "session" as const,
          id: `session:${session.sessionId}:${session.eye}`,
          time: session.time,
          eye: session.eye,
          iop: session.iop,
          session,
        })),
      ].sort((a, b) => a.time - b.time),
    [visibleMeasurements, visibleSessionPoints],
  );
  const sessionPointBySourceRow = useMemo(() => {
    const points = new Map<number, Extract<CanvasPoint, { kind: "session" }>>();
    for (const point of chartPoints) {
      if (point.kind !== "session") continue;
      for (const measurement of point.session.measurements)
        points.set(measurement.sourceRow, point);
    }
    return points;
  }, [chartPoints]);
  const positionedSelectedPoint = selectedPoint
    ? positionPoint(selectedPoint)
    : null;
  const focusedPoint = hovered ?? positionedSelectedPoint;
  const focusTarget = hovered?.point ?? selectedPoint;
  const focusedPointId = focusTarget?.id ?? null;
  const focusedSessionId =
    focusTarget?.kind === "session" ? focusTarget.session.sessionId : null;
  const focusedTrendEye =
    focusTarget?.kind === "trend" ? focusTarget.eye : null;
  const selectedPointId = selectedPoint?.id ?? null;
  const focusedSessionPoints = useMemo(
    () =>
      focusedSessionId !== null
        ? sessionPoints.filter((point) => point.sessionId === focusedSessionId)
        : [],
    [focusedSessionId, sessionPoints],
  );
  currentDomain.current = [domainStart, domainEnd];

  useEffect(() => {
    onDimmingFocusChange(
      focusedPointId === null
        ? null
        : { id: focusedPointId, sessionId: focusedSessionId },
    );
  }, [focusedPointId, focusedSessionId, onDimmingFocusChange]);

  function sessionCollisionOffset(
    point: Pick<SessionPoint, "sessionId" | "eye">,
    baseX: number,
    plotRight: number,
  ): number {
    if (!bilateralSessionIds.has(point.sessionId)) return 0;
    const separation = SESSION_POINT_SEPARATION;
    if (baseX - separation / 2 < CHART_PLOT_INSETS.left)
      return point.eye === "OD" ? 0 : separation;
    if (baseX + separation / 2 > plotRight)
      return point.eye === "OD" ? -separation : 0;
    return point.eye === "OD" ? -separation / 2 : separation / 2;
  }

  function pointCollisionOffset(
    point: CanvasPoint,
    baseX: number,
    plotRight: number,
  ): number {
    return point.kind === "session"
      ? sessionCollisionOffset(point.session, baseX, plotRight)
      : 0;
  }

  function scheduleDomain(nextDomain: TimeDomain) {
    currentDomain.current = nextDomain;
    pendingDomain.current = nextDomain;
    if (domainChangeFrame.current !== null) return;
    domainChangeFrame.current = window.requestAnimationFrame(() => {
      domainChangeFrame.current = null;
      if (pendingDomain.current) onDomainChange(pendingDomain.current);
      pendingDomain.current = null;
    });
  }

  useEffect(
    () => () => {
      if (domainChangeFrame.current !== null)
        window.cancelAnimationFrame(domainChangeFrame.current);
    },
    [],
  );

  useEffect(() => {
    setHovered(null);
    setSelectedPoint(null);
  }, [
    measurements,
    sessionAggregation,
    showRawReadings,
    showTrend,
    visibleEyes,
    visibleTrendEyes,
  ]);

  useEffect(() => {
    function updateModifier(event: KeyboardEvent) {
      const nextModifier: NavigationModifier = event.shiftKey
        ? "zoom"
        : event.ctrlKey
          ? "annotate"
          : null;
      setNavigationModifier(nextModifier);
      if (nextModifier) {
        setHovered(null);
      }
    }

    function clearModifier() {
      setNavigationModifier(null);
    }

    window.addEventListener("keydown", updateModifier);
    window.addEventListener("keyup", updateModifier);
    window.addEventListener("blur", clearModifier);
    return () => {
      window.removeEventListener("keydown", updateModifier);
      window.removeEventListener("keyup", updateModifier);
      window.removeEventListener("blur", clearModifier);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const targetCanvas = canvas;

    function draw() {
      const width = targetCanvas.clientWidth;
      const height = targetCanvas.clientHeight;
      if (
        width <= CHART_PLOT_INSETS.left + CHART_PLOT_INSETS.right ||
        height <= CHART_PLOT_INSETS.top + CHART_PLOT_INSETS.bottom
      )
        return;

      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const renderWidth = Math.round(width * pixelRatio);
      const renderHeight = Math.round(height * pixelRatio);
      if (targetCanvas.width !== renderWidth) targetCanvas.width = renderWidth;
      if (targetCanvas.height !== renderHeight)
        targetCanvas.height = renderHeight;
      const context = targetCanvas.getContext("2d");
      if (!context) return;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, width, height);

      const projection = createPlotProjection(
        width,
        height,
        [domainStart, domainEnd],
        [yMin, yMax],
        CHART_PLOT_INSETS,
      );
      const { plotWidth, plotHeight } = projection;
      const emphasizedRangeBoundaries = dimming.emphasizedRanges.flat();
      const progress = viewProgress.current;
      const rawRadius = RAW_RADIUS + (SESSION_RADIUS - RAW_RADIUS) * progress;
      const sessionRadius = SESSION_RADIUS;
      const rawAlpha = 0.92;
      const sessionAlpha = 0.92 * (1 - progress);
      if (focusedSessionId !== null) {
        for (const point of focusedSessionPoints) {
          if (point.measurements.length < 2) continue;
          const values = point.measurements.map(
            (measurement) => measurement.iop,
          );
          const minimum = Math.min(...values);
          const maximum = Math.max(...values);
          const baseX = projection.xForTime(point.time);
          const x =
            baseX +
            sessionCollisionOffset(
              point,
              baseX,
              width - CHART_PLOT_INSETS.right,
            );
          const yMinimum = projection.yForValue(minimum);
          const yMaximum = projection.yForValue(maximum);

          context.globalAlpha = visibilityAlphaAt.current(
            point.time,
            `session:${point.sessionId}:${point.eye}`,
            point.sessionId,
            1,
          );
          context.strokeStyle = COLORS[point.eye];
          context.lineWidth = 1.5;
          context.beginPath();
          context.moveTo(x, yMaximum);
          context.lineTo(x, yMinimum);
          context.moveTo(x - 4, yMaximum);
          context.lineTo(x + 4, yMaximum);
          context.moveTo(x - 4, yMinimum);
          context.lineTo(x + 4, yMinimum);
          context.stroke();
        }
      }
      const firstVisibleIndex = lowerBoundByTime(chartPoints, domainStart);
      for (
        let index = firstVisibleIndex;
        index < chartPoints.length;
        index += 1
      ) {
        const point = chartPoints[index];
        if (point.time > domainEnd) break;
        const baseX = projection.xForTime(point.time);
        const x =
          baseX +
          pointCollisionOffset(point, baseX, width - CHART_PLOT_INSETS.right);
        const y = projection.yForValue(point.iop);
        const pointSessionId =
          point.kind === "session"
            ? point.session.sessionId
            : sessionPointBySourceRow.get(point.measurement.sourceRow)?.session
                .sessionId;
        const radius =
          (point.kind === "session" ? sessionRadius : rawRadius) *
          (selectedPointId === point.id ? 1 + selectionPop.current : 1);
        const baseAlpha = point.kind === "session" ? sessionAlpha : rawAlpha;

        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.globalAlpha = visibilityAlphaAt.current(
          point.time,
          point.id,
          pointSessionId ?? null,
          baseAlpha,
        );
        context.fillStyle = COLORS[point.eye];
        context.fill();
      }

      context.save();
      context.beginPath();
      context.rect(
        CHART_PLOT_INSETS.left,
        CHART_PLOT_INSETS.top,
        plotWidth,
        plotHeight,
      );
      context.clip();
      for (const series of trendSeries) {
        const visible = trendEstimatesForDomain(
          series.estimates,
          domainStart,
          domainEnd,
        );
        if (visible.length < 2) continue;
        const showCertaintyBand = focusedTrendEye === series.eye;
        const trendId = `trend:${series.eye}`;

        context.fillStyle = COLORS[series.eye];
        context.strokeStyle = COLORS[series.eye];
        context.lineWidth = 1.65;
        context.lineCap = "round";
        context.lineJoin = "round";
        const strokeSegments: Array<{
          left: TrendEstimate;
          right: TrendEstimate;
          alpha: number;
          dashed: boolean;
        }> = [];
        for (let index = 1; index < visible.length; index += 1) {
          const left = visible[index - 1];
          const right = visible[index];
          for (const [segmentLeft, segmentRight] of splitTrendSegment(
            left,
            right,
            emphasizedRangeBoundaries,
          )) {
            const midpoint =
              segmentLeft.time + (segmentRight.time - segmentLeft.time) / 2;
            if (showCertaintyBand) {
              context.globalAlpha = visibilityAlphaAt.current(
                midpoint,
                trendId,
                null,
                0.1,
              );
              context.beginPath();
              context.moveTo(
                projection.xForTime(segmentLeft.time),
                projection.yForValue(segmentLeft.upper),
              );
              context.lineTo(
                projection.xForTime(segmentRight.time),
                projection.yForValue(segmentRight.upper),
              );
              context.lineTo(
                projection.xForTime(segmentRight.time),
                projection.yForValue(segmentRight.lower),
              );
              context.lineTo(
                projection.xForTime(segmentLeft.time),
                projection.yForValue(segmentLeft.lower),
              );
              context.closePath();
              context.fill();
            }

            strokeSegments.push({
              left: segmentLeft,
              right: segmentRight,
              alpha: visibilityAlphaAt.current(midpoint, trendId, null, 1),
              dashed: !(segmentLeft.supported && segmentRight.supported),
            });
          }
        }

        let run: typeof strokeSegments = [];
        const strokeRun = () => {
          if (run.length === 0) return;
          // Repaint the same path a few times while preserving its intended
          // opacity. This firms up antialiased edge pixels so annotation rules
          // behind the canvas cannot show through as tiny breaks in the trend.
          const strokePasses = 3;
          context.globalAlpha =
            1 - Math.pow(1 - run[0].alpha, 1 / strokePasses);
          context.setLineDash(run[0].dashed ? [14, 8] : []);
          context.beginPath();
          context.moveTo(
            projection.xForTime(run[0].left.time),
            projection.yForValue(run[0].left.iop),
          );
          for (const segment of run)
            context.lineTo(
              projection.xForTime(segment.right.time),
              projection.yForValue(segment.right.iop),
            );
          for (let pass = 0; pass < strokePasses; pass += 1) context.stroke();
          run = [];
        };

        for (const segment of strokeSegments) {
          const previous = run.at(-1);
          const continuesRun =
            previous &&
            previous.right.time === segment.left.time &&
            previous.dashed === segment.dashed &&
            Math.abs(previous.alpha - segment.alpha) < 1e-6;
          if (!continuesRun) strokeRun();
          run.push(segment);
        }
        strokeRun();
        context.setLineDash([]);
      }
      context.restore();

      context.globalAlpha = 1;
    }

    redraw.current = draw;

    const targetProgress = showRawReadings ? 1 : 0;
    const startProgress = viewProgress.current;
    const startedAt = performance.now();
    const animateSelection = selectionPulse !== animatedSelectionPulse.current;
    if (animateSelection) animatedSelectionPulse.current = selectionPulse;
    let viewFrame: number | null = null;

    function animate(now: number) {
      const elapsed = Math.min(1, (now - startedAt) / 240);
      const eased = 1 - (1 - elapsed) ** 3;
      viewProgress.current =
        startProgress + (targetProgress - startProgress) * eased;
      selectionPop.current = animateSelection
        ? Math.sin(Math.PI * elapsed) * 0.35
        : 0;
      draw();
      if (elapsed < 1 && (startProgress !== targetProgress || animateSelection))
        viewFrame = window.requestAnimationFrame(animate);
    }

    if (startProgress === targetProgress && !animateSelection) {
      selectionPop.current = 0;
      draw();
    } else {
      viewFrame = window.requestAnimationFrame(animate);
    }
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => {
      if (redraw.current === draw) redraw.current = null;
      observer.disconnect();
      if (viewFrame !== null) window.cancelAnimationFrame(viewFrame);
    };
  }, [
    bilateralSessionIds,
    chartPoints,
    dimming.emphasizedRanges,
    domainEnd,
    domainStart,
    focusedSessionId,
    focusedSessionPoints,
    focusedTrendEye,
    selectedPointId,
    selectionPulse,
    sessionPointBySourceRow,
    showRawReadings,
    trendSeries,
    yMax,
    yMin,
  ]);

  useEffect(() => {
    if (visibilityFrame.current !== null)
      window.cancelAnimationFrame(visibilityFrame.current);
    const fromAlpha = visibilityAlphaAt.current;
    const targetAlpha = (
      time: number,
      pointId: string,
      pointSessionId: number | null,
      baseAlpha: number,
    ) =>
      chartVisibilityAlpha(dimming, time, pointId, pointSessionId, baseAlpha);
    const startedAt = performance.now();

    function animate(now: number) {
      const progress = Math.min(1, (now - startedAt) / 220);
      const eased = 1 - (1 - progress) ** 3;
      visibilityAlphaAt.current = (
        time,
        pointId,
        pointSessionId,
        baseAlpha,
      ) => {
        const from = fromAlpha(time, pointId, pointSessionId, baseAlpha);
        return (
          from +
          (targetAlpha(time, pointId, pointSessionId, baseAlpha) - from) * eased
        );
      };
      redraw.current?.();
      if (progress < 1)
        visibilityFrame.current = window.requestAnimationFrame(animate);
      else {
        visibilityAlphaAt.current = targetAlpha;
        visibilityFrame.current = null;
      }
    }

    visibilityFrame.current = window.requestAnimationFrame(animate);
    return () => {
      if (visibilityFrame.current !== null)
        window.cancelAnimationFrame(visibilityFrame.current);
      visibilityFrame.current = null;
    };
  }, [dimming]);

  function chartGeometry(canvas: HTMLCanvasElement) {
    const bounds = canvas.getBoundingClientRect();
    return {
      bounds,
      projection: createPlotProjection(
        bounds.width,
        bounds.height,
        [domainStart, domainEnd],
        [yMin, yMax],
        CHART_PLOT_INSETS,
      ),
    };
  }

  function positionPoint(point: CanvasPoint): PositionedCanvasPoint | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const projection = createPlotProjection(
      width,
      height,
      [domainStart, domainEnd],
      [yMin, yMax],
      CHART_PLOT_INSETS,
    );
    const baseX = projection.xForTime(point.time);
    const plotX = baseX - CHART_PLOT_INSETS.left;
    const x =
      baseX +
      pointCollisionOffset(point, baseX, width - CHART_PLOT_INSETS.right);
    const y = projection.yForValue(point.iop);
    const tooltip =
      point.kind === "trend"
        ? positionTrendTooltip(
            plotX,
            y - CHART_PLOT_INSETS.top,
            projection.plotWidth,
          )
        : positionMeasurementTooltip(
            x - CHART_PLOT_INSETS.left,
            y - CHART_PLOT_INSETS.top,
            projection.plotWidth,
            projection.plotHeight,
          );
    return {
      point,
      ...tooltip,
    };
  }

  function startNavigation(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0) return;
    const { bounds, projection } = chartGeometry(event.currentTarget);
    const x = event.clientX - bounds.left;
    if (
      x < CHART_PLOT_INSETS.left ||
      x > bounds.width - CHART_PLOT_INSETS.right
    )
      return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    if (event.ctrlKey) {
      setSelectedPoint(null);
      const ratio = projection.ratioForX(x);
      annotationDrag.current = { pointerId: event.pointerId };
      onAnnotationStart(
        domainStart + ratio * (domainEnd - domainStart),
        event.clientX,
      );
      return;
    }
    panGesture.current = {
      pointerId: event.pointerId,
      x,
      domain: currentDomain.current,
      moved: false,
      point: nearestInteractivePointAt(
        event.currentTarget,
        event.clientX,
        event.clientY,
      ),
    };
  }

  function moveNavigation(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (annotationDrag.current?.pointerId === event.pointerId) {
      onPlotHoverTimeChange(null);
      const { bounds, projection } = chartGeometry(event.currentTarget);
      const ratio = projection.ratioForX(event.clientX - bounds.left);
      onAnnotationMove(
        domainStart + ratio * (domainEnd - domainStart),
        event.clientX,
      );
      return;
    }
    const activeDrag = panGesture.current;
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) {
      if (event.ctrlKey || event.shiftKey) {
        setHovered(null);
        onPlotHoverTimeChange(null);
        return;
      }
      findNearest(event);
      return;
    }

    const { bounds, projection } = chartGeometry(event.currentTarget);
    const x = event.clientX - bounds.left;
    if (!activeDrag.moved) {
      if (Math.abs(activeDrag.x - x) < 4) return;
      activeDrag.moved = true;
      setHovered(null);
      onPlotHoverTimeChange(null);
      setNavigating(true);
    }
    const offset =
      ((activeDrag.x - x) / projection.plotWidth) *
      (activeDrag.domain[1] - activeDrag.domain[0]);
    scheduleDomain(panDomain(activeDrag.domain, offset, null));
  }

  function finishNavigation(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (annotationDrag.current?.pointerId === event.pointerId) {
      const { bounds, projection } = chartGeometry(event.currentTarget);
      const ratio = projection.ratioForX(event.clientX - bounds.left);
      annotationDrag.current = null;
      onAnnotationEnd(
        domainStart + ratio * (domainEnd - domainStart),
        event.clientX,
      );
      return;
    }
    if (panGesture.current?.pointerId !== event.pointerId) return;
    const completedDrag = panGesture.current;
    panGesture.current = null;
    setNavigating(false);
    if (!completedDrag.moved) {
      const pressedPoint = completedDrag.point;
      if (pressedPoint && pressedPoint.point.id !== selectedPoint?.id) {
        setSelectedPoint(pressedPoint.point);
        setSelectionPulse((current) => current + 1);
      } else if (!pressedPoint) {
        setSelectedPoint(null);
      }
      setHovered(null);
    }
  }

  function nearestTrendAt(
    canvas: HTMLCanvasElement,
    clientX: number,
    clientY: number,
    trendId?: string,
  ): PositionedCanvasPoint | null {
    const { bounds, projection } = chartGeometry(canvas);
    const pointerX = clientX - bounds.left;
    const pointerY = clientY - bounds.top;
    if (!projection.contains(pointerX, pointerY)) return null;

    const time = projection.timeForX(pointerX);
    let nearest: {
      series: EyeTrend;
      value: number;
      y: number;
      distance: number;
    } | null = null;
    for (const series of trendSeries) {
      if (trendId && `trend:${series.eye}` !== trendId) continue;
      const value = interpolateTrend(series.estimates, time);
      if (value === null) continue;
      const y = projection.yForValue(value);
      const distance = Math.abs(y - pointerY);
      if (distance <= HIT_RADIUS && (!nearest || distance < nearest.distance))
        nearest = { series, value, y, distance };
    }
    return nearest
      ? {
          point: {
            kind: "trend",
            id: `trend:${nearest.series.eye}`,
            time,
            eye: nearest.series.eye,
            iop: nearest.value,
            trend: nearest.series,
          },
          ...positionTrendTooltip(
            pointerX - CHART_PLOT_INSETS.left,
            nearest.y - CHART_PLOT_INSETS.top,
            projection.plotWidth,
          ),
        }
      : null;
  }

  function nearestInteractivePointAt(
    canvas: HTMLCanvasElement,
    clientX: number,
    clientY: number,
  ): PositionedCanvasPoint | null {
    return (
      nearestTrendAt(canvas, clientX, clientY) ??
      nearestPointAt(canvas, clientX, clientY)
    );
  }

  function nearestPointAt(
    canvas: HTMLCanvasElement,
    clientX: number,
    clientY: number,
  ): PositionedCanvasPoint | null {
    const { bounds, projection } = chartGeometry(canvas);
    const pointerX = clientX - bounds.left;
    const pointerY = clientY - bounds.top;
    if (!projection.contains(pointerX, pointerY)) return null;
    if (chartPoints.length === 0) return null;

    const [start, end] = timeIndexRange(
      chartPoints,
      projection.timeForX(pointerX - HIT_RADIUS - SESSION_POINT_SEPARATION),
      projection.timeForX(pointerX + HIT_RADIUS + SESSION_POINT_SEPARATION),
    );
    let best: PositionedCanvasPoint | null = null;
    let bestDistanceSquared = HIT_RADIUS * HIT_RADIUS;

    for (let index = start; index < end; index += 1) {
      const point = chartPoints[index];
      if (showRawReadings && point.kind !== "raw") continue;
      const baseX = projection.xForTime(point.time);
      const x =
        baseX +
        pointCollisionOffset(
          point,
          baseX,
          bounds.width - CHART_PLOT_INSETS.right,
        );
      if (Math.abs(x - pointerX) > HIT_RADIUS) continue;
      const y = projection.yForValue(point.iop);
      const distanceSquared = (x - pointerX) ** 2 + (y - pointerY) ** 2;
      if (distanceSquared <= bestDistanceSquared) {
        bestDistanceSquared = distanceSquared;
        const tooltip = positionMeasurementTooltip(
          x - CHART_PLOT_INSETS.left,
          y - CHART_PLOT_INSETS.top,
          projection.plotWidth,
          projection.plotHeight,
        );
        const tooltipPoint =
          !showRawReadings && point.kind === "raw"
            ? sessionPointBySourceRow.get(point.measurement.sourceRow)
            : point;
        if (!tooltipPoint) continue;
        best = {
          point: tooltipPoint,
          ...tooltip,
        };
      }
    }
    return best;
  }

  function findNearest(event: ReactPointerEvent<HTMLCanvasElement>) {
    const { bounds, projection } = chartGeometry(event.currentTarget);
    const pointerX = event.clientX - bounds.left;
    const pointerY = event.clientY - bounds.top;
    const insidePlot = projection.contains(pointerX, pointerY);
    onPlotHoverTimeChange(insidePlot ? projection.timeForX(pointerX) : null);
    if (selectedPoint) {
      setHovered(null);
      if (insidePlot && selectedPoint.kind === "trend") {
        const selectedTrend = nearestTrendAt(
          event.currentTarget,
          event.clientX,
          event.clientY,
          selectedPoint.id,
        );
        if (selectedTrend) setSelectedPoint(selectedTrend.point);
      }
      return;
    }
    const nearest = insidePlot
      ? nearestInteractivePointAt(
          event.currentTarget,
          event.clientX,
          event.clientY,
        )
      : null;
    setHovered(nearest);
  }

  return (
    <div className="measurement-canvas-layer">
      <canvas
        ref={canvasRef}
        className={`measurement-canvas${navigationModifier ? ` measurement-canvas--${navigationModifier}-ready` : ""}${navigating ? " measurement-canvas--navigating" : ""}`}
        onPointerDown={startNavigation}
        onPointerMove={moveNavigation}
        onPointerUp={finishNavigation}
        onPointerCancel={finishNavigation}
        onPointerLeave={() => {
          if (!navigating) setHovered(null);
          onPlotHoverTimeChange(null);
        }}
        aria-label={`${measurements.length.toLocaleString()} pressure measurements`}
      />
      {targetValue !== undefined && (
        <TargetLineOverlay
          className="target-line-overlay--history"
          value={targetValue}
          minimum={yMin}
          maximum={yMax}
        />
      )}
      <div className="measurement-canvas-tooltip-viewport">
        {focusedPoint && (
          <MeasurementTooltip
            positionedPoint={focusedPoint}
            sessionAggregation={sessionAggregation}
            focusedSessionPoints={focusedSessionPoints}
          />
        )}
      </div>
    </div>
  );
}

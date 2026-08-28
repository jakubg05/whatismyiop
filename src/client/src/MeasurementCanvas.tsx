import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  coalesceMeasurementSessions,
  formatFullTime,
  type Eye,
  type Measurement,
  type SessionAggregation,
  type SessionPoint,
} from "./analysis";
import { panDomain, type TimeDomain } from "./chartNavigation";

type ChartPoint =
  | { kind: "raw"; id: string; time: number; eye: Eye; iop: number; measurement: Measurement }
  | { kind: "session"; id: string; time: number; eye: Eye; iop: number; session: SessionPoint };

type HoveredPoint = {
  point: ChartPoint;
  left: number;
  top: number;
};

type Props = {
  measurements: Measurement[];
  showRawReadings: boolean;
  sessionAggregation: SessionAggregation;
  visibleEyes: Record<Eye, boolean>;
  domainStart: number;
  domainEnd: number;
  onDomainChange: (domain: TimeDomain) => void;
  onAnnotationStart: (time: number, clientX: number) => void;
  onAnnotationMove: (time: number, clientX: number) => void;
  onAnnotationEnd: (time: number, ratio: number, clientX: number) => void;
  dimMeasurements: boolean;
  emphasizedRange: TimeDomain | null;
  yMin: number;
  yMax: number;
};

type Drag = { pointerId: number; x: number; domain: TimeDomain; moved: boolean; point: HoveredPoint | null };
type AnnotationDrag = { pointerId: number };
type NavigationModifier = "annotate" | "zoom" | null;

const COLORS = { OD: "#a63d74", OS: "#3f7d4e" } as const;
export const MEASUREMENT_PLOT = { left: 52, right: 20, top: 12, bottom: 40 } as const;
const HIT_RADIUS = 12;
const RAW_RADIUS = 2;
const SESSION_RADIUS = 4;
const COLLIDING_SESSION_GAP = 2;
const TOOLTIP_WIDTH = 224;
const TOOLTIP_HEIGHT = 184;
const TOOLTIP_GAP = 24;

function eyeLabel(eye: Eye): string {
  return eye === "OD" ? "Right" : "Left";
}

function formatIop(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function tooltipPosition(x: number, y: number, width: number, height: number) {
  const inset = 8;
  if (x + TOOLTIP_GAP + TOOLTIP_WIDTH <= width - inset) {
    return { left: x + TOOLTIP_GAP, top: Math.max(inset, Math.min(y - TOOLTIP_HEIGHT / 2, height - TOOLTIP_HEIGHT - inset)) };
  }
  if (x - TOOLTIP_GAP - TOOLTIP_WIDTH >= inset) {
    return { left: x - TOOLTIP_GAP - TOOLTIP_WIDTH, top: Math.max(inset, Math.min(y - TOOLTIP_HEIGHT / 2, height - TOOLTIP_HEIGHT - inset)) };
  }
  const left = Math.max(inset, Math.min(x - TOOLTIP_WIDTH / 2, width - TOOLTIP_WIDTH - inset));
  return y + TOOLTIP_GAP + TOOLTIP_HEIGHT <= height - inset
    ? { left, top: y + TOOLTIP_GAP }
    : { left, top: Math.max(inset, y - TOOLTIP_GAP - TOOLTIP_HEIGHT) };
}

function lowerBound<T extends { time: number }>(measurements: T[], time: number): number {
  let low = 0;
  let high = measurements.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (measurements[middle].time < time) low = middle + 1;
    else high = middle;
  }
  return low;
}

export function MeasurementCanvas({
  measurements,
  showRawReadings,
  sessionAggregation,
  visibleEyes,
  domainStart,
  domainEnd,
  onDomainChange,
  onAnnotationStart,
  onAnnotationMove,
  onAnnotationEnd,
  dimMeasurements,
  emphasizedRange,
  yMin,
  yMax,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<Drag | null>(null);
  const annotationDrag = useRef<AnnotationDrag | null>(null);
  const currentDomain = useRef<TimeDomain>([domainStart, domainEnd]);
  const pendingDomain = useRef<TimeDomain | null>(null);
  const animationFrame = useRef<number | null>(null);
  const redraw = useRef<(() => void) | null>(null);
  const measurementEmphasis = useRef({ dimMeasurements, emphasizedRange });
  const viewProgress = useRef(0);
  const selectionPop = useRef(0);
  const animatedSelectionPulse = useRef(0);
  const [hovered, setHovered] = useState<HoveredPoint | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<HoveredPoint | null>(null);
  const [selectionPulse, setSelectionPulse] = useState(0);
  const [navigating, setNavigating] = useState(false);
  const [navigationModifier, setNavigationModifier] = useState<NavigationModifier>(null);
  const visibleMeasurements = useMemo(
    () => measurements.filter((measurement) => visibleEyes[measurement.eye]),
    [measurements, visibleEyes],
  );
  const sessionPoints = useMemo(
    () => coalesceMeasurementSessions(measurements, sessionAggregation),
    [measurements, sessionAggregation],
  );
  const visibleSessionPoints = useMemo(
    () => sessionPoints.filter((point) => visibleEyes[point.eye]),
    [sessionPoints, visibleEyes],
  );
  const pairedSessionIds = useMemo(() => {
    const eyeCounts = new Map<number, number>();
    for (const point of sessionPoints) eyeCounts.set(point.sessionId, (eyeCounts.get(point.sessionId) ?? 0) + 1);
    return new Set([...eyeCounts.entries()].filter(([, count]) => count > 1).map(([sessionId]) => sessionId));
  }, [sessionPoints]);
  const chartPoints = useMemo<ChartPoint[]>(() => [
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
  ].sort((a, b) => a.time - b.time), [visibleMeasurements, visibleSessionPoints]);
  const sessionPointBySourceRow = useMemo(() => {
    const points = new Map<number, Extract<ChartPoint, { kind: "session" }>>();
    for (const point of chartPoints) {
      if (point.kind !== "session") continue;
      for (const measurement of point.session.measurements) points.set(measurement.sourceRow, point);
    }
    return points;
  }, [chartPoints]);
  const positionedSelectedPoint = selectedPoint ? positionPoint(selectedPoint.point) : null;
  const focusedPoint = hovered ?? positionedSelectedPoint;
  const focusTarget = hovered?.point ?? selectedPoint?.point ?? null;
  const focusedSession = focusedPoint?.point.kind === "session" ? focusedPoint.point : null;
  const focusedSessionPoints = useMemo(
    () => focusedSession
      ? sessionPoints.filter((point) => point.sessionId === focusedSession.session.sessionId)
      : [],
    [focusedSession, sessionPoints],
  );
  currentDomain.current = [domainStart, domainEnd];
  measurementEmphasis.current = { dimMeasurements, emphasizedRange };

  function sessionCollisionOffset(
    point: Pick<SessionPoint, "sessionId" | "eye">,
    baseX: number,
    plotRight: number,
  ): number {
    if (!pairedSessionIds.has(point.sessionId)) return 0;
    const separation = SESSION_RADIUS * 2 + COLLIDING_SESSION_GAP;
    if (baseX - separation / 2 < MEASUREMENT_PLOT.left) return point.eye === "OD" ? 0 : separation;
    if (baseX + separation / 2 > plotRight) return point.eye === "OD" ? -separation : 0;
    return point.eye === "OD" ? -separation / 2 : separation / 2;
  }

  function pointCollisionOffset(point: ChartPoint, baseX: number, plotRight: number): number {
    return point.kind === "session" ? sessionCollisionOffset(point.session, baseX, plotRight) : 0;
  }

  function scheduleDomain(nextDomain: TimeDomain) {
    currentDomain.current = nextDomain;
    pendingDomain.current = nextDomain;
    if (animationFrame.current !== null) return;
    animationFrame.current = window.requestAnimationFrame(() => {
      animationFrame.current = null;
      if (pendingDomain.current) onDomainChange(pendingDomain.current);
      pendingDomain.current = null;
    });
  }

  useEffect(() => () => {
    if (animationFrame.current !== null) window.cancelAnimationFrame(animationFrame.current);
  }, []);

  useEffect(() => {
    setHovered(null);
    setSelectedPoint(null);
  }, [measurements, sessionAggregation, showRawReadings, visibleEyes]);

  useEffect(() => {
    function updateModifier(event: KeyboardEvent) {
      const nextModifier: NavigationModifier = event.shiftKey ? "zoom" : event.ctrlKey ? "annotate" : null;
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

    function draw() {
      const width = canvas!.clientWidth;
      const height = canvas!.clientHeight;
      if (width <= MEASUREMENT_PLOT.left + MEASUREMENT_PLOT.right || height <= MEASUREMENT_PLOT.top + MEASUREMENT_PLOT.bottom) return;

      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const renderWidth = Math.round(width * pixelRatio);
      const renderHeight = Math.round(height * pixelRatio);
      if (canvas!.width !== renderWidth) canvas!.width = renderWidth;
      if (canvas!.height !== renderHeight) canvas!.height = renderHeight;
      const context = canvas!.getContext("2d");
      if (!context) return;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, width, height);

      const plotWidth = width - MEASUREMENT_PLOT.left - MEASUREMENT_PLOT.right;
      const plotHeight = height - MEASUREMENT_PLOT.top - MEASUREMENT_PLOT.bottom;
      const timeSpan = Math.max(1, domainEnd - domainStart);
      const pressureSpan = Math.max(1, yMax - yMin);
      const progress = viewProgress.current;
      const rawRadius = RAW_RADIUS + (SESSION_RADIUS - RAW_RADIUS) * progress;
      const sessionRadius = SESSION_RADIUS;
      const rawAlpha = 0.92;
      const sessionAlpha = 0.92 * (1 - progress);
      const emphasisAlpha = (time: number) => (
        !measurementEmphasis.current.dimMeasurements
        || (measurementEmphasis.current.emphasizedRange !== null
          && time >= measurementEmphasis.current.emphasizedRange[0]
          && time <= measurementEmphasis.current.emphasizedRange[1])
      ) ? 1 : 0.18;
      const focusedId = focusTarget?.id ?? null;
      const focusedSessionId = focusTarget?.kind === "session" ? focusTarget.session.sessionId : null;
      if (focusedSession) {
        for (const point of focusedSessionPoints) {
          if (point.measurements.length < 2) continue;
          const values = point.measurements.map((measurement) => measurement.iop);
          const minimum = Math.min(...values);
          const maximum = Math.max(...values);
          const baseX = MEASUREMENT_PLOT.left + ((point.time - domainStart) / timeSpan) * plotWidth;
          const x = baseX + sessionCollisionOffset(point, baseX, width - MEASUREMENT_PLOT.right);
          const yMinimum = MEASUREMENT_PLOT.top + (1 - (minimum - yMin) / pressureSpan) * plotHeight;
          const yMaximum = MEASUREMENT_PLOT.top + (1 - (maximum - yMin) / pressureSpan) * plotHeight;

          context.globalAlpha = emphasisAlpha(point.time);
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
      const firstVisibleIndex = lowerBound(chartPoints, domainStart);
      for (let index = firstVisibleIndex; index < chartPoints.length; index += 1) {
        const point = chartPoints[index];
        if (point.time > domainEnd) break;
        const baseX = MEASUREMENT_PLOT.left + ((point.time - domainStart) / timeSpan) * plotWidth;
        const x = baseX + pointCollisionOffset(point, baseX, width - MEASUREMENT_PLOT.right);
        const y = MEASUREMENT_PLOT.top + (1 - (point.iop - yMin) / pressureSpan) * plotHeight;
        const pointSessionId = point.kind === "session"
          ? point.session.sessionId
          : sessionPointBySourceRow.get(point.measurement.sourceRow)?.session.sessionId;
        const selected = focusedId === point.id || pointSessionId === focusedSessionId;
        const radius = (point.kind === "session" ? sessionRadius : rawRadius)
          * (selectedPoint?.point.id === point.id ? 1 + selectionPop.current : 1);
        const baseAlpha = point.kind === "session" ? sessionAlpha : rawAlpha;

        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        const interactionAlpha = selected
          ? 1
          : focusedId
            ? baseAlpha * 0.1
            : baseAlpha;
        context.globalAlpha = interactionAlpha * emphasisAlpha(point.time);
        context.fillStyle = COLORS[point.eye];
        context.fill();
      }

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
      viewProgress.current = startProgress + (targetProgress - startProgress) * eased;
      selectionPop.current = animateSelection ? Math.sin(Math.PI * elapsed) * 0.35 : 0;
      draw();
      if (elapsed < 1 && (startProgress !== targetProgress || animateSelection)) viewFrame = window.requestAnimationFrame(animate);
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
  }, [chartPoints, domainEnd, domainStart, focusTarget, focusedPoint, focusedSession, focusedSessionPoints, pairedSessionIds, selectedPoint, selectionPulse, sessionPointBySourceRow, showRawReadings, yMax, yMin]);

  useEffect(() => {
    redraw.current?.();
  }, [dimMeasurements, emphasizedRange]);

  function chartGeometry(canvas: HTMLCanvasElement) {
    const bounds = canvas.getBoundingClientRect();
    return {
      bounds,
      plotWidth: Math.max(1, bounds.width - MEASUREMENT_PLOT.left - MEASUREMENT_PLOT.right),
    };
  }

  function positionPoint(point: ChartPoint): HoveredPoint | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const plotWidth = Math.max(1, width - MEASUREMENT_PLOT.left - MEASUREMENT_PLOT.right);
    const plotHeight = Math.max(1, height - MEASUREMENT_PLOT.top - MEASUREMENT_PLOT.bottom);
    const baseX = MEASUREMENT_PLOT.left + ((point.time - domainStart) / Math.max(1, domainEnd - domainStart)) * plotWidth;
    const x = baseX + pointCollisionOffset(point, baseX, width - MEASUREMENT_PLOT.right);
    const y = MEASUREMENT_PLOT.top + (1 - (point.iop - yMin) / Math.max(1, yMax - yMin)) * plotHeight;
    const tooltip = tooltipPosition(x, y, width, height);
    return {
      point,
      ...tooltip,
    };
  }

  function startNavigation(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0) return;
    const { bounds } = chartGeometry(event.currentTarget);
    const x = event.clientX - bounds.left;
    if (x < MEASUREMENT_PLOT.left || x > bounds.width - MEASUREMENT_PLOT.right) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    if (event.ctrlKey) {
      setSelectedPoint(null);
      const plotWidth = Math.max(1, bounds.width - MEASUREMENT_PLOT.left - MEASUREMENT_PLOT.right);
      const ratio = Math.max(0, Math.min(1, (x - MEASUREMENT_PLOT.left) / plotWidth));
      annotationDrag.current = { pointerId: event.pointerId };
      onAnnotationStart(domainStart + ratio * (domainEnd - domainStart), event.clientX);
      return;
    }
    drag.current = {
      pointerId: event.pointerId,
      x,
      domain: currentDomain.current,
      moved: false,
      point: nearestPointAt(event.currentTarget, event.clientX, event.clientY),
    };
  }

  function moveNavigation(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (annotationDrag.current?.pointerId === event.pointerId) {
      const { bounds, plotWidth } = chartGeometry(event.currentTarget);
      const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left - MEASUREMENT_PLOT.left) / plotWidth));
      onAnnotationMove(domainStart + ratio * (domainEnd - domainStart), event.clientX);
      return;
    }
    const activeDrag = drag.current;
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) {
      if (event.ctrlKey || event.shiftKey) {
        setHovered(null);
        return;
      }
      findNearest(event);
      return;
    }

    const { bounds, plotWidth } = chartGeometry(event.currentTarget);
    const x = event.clientX - bounds.left;
    if (!activeDrag.moved) {
      if (Math.abs(activeDrag.x - x) < 4) return;
      activeDrag.moved = true;
      setHovered(null);
      setNavigating(true);
    }
    const offset = ((activeDrag.x - x) / plotWidth) * (activeDrag.domain[1] - activeDrag.domain[0]);
    scheduleDomain(panDomain(activeDrag.domain, offset, null));
  }

  function finishNavigation(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (annotationDrag.current?.pointerId === event.pointerId) {
      const { bounds, plotWidth } = chartGeometry(event.currentTarget);
      const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left - MEASUREMENT_PLOT.left) / plotWidth));
      annotationDrag.current = null;
      onAnnotationEnd(domainStart + ratio * (domainEnd - domainStart), ratio, event.clientX);
      return;
    }
    if (drag.current?.pointerId !== event.pointerId) return;
    const completedDrag = drag.current;
    drag.current = null;
    setNavigating(false);
    if (!completedDrag.moved) {
      const pressedPoint = completedDrag.point;
      if (pressedPoint && pressedPoint.point.id !== selectedPoint?.point.id) {
        setSelectedPoint(pressedPoint);
        setSelectionPulse((current) => current + 1);
      } else if (!pressedPoint) {
        setSelectedPoint(null);
      }
      setHovered(null);
    }
  }

  function nearestPointAt(canvas: HTMLCanvasElement, clientX: number, clientY: number): HoveredPoint | null {
    const bounds = canvas.getBoundingClientRect();
    const plotWidth = bounds.width - MEASUREMENT_PLOT.left - MEASUREMENT_PLOT.right;
    const plotHeight = bounds.height - MEASUREMENT_PLOT.top - MEASUREMENT_PLOT.bottom;
    const pointerX = clientX - bounds.left;
    const pointerY = clientY - bounds.top;
    if (pointerX < MEASUREMENT_PLOT.left || pointerX > bounds.width - MEASUREMENT_PLOT.right || pointerY < MEASUREMENT_PLOT.top || pointerY > bounds.height - MEASUREMENT_PLOT.bottom) {
      return null;
    }
    if (chartPoints.length === 0) return null;

    const timeSpan = Math.max(1, domainEnd - domainStart);
    const pressureSpan = Math.max(1, yMax - yMin);
    const targetTime = domainStart + ((pointerX - MEASUREMENT_PLOT.left) / plotWidth) * timeSpan;
    const insertion = lowerBound(chartPoints, targetTime);
    let best: HoveredPoint | null = null;
    let bestDistanceSquared = HIT_RADIUS * HIT_RADIUS;
    const start = Math.max(0, insertion - 128);
    const end = Math.min(chartPoints.length, insertion + 128);

    for (let index = start; index < end; index += 1) {
      const point = chartPoints[index];
      if (showRawReadings && point.kind !== "raw") continue;
      const baseX = MEASUREMENT_PLOT.left + ((point.time - domainStart) / timeSpan) * plotWidth;
      const x = baseX + pointCollisionOffset(point, baseX, bounds.width - MEASUREMENT_PLOT.right);
      if (Math.abs(x - pointerX) > HIT_RADIUS) continue;
      const y = MEASUREMENT_PLOT.top + (1 - (point.iop - yMin) / pressureSpan) * plotHeight;
      const distanceSquared = (x - pointerX) ** 2 + (y - pointerY) ** 2;
      if (distanceSquared <= bestDistanceSquared) {
        bestDistanceSquared = distanceSquared;
        const tooltip = tooltipPosition(x, y, bounds.width, bounds.height);
        const tooltipPoint = !showRawReadings && point.kind === "raw"
          ? sessionPointBySourceRow.get(point.measurement.sourceRow) ?? point
          : point;
        best = {
          point: tooltipPoint,
          ...tooltip,
        };
      }
    }
    return best;
  }

  function findNearest(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (selectedPoint) {
      setHovered(null);
      return;
    }
    setHovered(nearestPointAt(event.currentTarget, event.clientX, event.clientY));
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
        }}
        aria-label={`${measurements.length.toLocaleString()} pressure measurements`}
      />
      {focusedPoint && <div className="measurement-canvas-tooltip" style={{ left: focusedPoint.left, top: focusedPoint.top }}>
        {focusedPoint.point.kind === "session" ? <>
          <div className="measurement-canvas-tooltip__eyebrow">
            <span>{sessionAggregation}</span>
            <span>{formatFullTime(focusedPoint.point.time)}</span>
          </div>
          <div className="measurement-canvas-tooltip__session-values">
            {focusedSessionPoints.map((point) => <div key={point.eye} className="measurement-canvas-tooltip__session-value">
              <span className="measurement-canvas-tooltip__eye"><span className={`dot dot--${point.eye.toLowerCase()}`} aria-hidden="true" />{eyeLabel(point.eye)}</span>
              <span className="measurement-canvas-tooltip__session-reading"><span className="measurement-canvas-tooltip__value">{formatIop(point.iop)}</span><span className="measurement-canvas-tooltip__unit">mmHg</span></span>
            </div>)}
          </div>
          <dl className="measurement-canvas-tooltip__rows">
            {focusedSessionPoints.map((point) => <div key={point.eye}>
              <dt>{eyeLabel(point.eye)}</dt>
              <dd>{point.measurements.map((measurement) => measurement.iop).join(", ")} mmHg</dd>
            </div>)}
          </dl>
        </> : <>
          <div className="measurement-canvas-tooltip__eyebrow">
            <span className="measurement-canvas-tooltip__eye"><span className={`dot dot--${focusedPoint.point.eye.toLowerCase()}`} aria-hidden="true" />{eyeLabel(focusedPoint.point.eye)}</span>
            <span>{formatFullTime(focusedPoint.point.time)}</span>
          </div>
          <div className="measurement-canvas-tooltip__primary">
            <span className="measurement-canvas-tooltip__value">{formatIop(focusedPoint.point.iop)}</span>
            <span className="measurement-canvas-tooltip__unit">mmHg</span>
          </div>
          <dl className="measurement-canvas-tooltip__rows">
            <div><dt>Quality</dt><dd>{focusedPoint.point.measurement.quality}</dd></div>
            {focusedPoint.point.measurement.position && <div><dt>Position</dt><dd>{focusedPoint.point.measurement.position}</dd></div>}
            <div><dt>Source</dt><dd>Row {focusedPoint.point.measurement.sourceRow}</dd></div>
          </dl>
        </>}
      </div>}
    </div>
  );
}

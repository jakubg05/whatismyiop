import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { formatFullTime, type Eye, type Measurement } from "./analysis";
import { panDomain, type TimeDomain } from "./chartNavigation";

type HoveredPoint = {
  measurement: Measurement;
  left: number;
  top: number;
};

type Props = {
  measurements: Measurement[];
  visibleEyes: Record<Eye, boolean>;
  domainStart: number;
  domainEnd: number;
  fullDomainStart: number;
  fullDomainEnd: number;
  onDomainChange: (domain: TimeDomain) => void;
  onAnnotationStart: (time: number, clientX: number) => void;
  onAnnotationMove: (time: number, clientX: number) => void;
  onAnnotationEnd: (time: number, ratio: number, clientX: number) => void;
  yMin: number;
  yMax: number;
};

type Drag = { pointerId: number; x: number; domain: TimeDomain };
type AnnotationDrag = { pointerId: number };

const COLORS = { OD: "#d9623d", OS: "#237c78" } as const;
export const MEASUREMENT_PLOT = { left: 52, right: 20, top: 12, bottom: 40 } as const;
const HIT_RADIUS = 12;

function eyeLabel(eye: Eye): string {
  return eye === "OD" ? "Right eye" : "Left eye";
}

function lowerBound(measurements: Measurement[], time: number): number {
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
  visibleEyes,
  domainStart,
  domainEnd,
  fullDomainStart,
  fullDomainEnd,
  onDomainChange,
  onAnnotationStart,
  onAnnotationMove,
  onAnnotationEnd,
  yMin,
  yMax,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const crosshairRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const annotationDrag = useRef<AnnotationDrag | null>(null);
  const currentDomain = useRef<TimeDomain>([domainStart, domainEnd]);
  const pendingDomain = useRef<TimeDomain | null>(null);
  const animationFrame = useRef<number | null>(null);
  const [hovered, setHovered] = useState<HoveredPoint | null>(null);
  const [navigating, setNavigating] = useState(false);
  const visibleMeasurements = useMemo(
    () => measurements.filter((measurement) => visibleEyes[measurement.eye]),
    [measurements, visibleEyes],
  );
  currentDomain.current = [domainStart, domainEnd];

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
    const canvas = canvasRef.current;
    if (!canvas) return;

    function draw() {
      const width = canvas!.clientWidth;
      const height = canvas!.clientHeight;
      if (width <= MEASUREMENT_PLOT.left + MEASUREMENT_PLOT.right || height <= MEASUREMENT_PLOT.top + MEASUREMENT_PLOT.bottom) return;

      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = Math.round(width * pixelRatio);
      canvas!.height = Math.round(height * pixelRatio);
      const context = canvas!.getContext("2d");
      if (!context) return;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, width, height);

      const plotWidth = width - MEASUREMENT_PLOT.left - MEASUREMENT_PLOT.right;
      const plotHeight = height - MEASUREMENT_PLOT.top - MEASUREMENT_PLOT.bottom;
      const timeSpan = Math.max(1, domainEnd - domainStart);
      const pressureSpan = Math.max(1, yMax - yMin);
      const paths: Record<Eye, Path2D> = { OD: new Path2D(), OS: new Path2D() };
      const radius = 4;

      const firstVisibleIndex = lowerBound(measurements, domainStart);
      for (let index = firstVisibleIndex; index < measurements.length; index += 1) {
        const measurement = measurements[index];
        if (measurement.time > domainEnd) break;
        if (!visibleEyes[measurement.eye]) continue;
        const x = MEASUREMENT_PLOT.left + ((measurement.time - domainStart) / timeSpan) * plotWidth;
        const y = MEASUREMENT_PLOT.top + (1 - (measurement.iop - yMin) / pressureSpan) * plotHeight;
        const path = paths[measurement.eye];
        path.moveTo(x + radius, y);
        path.arc(x, y, radius, 0, Math.PI * 2);
      }

      context.globalAlpha = 1;
      for (const eye of ["OD", "OS"] as Eye[]) {
        if (!visibleEyes[eye]) continue;
        context.fillStyle = COLORS[eye];
        context.fill(paths[eye]);
      }
      context.globalAlpha = 1;
    }

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [domainEnd, domainStart, measurements, visibleEyes, yMax, yMin]);

  function chartGeometry(canvas: HTMLCanvasElement) {
    const bounds = canvas.getBoundingClientRect();
    return {
      bounds,
      plotWidth: Math.max(1, bounds.width - MEASUREMENT_PLOT.left - MEASUREMENT_PLOT.right),
    };
  }

  function setCrosshair(x: number | null) {
    const crosshair = crosshairRef.current;
    if (!crosshair) return;
    crosshair.style.opacity = x === null ? "0" : "1";
    if (x !== null) crosshair.style.transform = `translateX(${x}px)`;
  }

  function startNavigation(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0) return;
    const { bounds } = chartGeometry(event.currentTarget);
    const x = event.clientX - bounds.left;
    if (x < MEASUREMENT_PLOT.left || x > bounds.width - MEASUREMENT_PLOT.right) return;

    event.preventDefault();
    setCrosshair(null);
    event.currentTarget.setPointerCapture(event.pointerId);
    if (!event.ctrlKey) {
      const plotWidth = Math.max(1, bounds.width - MEASUREMENT_PLOT.left - MEASUREMENT_PLOT.right);
      const ratio = Math.max(0, Math.min(1, (x - MEASUREMENT_PLOT.left) / plotWidth));
      annotationDrag.current = { pointerId: event.pointerId };
      onAnnotationStart(domainStart + ratio * (domainEnd - domainStart), event.clientX);
      return;
    }
    drag.current = { pointerId: event.pointerId, x, domain: currentDomain.current };
    setHovered(null);
    setNavigating(true);
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
      findNearest(event);
      return;
    }

    const { bounds, plotWidth } = chartGeometry(event.currentTarget);
    const fullDomain: TimeDomain = [fullDomainStart, fullDomainEnd];
    const x = event.clientX - bounds.left;
    const offset = ((activeDrag.x - x) / plotWidth) * (activeDrag.domain[1] - activeDrag.domain[0]);
    scheduleDomain(panDomain(activeDrag.domain, offset, fullDomain));
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
    drag.current = null;
    setNavigating(false);
  }

  function findNearest(event: ReactPointerEvent<HTMLCanvasElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const plotWidth = bounds.width - MEASUREMENT_PLOT.left - MEASUREMENT_PLOT.right;
    const plotHeight = bounds.height - MEASUREMENT_PLOT.top - MEASUREMENT_PLOT.bottom;
    const pointerX = event.clientX - bounds.left;
    const pointerY = event.clientY - bounds.top;
    if (pointerX < MEASUREMENT_PLOT.left || pointerX > bounds.width - MEASUREMENT_PLOT.right || pointerY < MEASUREMENT_PLOT.top || pointerY > bounds.height - MEASUREMENT_PLOT.bottom) {
      setCrosshair(null);
      setHovered(null);
      return;
    }
    setCrosshair(pointerX);
    if (visibleMeasurements.length === 0) {
      setHovered(null);
      return;
    }

    const timeSpan = Math.max(1, domainEnd - domainStart);
    const pressureSpan = Math.max(1, yMax - yMin);
    const targetTime = domainStart + ((pointerX - MEASUREMENT_PLOT.left) / plotWidth) * timeSpan;
    const insertion = lowerBound(visibleMeasurements, targetTime);
    let best: HoveredPoint | null = null;
    let bestDistanceSquared = HIT_RADIUS * HIT_RADIUS;
    const start = Math.max(0, insertion - 128);
    const end = Math.min(visibleMeasurements.length, insertion + 128);

    for (let index = start; index < end; index += 1) {
      const measurement = visibleMeasurements[index];
      const x = MEASUREMENT_PLOT.left + ((measurement.time - domainStart) / timeSpan) * plotWidth;
      if (Math.abs(x - pointerX) > HIT_RADIUS) continue;
      const y = MEASUREMENT_PLOT.top + (1 - (measurement.iop - yMin) / pressureSpan) * plotHeight;
      const distanceSquared = (x - pointerX) ** 2 + (y - pointerY) ** 2;
      if (distanceSquared <= bestDistanceSquared) {
        bestDistanceSquared = distanceSquared;
        best = {
          measurement,
          left: Math.max(8, Math.min(x + 12, bounds.width - 210)),
          top: Math.max(8, Math.min(y - 105, bounds.height - 150)),
        };
      }
    }
    setHovered(best);
  }

  return (
    <div className="measurement-canvas-layer">
      <canvas
        ref={canvasRef}
        className={`measurement-canvas ${navigating ? "measurement-canvas--navigating" : ""}`}
        onPointerDown={startNavigation}
        onPointerMove={moveNavigation}
        onPointerUp={finishNavigation}
        onPointerCancel={finishNavigation}
        onPointerLeave={() => {
          setCrosshair(null);
          if (!navigating) setHovered(null);
        }}
        aria-label={`${measurements.length.toLocaleString()} pressure measurements`}
      />
      <div ref={crosshairRef} className="measurement-crosshair" aria-hidden="true" />
      {hovered && <div className="chart-tooltip measurement-canvas-tooltip" style={{ left: hovered.left, top: hovered.top }}>
        <strong>{eyeLabel(hovered.measurement.eye)} · {hovered.measurement.iop} mmHg</strong>
        <span>{formatFullTime(hovered.measurement.time)}</span>
        <span>Quality: {hovered.measurement.quality}</span>
        {hovered.measurement.position && <span>Position: {hovered.measurement.position}</span>}
        <span className="source-row">Source row {hovered.measurement.sourceRow}</span>
      </div>}
    </div>
  );
}

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { formatFullTime, type Eye, type Measurement } from "./analysis";
import { panDomain, zoomDomain, type TimeDomain } from "./chartNavigation";

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
  yMin: number;
  yMax: number;
};

type PointerPosition = { x: number; y: number };

type Gesture =
  | { kind: "pan"; x: number; domain: TimeDomain }
  | { kind: "pinch"; distance: number; centerX: number; domain: TimeDomain };

const COLORS = { OD: "#d9623d", OS: "#237c78" } as const;
const PLOT = { left: 52, right: 20, top: 12, bottom: 40 } as const;
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
  yMin,
  yMax,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointers = useRef(new Map<number, PointerPosition>());
  const gesture = useRef<Gesture | null>(null);
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
      if (width <= PLOT.left + PLOT.right || height <= PLOT.top + PLOT.bottom) return;

      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = Math.round(width * pixelRatio);
      canvas!.height = Math.round(height * pixelRatio);
      const context = canvas!.getContext("2d");
      if (!context) return;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, width, height);

      const plotWidth = width - PLOT.left - PLOT.right;
      const plotHeight = height - PLOT.top - PLOT.bottom;
      const timeSpan = Math.max(1, domainEnd - domainStart);
      const pressureSpan = Math.max(1, yMax - yMin);
      const paths: Record<Eye, Path2D> = { OD: new Path2D(), OS: new Path2D() };
      const radius = 4;

      const firstVisibleIndex = lowerBound(measurements, domainStart);
      for (let index = firstVisibleIndex; index < measurements.length; index += 1) {
        const measurement = measurements[index];
        if (measurement.time > domainEnd) break;
        if (!visibleEyes[measurement.eye]) continue;
        const x = PLOT.left + ((measurement.time - domainStart) / timeSpan) * plotWidth;
        const y = PLOT.top + (1 - (measurement.iop - yMin) / pressureSpan) * plotHeight;
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
      plotWidth: Math.max(1, bounds.width - PLOT.left - PLOT.right),
    };
  }

  function startNavigation(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const { bounds } = chartGeometry(event.currentTarget);
    const position = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    if (position.x < PLOT.left || position.x > bounds.width - PLOT.right) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, position);
    setHovered(null);
    setNavigating(true);

    const activePointers = [...pointers.current.values()];
    if (activePointers.length >= 2) {
      const [first, second] = activePointers;
      gesture.current = {
        kind: "pinch",
        distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
        centerX: (first.x + second.x) / 2,
        domain: currentDomain.current,
      };
    } else {
      gesture.current = { kind: "pan", x: position.x, domain: currentDomain.current };
    }
  }

  function moveNavigation(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!pointers.current.has(event.pointerId)) {
      findNearest(event);
      return;
    }

    const { bounds, plotWidth } = chartGeometry(event.currentTarget);
    pointers.current.set(event.pointerId, { x: event.clientX - bounds.left, y: event.clientY - bounds.top });
    const activePointers = [...pointers.current.values()];
    const activeGesture = gesture.current;
    const fullDomain: TimeDomain = [fullDomainStart, fullDomainEnd];

    if (activePointers.length >= 2 && activeGesture?.kind === "pinch") {
      const [first, second] = activePointers;
      const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
      const centerX = (first.x + second.x) / 2;
      const anchorRatio = (activeGesture.centerX - PLOT.left) / plotWidth;
      const zoomed = zoomDomain(activeGesture.domain, activeGesture.distance / distance, anchorRatio, fullDomain);
      const shifted = panDomain(zoomed, ((activeGesture.centerX - centerX) / plotWidth) * (zoomed[1] - zoomed[0]), fullDomain);
      scheduleDomain(shifted);
    } else if (activePointers.length === 1 && activeGesture?.kind === "pan") {
      const offset = ((activeGesture.x - activePointers[0].x) / plotWidth) * (activeGesture.domain[1] - activeGesture.domain[0]);
      scheduleDomain(panDomain(activeGesture.domain, offset, fullDomain));
    }
  }

  function finishNavigation(event: ReactPointerEvent<HTMLCanvasElement>) {
    pointers.current.delete(event.pointerId);
    const remaining = [...pointers.current.values()];
    if (remaining.length === 1) {
      gesture.current = { kind: "pan", x: remaining[0].x, domain: currentDomain.current };
      return;
    }
    gesture.current = null;
    setNavigating(false);
  }

  function navigateWithWheel(event: ReactWheelEvent<HTMLCanvasElement>) {
    event.preventDefault();
    const { bounds, plotWidth } = chartGeometry(event.currentTarget);
    const fullDomain: TimeDomain = [fullDomainStart, fullDomainEnd];
    const domain = currentDomain.current;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? bounds.height : 1;
    const deltaX = event.deltaX * unit;
    const deltaY = event.deltaY * unit;

    if (!event.ctrlKey && Math.abs(deltaX) > Math.abs(deltaY)) {
      scheduleDomain(panDomain(domain, (deltaX / plotWidth) * (domain[1] - domain[0]), fullDomain));
      return;
    }

    const anchorRatio = (event.clientX - bounds.left - PLOT.left) / plotWidth;
    const scale = Math.exp(Math.max(-4, Math.min(4, deltaY * 0.002)));
    scheduleDomain(zoomDomain(domain, scale, anchorRatio, fullDomain));
  }

  function findNearest(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (visibleMeasurements.length === 0) {
      setHovered(null);
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const plotWidth = bounds.width - PLOT.left - PLOT.right;
    const plotHeight = bounds.height - PLOT.top - PLOT.bottom;
    const pointerX = event.clientX - bounds.left;
    const pointerY = event.clientY - bounds.top;
    if (pointerX < PLOT.left || pointerX > bounds.width - PLOT.right || pointerY < PLOT.top || pointerY > bounds.height - PLOT.bottom) {
      setHovered(null);
      return;
    }

    const timeSpan = Math.max(1, domainEnd - domainStart);
    const pressureSpan = Math.max(1, yMax - yMin);
    const targetTime = domainStart + ((pointerX - PLOT.left) / plotWidth) * timeSpan;
    const insertion = lowerBound(visibleMeasurements, targetTime);
    let best: HoveredPoint | null = null;
    let bestDistanceSquared = HIT_RADIUS * HIT_RADIUS;
    const start = Math.max(0, insertion - 128);
    const end = Math.min(visibleMeasurements.length, insertion + 128);

    for (let index = start; index < end; index += 1) {
      const measurement = visibleMeasurements[index];
      const x = PLOT.left + ((measurement.time - domainStart) / timeSpan) * plotWidth;
      if (Math.abs(x - pointerX) > HIT_RADIUS) continue;
      const y = PLOT.top + (1 - (measurement.iop - yMin) / pressureSpan) * plotHeight;
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
        onWheel={navigateWithWheel}
        onPointerDown={startNavigation}
        onPointerMove={moveNavigation}
        onPointerUp={finishNavigation}
        onPointerCancel={finishNavigation}
        onPointerLeave={() => {
          if (!navigating) setHovered(null);
        }}
        onDoubleClick={() => onDomainChange([fullDomainStart, fullDomainEnd])}
        aria-label={`${measurements.length.toLocaleString()} pressure measurements`}
      />
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

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { formatFullTime, type Eye, type Measurement } from "./analysis";

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
  yMin: number;
  yMax: number;
};

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

export function MeasurementCanvas({ measurements, visibleEyes, domainStart, domainEnd, yMin, yMax }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hovered, setHovered] = useState<HoveredPoint | null>(null);
  const visibleMeasurements = useMemo(
    () => measurements.filter((measurement) => visibleEyes[measurement.eye]),
    [measurements, visibleEyes],
  );

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

      for (const measurement of measurements) {
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
        className="measurement-canvas"
        onPointerMove={findNearest}
        onPointerLeave={() => setHovered(null)}
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

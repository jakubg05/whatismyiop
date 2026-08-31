import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { interpolateInferno } from "d3-scale-chromatic";
import { ResponsiveContainer, Scatter, ScatterChart, XAxis, YAxis } from "recharts";
import { formatDateInput, type Eye, type Measurement } from "../analysis";
import { buildDiurnalHeatmapData, DIURNAL_BIN_WINDOWS } from "../diurnalHeatmapData";
import { navigateWheelDomain, panDomain, zoomDomain, type TimeDomain } from "./chartNavigation";
import { CHART_PLOT_LEFT, CHART_PLOT_RIGHT, formatChartTime } from "./format";
import { heatmapBracket, heatmapColorPosition, heatmapValueAt, heatmapValueFromBracket, sharedHeatmapColorDomain } from "./heatmapInterpolation";
import { MEASUREMENT_PLOT as MAIN_CHART_PLOT } from "./MeasurementCanvas";
import { positionHeatmapTooltip } from "./tooltipPosition";

const HOUR_TICKS = Array.from({ length: 9 }, (_, index) => index * 3);
const DAY_MS = 86_400_000;
const MEASUREMENT_PLOT = { ...MAIN_CHART_PLOT, top: 0 } as const;
const TOOLTIP_WIDTH = 224;
const TOOLTIP_HEIGHT = 110;
const DRAG_THRESHOLD = 4;

type Props = {
  measurements: readonly Measurement[];
  visibleEyes: Record<Eye, boolean>;
  domain: TimeDomain;
  fullDomain: TimeDomain;
  timeTicks: number[];
  closing: boolean;
  showUncertainRegions: boolean;
  onDomainChange: (domain: TimeDomain) => void;
};

type Hover = { left: number; top: number; time: number; bin: number; value: number | null; side: "left" | "right"; anchorOffset: number };
type Drag = { pointerId: number; x: number; y: number; domain: TimeDomain; moved: boolean };

function colorLookup(): Array<readonly [number, number, number]> {
  return Array.from({ length: 256 }, (_, index) => {
    const value = interpolateInferno(index / 255);
    return [
      Number.parseInt(value.slice(1, 3), 16),
      Number.parseInt(value.slice(3, 5), 16),
      Number.parseInt(value.slice(5, 7), 16),
    ] as const;
  });
}

const COLORS = colorLookup();

function hourLabel(hour: number): string {
  return `${hour === 24 ? 0 : hour}:00`;
}

function eyeLabel(eye: Eye | undefined): string {
  if (eye === "OD") return "Right eye";
  if (eye === "OS") return "Left eye";
  return "No eye";
}

function TimeOfDayTick({ x = 0, y = 0, payload }: { x?: number; y?: number; payload?: { value: number } }) {
  if (!payload) return null;
  return <text
    x={x - 8}
    y={payload.value === 0 ? y + 7 : y}
    fill="var(--muted)"
    fontSize={11}
    dominantBaseline="middle"
    textAnchor="end"
  >{hourLabel(payload.value)}</text>;
}

export function DiurnalHeatmapCanvas({ measurements, visibleEyes, domain, fullDomain, timeTicks, closing, showUncertainRegions, onDomainChange }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const rasterCanvas = useRef<HTMLCanvasElement | null>(null);
  const rasterImage = useRef<ImageData | null>(null);
  const drag = useRef<Drag | null>(null);
  const domainRef = useRef(domain);
  const pendingWheelDomain = useRef<TimeDomain | null>(null);
  const wheelFrame = useRef<number | null>(null);
  const pendingDragDomain = useRef<TimeDomain | null>(null);
  const dragFrame = useRef<number | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [hover, setHover] = useState<Hover | null>(null);
  const [pinned, setPinned] = useState(false);
  const [dragging, setDragging] = useState(false);
  const eyes = useMemo(() => (["OD", "OS"] as Eye[]).filter((eye) => visibleEyes[eye]), [visibleEyes]);
  const data = useMemo(() => buildDiurnalHeatmapData(
    measurements,
    eyes,
    { start: formatDateInput(fullDomain[0]), startTime: "00:00" },
    formatDateInput(fullDomain[1]),
    "23:59",
    fullDomain[1],
  ), [eyes, fullDomain, measurements]);
  const scaleData = useMemo(() => (["OD", "OS"] as Eye[]).map((eye) => buildDiurnalHeatmapData(
    measurements,
    eye,
    { start: formatDateInput(fullDomain[0]), startTime: "00:00" },
    formatDateInput(fullDomain[1]),
    "23:59",
    fullDomain[1],
  )), [fullDomain, measurements]);
  const axisAnchors = useMemo(() => [
    { time: domain[0], hour: 0 },
    { time: domain[1], hour: 24 },
  ], [domain]);
  const dates = data.times;
  const selectedEye = eyes[0];
  const colorDomain = useMemo(() => sharedHeatmapColorDomain(scaleData), [scaleData]);
  domainRef.current = domain;

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const update = () => setSize((current) => {
      const next = { width: element.clientWidth, height: element.clientHeight };
      return current.width === next.width && current.height === next.height ? current : next;
    });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const target = canvas.current;
    if (!target || size.width <= 0 || size.height <= 0) return;
    const ratio = window.devicePixelRatio || 1;
    target.width = Math.round(size.width * ratio);
    target.height = Math.round(size.height * ratio);
    const context = target.getContext("2d");
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, size.width, size.height);

    const plotWidth = Math.max(1, size.width - MEASUREMENT_PLOT.left - MEASUREMENT_PLOT.right);
    const plotHeight = Math.max(1, size.height - MEASUREMENT_PLOT.top - MEASUREMENT_PLOT.bottom);
    if (dates.length === 0 || eyes.length === 0) return;
    const rasterWidth = Math.max(1, Math.min(720, Math.ceil(plotWidth)));
    const rasterHeight = Math.max(1, Math.min(280, Math.ceil(plotHeight)));
    const raster = rasterCanvas.current ?? document.createElement("canvas");
    rasterCanvas.current = raster;
    if (raster.width !== rasterWidth || raster.height !== rasterHeight) {
      raster.width = rasterWidth;
      raster.height = rasterHeight;
      rasterImage.current = null;
    }
    const rasterContext = raster.getContext("2d");
    if (!rasterContext) return;
    const image = rasterImage.current ?? rasterContext.createImageData(rasterWidth, rasterHeight);
    rasterImage.current = image;
    image.data.fill(0);
    const xSamples = Array.from({ length: rasterWidth }, (_, x) => {
      const time = domain[0] + x / Math.max(1, rasterWidth - 1) * (domain[1] - domain[0]);
      return { time, bracket: heatmapBracket(dates, time) };
    });
    const ySamples = Array.from({ length: rasterHeight }, (_, y) => {
      const binPosition = Math.max(0, Math.min(7, (y / Math.max(1, rasterHeight - 1) * 24 - 1.5) / 3));
      const upper = Math.floor(binPosition);
      return { upper, lower: Math.min(7, Math.ceil(binPosition)), ratio: binPosition - upper };
    });
    for (let y = 0; y < rasterHeight; y += 1) {
      const ySample = ySamples[y];
      for (let x = 0; x < rasterWidth; x += 1) {
        const xSample = xSamples[x];
        const [left, right, timeRatio] = xSample.bracket;
        const value = xSample.time < fullDomain[0] || xSample.time > fullDomain[1]
          ? null
          : heatmapValueFromBracket(data, left, right, timeRatio, ySample.upper, ySample.lower, ySample.ratio);
        if (value === null) continue;
        const color = COLORS[Math.round(heatmapColorPosition(value, colorDomain) * 255)];
        const offset = (y * rasterWidth + x) * 4;
        image.data[offset] = color[0];
        image.data[offset + 1] = color[1];
        image.data[offset + 2] = color[2];
        image.data[offset + 3] = 255;
      }
    }
    rasterContext.putImageData(image, 0, 0);
    context.imageSmoothingEnabled = true;
    context.drawImage(raster, MEASUREMENT_PLOT.left, MEASUREMENT_PLOT.top, plotWidth, plotHeight);

    if (!showUncertainRegions) return;
    const boundaries = dates.map((time, index) => index === 0
      ? time - ((dates[1] ?? time + DAY_MS) - time) / 2
      : (dates[index - 1] + time) / 2);
    boundaries.push(dates.length > 1 ? dates.at(-1)! + (dates.at(-1)! - dates.at(-2)!) / 2 : dates[0] + DAY_MS / 2);
    const sparse = new Path2D();
    const historyLeft = MEASUREMENT_PLOT.left + (fullDomain[0] - domain[0]) / Math.max(1, domain[1] - domain[0]) * plotWidth;
    const historyRight = MEASUREMENT_PLOT.left + (fullDomain[1] - domain[0]) / Math.max(1, domain[1] - domain[0]) * plotWidth;
    for (let bin = 0; bin < 8; bin += 1) {
      let row = 0;
      while (row < data.lowSupport.length) {
        if (!data.lowSupport[row][bin]) {
          row += 1;
          continue;
        }
        const start = row;
        while (row + 1 < data.lowSupport.length && data.lowSupport[row + 1][bin]) row += 1;
        const x0 = Math.max(MEASUREMENT_PLOT.left, historyLeft, MEASUREMENT_PLOT.left + (boundaries[start] - domain[0]) / Math.max(1, domain[1] - domain[0]) * plotWidth);
        const x1 = Math.min(MEASUREMENT_PLOT.left + plotWidth, historyRight, MEASUREMENT_PLOT.left + (boundaries[row + 1] - domain[0]) / Math.max(1, domain[1] - domain[0]) * plotWidth);
        const y0 = MEASUREMENT_PLOT.top + bin / 8 * plotHeight;
        if (x1 > x0) sparse.rect(x0, y0, x1 - x0, plotHeight / 8);
        row += 1;
      }
    }
    context.save();
    context.beginPath();
    context.rect(MEASUREMENT_PLOT.left, MEASUREMENT_PLOT.top, plotWidth, plotHeight);
    context.clip();
    context.clip(sparse);
    context.strokeStyle = "rgba(255,255,255,.55)";
    context.lineWidth = 1;
    const stripeSpacing = 9;
    const stripeOrigin = historyLeft - MEASUREMENT_PLOT.left;
    const firstStripe = stripeOrigin + Math.floor((-plotHeight - stripeOrigin) / stripeSpacing) * stripeSpacing;
    for (let offset = firstStripe; offset < plotWidth + plotHeight; offset += stripeSpacing) {
      context.beginPath();
      context.moveTo(MEASUREMENT_PLOT.left + offset, MEASUREMENT_PLOT.top + plotHeight);
      context.lineTo(MEASUREMENT_PLOT.left + offset + plotHeight, MEASUREMENT_PLOT.top);
      context.stroke();
    }
    context.restore();
  }, [colorDomain, data, dates, domain, eyes.length, fullDomain, showUncertainRegions, size]);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    function handleWheel(event: WheelEvent) {
      if (!event.ctrlKey && !event.shiftKey) return;
      event.preventDefault();
      event.stopPropagation();
      const bounds = element!.getBoundingClientRect();
      const plotWidth = Math.max(1, bounds.width - MEASUREMENT_PLOT.left - MEASUREMENT_PLOT.right);
      const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? bounds.height : 1;
      const current = pendingWheelDomain.current ?? domainRef.current;
      pendingWheelDomain.current = navigateWheelDomain(
        current,
        null,
        event.shiftKey ? "zoom" : "pan",
        event.deltaX * unit,
        event.deltaY * unit,
        (event.clientX - bounds.left - MEASUREMENT_PLOT.left) / plotWidth,
        plotWidth,
      );
      if (wheelFrame.current !== null) return;
      wheelFrame.current = window.requestAnimationFrame(() => {
        wheelFrame.current = null;
        if (pendingWheelDomain.current) onDomainChange(pendingWheelDomain.current);
        pendingWheelDomain.current = null;
      });
    }
    element.addEventListener("wheel", handleWheel, { passive: false, capture: true });
    return () => {
      element.removeEventListener("wheel", handleWheel, { capture: true });
      if (wheelFrame.current !== null) window.cancelAnimationFrame(wheelFrame.current);
    };
  }, [onDomainChange]);

  useEffect(() => () => {
    if (dragFrame.current !== null) window.cancelAnimationFrame(dragFrame.current);
  }, []);

  useEffect(() => {
    function dismissPinnedTooltip(event: PointerEvent) {
      const element = root.current;
      if (element?.contains(event.target as Node)) return;
      setPinned(false);
      setHover(null);
    }
    document.addEventListener("pointerdown", dismissPinnedTooltip, true);
    return () => document.removeEventListener("pointerdown", dismissPinnedTooltip, true);
  }, []);

  function pointerPosition(event: ReactPointerEvent<HTMLCanvasElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { bounds, x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  function updateHover(event: ReactPointerEvent<HTMLCanvasElement>): boolean {
    const { x, y } = pointerPosition(event);
    const plotWidth = Math.max(1, size.width - MEASUREMENT_PLOT.left - MEASUREMENT_PLOT.right);
    const plotHeight = Math.max(1, size.height - MEASUREMENT_PLOT.top - MEASUREMENT_PLOT.bottom);
    if (x < MEASUREMENT_PLOT.left || x > MEASUREMENT_PLOT.left + plotWidth || y < MEASUREMENT_PLOT.top || y > MEASUREMENT_PLOT.top + plotHeight) {
      setHover(null);
      return false;
    }
    const time = domain[0] + (x - MEASUREMENT_PLOT.left) / plotWidth * (domain[1] - domain[0]);
    const hour = (y - MEASUREMENT_PLOT.top) / plotHeight * 24;
    const bin = Math.min(7, Math.floor(hour / 3));
    const tooltip = positionHeatmapTooltip(x, y, TOOLTIP_WIDTH, TOOLTIP_HEIGHT, size.width, size.height);
    setHover({
      left: tooltip.left,
      top: tooltip.top,
      time,
      bin,
      value: time < fullDomain[0] || time > fullDomain[1] ? null : heatmapValueAt(data, dates, time, hour),
      side: tooltip.side,
      anchorOffset: tooltip.anchorOffset,
    });
    return true;
  }

  function startDrag(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0) return;
    const { x, y } = pointerPosition(event);
    if (
      x < MEASUREMENT_PLOT.left || x > size.width - MEASUREMENT_PLOT.right ||
      y < MEASUREMENT_PLOT.top || y > size.height - MEASUREMENT_PLOT.bottom
    ) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, x, y, domain: domainRef.current, moved: false };
  }

  function moveDrag(event: ReactPointerEvent<HTMLCanvasElement>) {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) {
      if (!pinned) updateHover(event);
      return;
    }
    const { x, y } = pointerPosition(event);
    if (!active.moved && Math.hypot(x - active.x, y - active.y) < DRAG_THRESHOLD) return;
    if (!active.moved) {
      active.moved = true;
      setDragging(true);
      if (!pinned) setHover(null);
    }
    const plotWidth = Math.max(1, size.width - MEASUREMENT_PLOT.left - MEASUREMENT_PLOT.right);
    pendingDragDomain.current = panDomain(active.domain, (active.x - x) / plotWidth * (active.domain[1] - active.domain[0]), null);
    if (dragFrame.current !== null) return;
    dragFrame.current = window.requestAnimationFrame(() => {
      dragFrame.current = null;
      if (pendingDragDomain.current) onDomainChange(pendingDragDomain.current);
      pendingDragDomain.current = null;
    });
  }

  function finishDrag(event: ReactPointerEvent<HTMLCanvasElement>) {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
    if (!active.moved && updateHover(event)) setPinned(true);
  }

  function cancelDrag(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLCanvasElement>) {
    const current = domainRef.current;
    const span = current[1] - current[0];
    let next: TimeDomain | null = null;
    if (event.key === "ArrowLeft") next = panDomain(current, -span * 0.1, null);
    if (event.key === "ArrowRight") next = panDomain(current, span * 0.1, null);
    if (event.key === "+" || event.key === "=") next = zoomDomain(current, 0.8, 0.5, null);
    if (event.key === "-" || event.key === "_") next = zoomDomain(current, 1.25, 0.5, null);
    if (event.key === "Home" || event.key === "0") {
      resetDomain();
      event.preventDefault();
      return;
    }
    if (!next) return;
    event.preventDefault();
    onDomainChange(next);
  }

  function resetDomain() {
    pendingWheelDomain.current = null;
    pendingDragDomain.current = null;
    drag.current = null;
    setDragging(false);
    if (wheelFrame.current !== null) window.cancelAnimationFrame(wheelFrame.current);
    if (dragFrame.current !== null) window.cancelAnimationFrame(dragFrame.current);
    wheelFrame.current = null;
    dragFrame.current = null;
    onDomainChange(fullDomain);
  }

  return <div className={`history-heatmap${closing ? " history-heatmap--closing" : ""}`}>
    <div ref={root} className="history-heatmap__plot">
    <canvas
      ref={canvas}
      className={`history-heatmap__canvas${dragging ? " history-heatmap__canvas--dragging" : ""}`}
      role="application"
      aria-label="Diurnal heatmap across measurement history. Use arrow keys to pan, plus and minus to zoom, and Home to reset."
      tabIndex={0}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={finishDrag}
      onPointerCancel={cancelDrag}
      onPointerLeave={() => !drag.current && !pinned && setHover(null)}
      onDoubleClick={resetDomain}
      onKeyDown={handleKeyDown}
    />
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={{ top: MEASUREMENT_PLOT.top, right: CHART_PLOT_RIGHT, bottom: 10, left: 0 }}>
        <XAxis type="number" dataKey="time" domain={domain} allowDataOverflow ticks={timeTicks} interval={0} tickFormatter={formatChartTime} tick={{ fill: "var(--muted)", fontSize: 12 }} />
        <YAxis
          width={CHART_PLOT_LEFT}
          type="number"
          dataKey="hour"
          domain={[0, 24]}
          ticks={HOUR_TICKS}
          interval={0}
          reversed
          tickFormatter={hourLabel}
          tick={<TimeOfDayTick />}
          tickLine={{ stroke: "var(--line)" }}
          axisLine={{ stroke: "var(--line)" }}
        />
        <Scatter data={axisAnchors} fill="transparent" isAnimationActive={false} />
      </ScatterChart>
    </ResponsiveContainer>
    {hover && <div
      className={`history-heatmap__tooltip history-heatmap__tooltip--${hover.side}`}
      style={{ left: hover.left, top: hover.top, "--heatmap-tooltip-notch-top": `${hover.anchorOffset}px` } as CSSProperties}
    >
      <div className="history-heatmap__tooltip-eyebrow">
        <span className="history-heatmap__tooltip-eye">
          {selectedEye && <span className={`dot dot--${selectedEye.toLowerCase()}`} aria-hidden="true" />}
          {eyeLabel(selectedEye)}
        </span>
        <span>{formatChartTime(hover.time)}</span>
      </div>
      <div className="history-heatmap__tooltip-primary">
        {hover.value === null
          ? <span className="history-heatmap__tooltip-empty">No trend</span>
          : <><strong>{hover.value.toFixed(1)}</strong><span>mmHg</span></>}
      </div>
      <dl className="history-heatmap__tooltip-rows">
        <div><dt>Time</dt><dd>{DIURNAL_BIN_WINDOWS[hover.bin]}</dd></div>
      </dl>
    </div>}
    </div>
    <div className="history-heatmap__legend" role="img" aria-label={`Mean IOP color scale from ${colorDomain[0].toFixed(1)} to ${colorDomain[1].toFixed(1)} millimeters of mercury for the currently included readings across the full date history`}>
      <span className="history-heatmap__legend-label">Mean IOP</span>
      <div className="history-heatmap__legend-scale">
        <i aria-hidden="true" />
        <div className="history-heatmap__legend-ticks">
          <span>{colorDomain[0].toFixed(1)}</span>
          <span>{((colorDomain[0] + colorDomain[1]) / 2).toFixed(1)}</span>
          <span>{colorDomain[1].toFixed(1)}</span>
        </div>
      </div>
      <span className="history-heatmap__legend-unit">mmHg</span>
    </div>
  </div>;
}

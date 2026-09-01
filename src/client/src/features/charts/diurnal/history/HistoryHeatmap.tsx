import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { interpolateInferno } from "d3-scale-chromatic";
import {
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  type Eye,
  type Measurement,
  type MeasurementView,
  type SessionAggregation,
} from "../../../measurements";
import {
  navigateWheelDomain,
  panDomain,
  zoomDomain,
  type TimeDomain,
} from "../../chronological/chart/chartNavigation";
import {
  dimmedTimeRanges,
  heatmapVisibilityAlpha,
  type ChartDimming,
} from "../../chronological/chart/dimming";
import {
  CHART_PLOT_INSETS,
  CHART_PLOT_LEFT,
  CHART_PLOT_RIGHT,
} from "../../shared/chartLayout";
import { formatChartTime } from "../../shared/timeAxis";
import {
  heatmapBracket,
  heatmapColorPosition,
  heatmapValueAt,
  heatmapValueFromBracket,
  sharedHeatmapColorDomain,
} from "../../chronological/heatmap/heatmapInterpolation";
import { positionHeatmapTooltipAtDataPoint } from "../../chronological/measurements/tooltipPosition";
import { cssPixelsToRem } from "../../../../shared/lib/cssUnits";
import {
  RightAxisTicks,
  TimeAxisTick,
} from "../../chronological/chart/RightAxisTicks";
import {
  buildDiurnalHeatmapData,
  heatmapReadingsForView,
} from "./diurnalHeatmapData";
import {
  DIURNAL_BIN_COUNT,
  DIURNAL_BIN_WINDOWS,
  eyeName,
  historyHourTick,
} from "../format";

const HOUR_TICKS = Array.from({ length: 9 }, (_, index) => index * 3);
const DAY_MS = 86_400_000;
const HISTORY_PLOT_INSETS = { ...CHART_PLOT_INSETS, top: 0 } as const;
const TOOLTIP_WIDTH = 224;
const TOOLTIP_HEIGHT = 132;
const DRAG_THRESHOLD = 4;

type Props = {
  measurements: readonly Measurement[];
  measurementView: MeasurementView;
  sessionAggregation: SessionAggregation;
  eye: Eye;
  domain: TimeDomain;
  fullDomain: TimeDomain;
  timeTicks: number[];
  closing: boolean;
  showUncertainRegions: boolean;
  dimming: ChartDimming;
  onDomainChange: (domain: TimeDomain) => void;
};

type Hover = { time: number; hour: number; bin: number; value: number | null };
type Drag = {
  pointerId: number;
  x: number;
  y: number;
  domain: TimeDomain;
  moved: boolean;
};
type CanvasSize = { width: number; height: number };
type PositionedHover = Hover & {
  left: number;
  top: number;
  anchorOffset: number;
  side: "left" | "right";
};

function prepareCanvas(
  target: HTMLCanvasElement | null,
  size: CanvasSize,
): CanvasRenderingContext2D | null {
  if (!target || size.width <= 0 || size.height <= 0) return null;
  const pixelRatio = window.devicePixelRatio || 1;
  target.width = Math.round(size.width * pixelRatio);
  target.height = Math.round(size.height * pixelRatio);
  const context = target.getContext("2d");
  if (!context) return null;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, size.width, size.height);
  return context;
}

function plotSize(size: CanvasSize) {
  return {
    width: Math.max(
      1,
      size.width - HISTORY_PLOT_INSETS.left - HISTORY_PLOT_INSETS.right,
    ),
    height: Math.max(
      1,
      size.height - HISTORY_PLOT_INSETS.top - HISTORY_PLOT_INSETS.bottom,
    ),
  };
}

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

function TimeOfDayTick({
  x = 0,
  y = 0,
  payload,
}: {
  x?: number;
  y?: number;
  payload?: { value: number };
}) {
  if (!payload) return null;
  return (
    <text
      x={x - 8}
      y={payload.value === 0 ? y + 7 : y}
      fill="var(--muted)"
      fontSize={11}
      dominantBaseline="middle"
      textAnchor="end"
    >
      {historyHourTick(payload.value)}
    </text>
  );
}

function HeatmapTooltip({
  hover,
  eye,
  measurementView,
  sessionAggregation,
}: {
  hover: PositionedHover;
  eye: Eye;
  measurementView: MeasurementView;
  sessionAggregation: SessionAggregation;
}) {
  const source =
    measurementView === "raw"
      ? "Raw readings"
      : `${sessionAggregation === "median" ? "Median" : "Average"} sessions`;
  return (
    <div
      className={`history-heatmap__tooltip history-heatmap__tooltip--${hover.side}`}
      style={
        {
          left: hover.left,
          top: hover.top,
          "--heatmap-tooltip-notch-top": cssPixelsToRem(hover.anchorOffset),
        } as CSSProperties
      }
    >
      <div className="history-heatmap__tooltip-eyebrow">
        <span className="history-heatmap__tooltip-eye">
          <span
            className={`dot dot--${eye.toLowerCase()}`}
            aria-hidden="true"
          />
          {eyeName(eye)} eye
        </span>
        <span>{formatChartTime(hover.time)}</span>
      </div>
      <div className="history-heatmap__tooltip-primary">
        {hover.value === null ? (
          <span className="history-heatmap__tooltip-empty">No trend</span>
        ) : (
          <>
            <strong>{hover.value.toFixed(1)}</strong>
            <span>mmHg</span>
          </>
        )}
      </div>
      <dl className="history-heatmap__tooltip-rows">
        <div>
          <dt>Time</dt>
          <dd>{DIURNAL_BIN_WINDOWS[hover.bin]}</dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>{source}</dd>
        </div>
      </dl>
    </div>
  );
}

function HeatmapLegend({ domain }: { domain: readonly [number, number] }) {
  const [minimum, maximum] = domain;
  return (
    <div
      className="history-heatmap__legend"
      role="img"
      aria-label={`Mean IOP color scale from ${minimum.toFixed(1)} to ${maximum.toFixed(1)} millimeters of mercury for the currently included readings across the full date history`}
    >
      <span className="history-heatmap__legend-label">Mean IOP</span>
      <div className="history-heatmap__legend-scale">
        <i aria-hidden="true" />
        <div className="history-heatmap__legend-ticks">
          <span>{minimum.toFixed(1)}</span>
          <span>{((minimum + maximum) / 2).toFixed(1)}</span>
          <span>{maximum.toFixed(1)}</span>
        </div>
      </div>
      <span className="history-heatmap__legend-unit">mmHg</span>
    </div>
  );
}

export function HistoryHeatmap({
  measurements,
  measurementView,
  sessionAggregation,
  eye,
  domain,
  fullDomain,
  timeTicks,
  closing,
  showUncertainRegions,
  dimming,
  onDomainChange,
}: Props) {
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const uncertaintyCanvas = useRef<HTMLCanvasElement>(null);
  const dimmingCanvas = useRef<HTMLCanvasElement>(null);
  const dimmingRasterCanvas = useRef<HTMLCanvasElement | null>(null);
  const dimmingRasterImage = useRef<ImageData | null>(null);
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
  const heatmapReadings = useMemo(
    () =>
      heatmapReadingsForView(measurements, measurementView, sessionAggregation),
    [measurementView, measurements, sessionAggregation],
  );
  const heatmap = useMemo(
    () => buildDiurnalHeatmapData(heatmapReadings, eye, fullDomain),
    [eye, fullDomain, heatmapReadings],
  );
  const heatmapsByEye = useMemo(
    () =>
      (["OD", "OS"] as Eye[]).map((eye) =>
        buildDiurnalHeatmapData(heatmapReadings, eye, fullDomain),
      ),
    [fullDomain, heatmapReadings],
  );
  const axisAnchors = useMemo(
    () => [
      { time: domain[0], hour: 0 },
      { time: domain[1], hour: 24 },
    ],
    [domain],
  );
  const dates = heatmap.times;
  const colorDomain = useMemo(
    () => sharedHeatmapColorDomain(heatmapsByEye),
    [heatmapsByEye],
  );
  const positionedHover = useMemo(() => {
    if (!hover || size.width <= 0 || size.height <= 0) return null;
    const position = positionHeatmapTooltipAtDataPoint(
      hover.time,
      hover.hour,
      domain,
      TOOLTIP_WIDTH,
      TOOLTIP_HEIGHT,
      size.width,
      size.height,
      HISTORY_PLOT_INSETS,
    );
    return {
      ...hover,
      ...position,
    };
  }, [domain, hover, size]);
  domainRef.current = domain;

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const update = () =>
      setSize((current) => {
        const next = {
          width: element.clientWidth,
          height: element.clientHeight,
        };
        return current.width === next.width && current.height === next.height
          ? current
          : next;
      });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const context = prepareCanvas(canvas.current, size);
    if (!context) return;

    const { width: plotWidth, height: plotHeight } = plotSize(size);
    if (dates.length === 0) return;
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
    const image =
      rasterImage.current ??
      rasterContext.createImageData(rasterWidth, rasterHeight);
    rasterImage.current = image;
    image.data.fill(0);
    const xSamples = Array.from({ length: rasterWidth }, (_, x) => {
      const time =
        domain[0] +
        (x / Math.max(1, rasterWidth - 1)) * (domain[1] - domain[0]);
      return { time, bracket: heatmapBracket(dates, time) };
    });
    const ySamples = Array.from({ length: rasterHeight }, (_, y) => {
      const binPosition = Math.max(
        0,
        Math.min(7, ((y / Math.max(1, rasterHeight - 1)) * 24 - 1.5) / 3),
      );
      const upper = Math.floor(binPosition);
      return {
        upper,
        lower: Math.min(7, Math.ceil(binPosition)),
        ratio: binPosition - upper,
      };
    });
    for (let y = 0; y < rasterHeight; y += 1) {
      const ySample = ySamples[y];
      for (let x = 0; x < rasterWidth; x += 1) {
        const xSample = xSamples[x];
        const [left, right, timeRatio] = xSample.bracket;
        const value =
          xSample.time < fullDomain[0] || xSample.time > fullDomain[1]
            ? null
            : heatmapValueFromBracket(
                heatmap,
                left,
                right,
                timeRatio,
                ySample.upper,
                ySample.lower,
                ySample.ratio,
              );
        if (value === null) continue;
        const color =
          COLORS[Math.round(heatmapColorPosition(value, colorDomain) * 255)];
        const offset = (y * rasterWidth + x) * 4;
        image.data[offset] = color[0];
        image.data[offset + 1] = color[1];
        image.data[offset + 2] = color[2];
        image.data[offset + 3] = 255;
      }
    }
    rasterContext.putImageData(image, 0, 0);
    context.imageSmoothingEnabled = true;
    context.drawImage(
      raster,
      HISTORY_PLOT_INSETS.left,
      HISTORY_PLOT_INSETS.top,
      plotWidth,
      plotHeight,
    );
  }, [colorDomain, dates, domain, fullDomain, heatmap, size]);

  useEffect(() => {
    const context = prepareCanvas(uncertaintyCanvas.current, size);
    if (!context) return;

    const { width: plotWidth, height: plotHeight } = plotSize(size);
    if (dates.length === 0) return;
    const boundaries = dates.map((time, index) =>
      index === 0
        ? time - ((dates[1] ?? time + DAY_MS) - time) / 2
        : (dates[index - 1] + time) / 2,
    );
    boundaries.push(
      dates.length > 1
        ? dates.at(-1)! + (dates.at(-1)! - dates.at(-2)!) / 2
        : dates[0] + DAY_MS / 2,
    );
    const sparse = new Path2D();
    const historyLeft =
      HISTORY_PLOT_INSETS.left +
      ((fullDomain[0] - domain[0]) / Math.max(1, domain[1] - domain[0])) *
        plotWidth;
    const historyRight =
      HISTORY_PLOT_INSETS.left +
      ((fullDomain[1] - domain[0]) / Math.max(1, domain[1] - domain[0])) *
        plotWidth;
    for (let bin = 0; bin < DIURNAL_BIN_COUNT; bin += 1) {
      let row = 0;
      while (row < heatmap.lowSupport.length) {
        if (!heatmap.lowSupport[row][bin]) {
          row += 1;
          continue;
        }
        const start = row;
        while (
          row + 1 < heatmap.lowSupport.length &&
          heatmap.lowSupport[row + 1][bin]
        )
          row += 1;
        const x0 = Math.max(
          HISTORY_PLOT_INSETS.left,
          historyLeft,
          HISTORY_PLOT_INSETS.left +
            ((boundaries[start] - domain[0]) /
              Math.max(1, domain[1] - domain[0])) *
              plotWidth,
        );
        const x1 = Math.min(
          HISTORY_PLOT_INSETS.left + plotWidth,
          historyRight,
          HISTORY_PLOT_INSETS.left +
            ((boundaries[row + 1] - domain[0]) /
              Math.max(1, domain[1] - domain[0])) *
              plotWidth,
        );
        const y0 =
          HISTORY_PLOT_INSETS.top + (bin / DIURNAL_BIN_COUNT) * plotHeight;
        if (x1 > x0)
          sparse.rect(x0, y0, x1 - x0, plotHeight / DIURNAL_BIN_COUNT);
        row += 1;
      }
    }
    context.save();
    context.beginPath();
    context.rect(
      HISTORY_PLOT_INSETS.left,
      HISTORY_PLOT_INSETS.top,
      plotWidth,
      plotHeight,
    );
    context.clip();
    context.clip(sparse);
    context.strokeStyle = "rgba(255,255,255,.55)";
    context.lineWidth = 1;
    const stripeSpacing = 9;
    const stripeOrigin = historyLeft - HISTORY_PLOT_INSETS.left;
    const firstStripe =
      stripeOrigin +
      Math.floor((-plotHeight - stripeOrigin) / stripeSpacing) * stripeSpacing;
    for (
      let offset = firstStripe;
      offset < plotWidth + plotHeight;
      offset += stripeSpacing
    ) {
      context.beginPath();
      context.moveTo(
        HISTORY_PLOT_INSETS.left + offset,
        HISTORY_PLOT_INSETS.top + plotHeight,
      );
      context.lineTo(
        HISTORY_PLOT_INSETS.left + offset + plotHeight,
        HISTORY_PLOT_INSETS.top,
      );
      context.stroke();
    }
    context.restore();
  }, [dates, domain, fullDomain, heatmap, size]);

  useEffect(() => {
    const context = prepareCanvas(dimmingCanvas.current, size);
    if (!context) return;

    const { width: plotWidth, height: plotHeight } = plotSize(size);
    const domainSpan = Math.max(1, domain[1] - domain[0]);
    const rasterWidth = Math.max(1, Math.min(720, Math.ceil(plotWidth)));
    const rasterHeight = Math.max(1, Math.min(280, Math.ceil(plotHeight)));
    const raster =
      dimmingRasterCanvas.current ?? document.createElement("canvas");
    dimmingRasterCanvas.current = raster;
    if (raster.width !== rasterWidth || raster.height !== rasterHeight) {
      raster.width = rasterWidth;
      raster.height = rasterHeight;
      dimmingRasterImage.current = null;
    }
    const rasterContext = raster.getContext("2d");
    if (!rasterContext) return;
    const image =
      dimmingRasterImage.current ??
      rasterContext.createImageData(rasterWidth, rasterHeight);
    dimmingRasterImage.current = image;
    image.data.fill(0);
    for (let y = 0; y < rasterHeight; y += 1) {
      const bin = Math.min(
        DIURNAL_BIN_COUNT - 1,
        Math.floor((y / rasterHeight) * DIURNAL_BIN_COUNT),
      );
      for (let x = 0; x < rasterWidth; x += 1) {
        const time =
          domain[0] + (x / Math.max(1, rasterWidth - 1)) * domainSpan;
        const [left, right, timeRatio] = heatmapBracket(dates, time);
        const row = timeRatio < 0.5 ? left : right;
        const lowCertainty =
          showUncertainRegions &&
          time >= fullDomain[0] &&
          time <= fullDomain[1] &&
          (heatmap.lowSupport[row]?.[bin] ?? false);
        const alpha = 1 - heatmapVisibilityAlpha(dimming, time, lowCertainty);
        if (alpha <= 0) continue;
        const offset = (y * rasterWidth + x) * 4;
        image.data[offset] = 255;
        image.data[offset + 1] = 255;
        image.data[offset + 2] = 255;
        image.data[offset + 3] = Math.round(alpha * 255);
      }
    }
    rasterContext.putImageData(image, 0, 0);
    context.imageSmoothingEnabled = false;
    context.drawImage(
      raster,
      HISTORY_PLOT_INSETS.left,
      HISTORY_PLOT_INSETS.top,
      plotWidth,
      plotHeight,
    );
  }, [
    dates,
    dimming,
    domain,
    fullDomain,
    heatmap.lowSupport,
    showUncertainRegions,
    size,
  ]);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    function handleWheel(event: WheelEvent) {
      if (!event.ctrlKey && !event.shiftKey) return;
      event.preventDefault();
      event.stopPropagation();
      const bounds = element!.getBoundingClientRect();
      const plotWidth = Math.max(
        1,
        bounds.width - HISTORY_PLOT_INSETS.left - HISTORY_PLOT_INSETS.right,
      );
      const unit =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? 16
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? bounds.height
            : 1;
      const current = pendingWheelDomain.current ?? domainRef.current;
      pendingWheelDomain.current = navigateWheelDomain(
        current,
        null,
        event.shiftKey ? "zoom" : "pan",
        event.deltaX * unit,
        event.deltaY * unit,
        (event.clientX - bounds.left - HISTORY_PLOT_INSETS.left) / plotWidth,
        plotWidth,
      );
      if (wheelFrame.current !== null) return;
      wheelFrame.current = window.requestAnimationFrame(() => {
        wheelFrame.current = null;
        if (pendingWheelDomain.current)
          onDomainChange(pendingWheelDomain.current);
        pendingWheelDomain.current = null;
      });
    }
    element.addEventListener("wheel", handleWheel, {
      passive: false,
      capture: true,
    });
    return () => {
      element.removeEventListener("wheel", handleWheel, { capture: true });
      if (wheelFrame.current !== null)
        window.cancelAnimationFrame(wheelFrame.current);
    };
  }, [onDomainChange]);

  useEffect(
    () => () => {
      if (dragFrame.current !== null)
        window.cancelAnimationFrame(dragFrame.current);
    },
    [],
  );

  useEffect(() => {
    function dismissPinnedTooltip(event: PointerEvent) {
      const element = root.current;
      if (element?.contains(event.target as Node)) return;
      setPinned(false);
      setHover(null);
    }
    document.addEventListener("pointerdown", dismissPinnedTooltip, true);
    return () =>
      document.removeEventListener("pointerdown", dismissPinnedTooltip, true);
  }, []);

  function pointerPosition(event: ReactPointerEvent<HTMLCanvasElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      bounds,
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    };
  }

  function updateHover(event: ReactPointerEvent<HTMLCanvasElement>): boolean {
    const { x, y } = pointerPosition(event);
    const plotWidth = Math.max(
      1,
      size.width - HISTORY_PLOT_INSETS.left - HISTORY_PLOT_INSETS.right,
    );
    const plotHeight = Math.max(
      1,
      size.height - HISTORY_PLOT_INSETS.top - HISTORY_PLOT_INSETS.bottom,
    );
    if (
      x < HISTORY_PLOT_INSETS.left ||
      x > HISTORY_PLOT_INSETS.left + plotWidth ||
      y < HISTORY_PLOT_INSETS.top ||
      y > HISTORY_PLOT_INSETS.top + plotHeight
    ) {
      setHover(null);
      return false;
    }
    const time =
      domain[0] +
      ((x - HISTORY_PLOT_INSETS.left) / plotWidth) * (domain[1] - domain[0]);
    const hour = ((y - HISTORY_PLOT_INSETS.top) / plotHeight) * 24;
    const bin = Math.min(DIURNAL_BIN_COUNT - 1, Math.floor(hour / 3));
    setHover({
      time,
      hour,
      bin,
      value:
        time < fullDomain[0] || time > fullDomain[1]
          ? null
          : heatmapValueAt(heatmap, dates, time, hour),
    });
    return true;
  }

  function startDrag(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0) return;
    const { x, y } = pointerPosition(event);
    if (
      x < HISTORY_PLOT_INSETS.left ||
      x > size.width - HISTORY_PLOT_INSETS.right ||
      y < HISTORY_PLOT_INSETS.top ||
      y > size.height - HISTORY_PLOT_INSETS.bottom
    )
      return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      x,
      y,
      domain: domainRef.current,
      moved: false,
    };
  }

  function moveDrag(event: ReactPointerEvent<HTMLCanvasElement>) {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) {
      if (!pinned) updateHover(event);
      return;
    }
    const { x, y } = pointerPosition(event);
    if (
      !active.moved &&
      Math.hypot(x - active.x, y - active.y) < DRAG_THRESHOLD
    )
      return;
    if (!active.moved) {
      active.moved = true;
      setDragging(true);
      if (!pinned) setHover(null);
    }
    const plotWidth = Math.max(
      1,
      size.width - HISTORY_PLOT_INSETS.left - HISTORY_PLOT_INSETS.right,
    );
    pendingDragDomain.current = panDomain(
      active.domain,
      ((active.x - x) / plotWidth) * (active.domain[1] - active.domain[0]),
      null,
    );
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
    if (event.key === "+" || event.key === "=")
      next = zoomDomain(current, 0.8, 0.5, null);
    if (event.key === "-" || event.key === "_")
      next = zoomDomain(current, 1.25, 0.5, null);
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
    if (wheelFrame.current !== null)
      window.cancelAnimationFrame(wheelFrame.current);
    if (dragFrame.current !== null)
      window.cancelAnimationFrame(dragFrame.current);
    wheelFrame.current = null;
    dragFrame.current = null;
    onDomainChange(fullDomain);
  }

  return (
    <div
      className={`history-heatmap${closing ? " history-heatmap--closing" : ""}`}
    >
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
        <canvas
          ref={dimmingCanvas}
          className={`history-heatmap__dimming${showUncertainRegions || dimmedTimeRanges(dimming, domain).length > 0 ? " history-heatmap__dimming--visible" : ""}`}
          aria-hidden="true"
        />
        <canvas
          ref={uncertaintyCanvas}
          className={`history-heatmap__uncertainty${showUncertainRegions ? " history-heatmap__uncertainty--visible" : ""}`}
          aria-hidden="true"
        />
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart
            margin={{
              top: HISTORY_PLOT_INSETS.top,
              right: CHART_PLOT_RIGHT,
              bottom: 10,
              left: 0,
            }}
          >
            <XAxis
              type="number"
              dataKey="time"
              domain={domain}
              allowDataOverflow
              ticks={timeTicks}
              interval={0}
              tickFormatter={formatChartTime}
              tick={<TimeAxisTick />}
            />
            <YAxis
              width={CHART_PLOT_LEFT}
              type="number"
              dataKey="hour"
              domain={[0, 24]}
              ticks={HOUR_TICKS}
              interval={0}
              reversed
              tickFormatter={historyHourTick}
              tick={<TimeOfDayTick />}
              tickLine={{ stroke: "var(--line)" }}
              axisLine={{ stroke: "var(--line)" }}
            />
            <Scatter
              data={axisAnchors}
              fill="transparent"
              isAnimationActive={false}
            />
          </ScatterChart>
        </ResponsiveContainer>
        <RightAxisTicks
          className="chart-right-axis--heatmap"
          ticks={HOUR_TICKS}
          domain={[0, 24]}
          reversed
          formatTick={historyHourTick}
        />
        <div
          className="history-heatmap__tooltip-viewport"
          style={{
            inset: [
              HISTORY_PLOT_INSETS.top,
              HISTORY_PLOT_INSETS.right,
              HISTORY_PLOT_INSETS.bottom,
              HISTORY_PLOT_INSETS.left,
            ]
              .map(cssPixelsToRem)
              .join(" "),
          }}
        >
          {positionedHover && (
            <HeatmapTooltip
              hover={positionedHover}
              eye={eye}
              measurementView={measurementView}
              sessionAggregation={sessionAggregation}
            />
          )}
        </div>
      </div>
      <HeatmapLegend domain={colorDomain} />
    </div>
  );
}

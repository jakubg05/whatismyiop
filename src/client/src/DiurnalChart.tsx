import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  ErrorBar,
  ReferenceArea,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  type ScatterPointItem,
} from "recharts";
import type { Eye, MeasurementView, SessionAggregation } from "./analysis";
import type { DiurnalPoint, DiurnalYAxisScale } from "./comparison";
import { MeasurementViewControl, SeriesVisibilityControl, TargetControl, TargetLineOverlay } from "./main-chart/controls";
import { EyeToggleGroup } from "./shared";

export type DiurnalSeries = {
  id: string;
  name: string;
  color: string;
  data: DiurnalPoint[];
};

type InactiveState = {
  title: string;
  description: string;
};

type Props = {
  series: DiurnalSeries[];
  yScale: DiurnalYAxisScale;
  targetEnabled: boolean;
  targetValue: number;
  onTargetEnabledChange: (enabled: boolean) => void;
  onTargetValueChange: (value: number) => void;
  eye: Eye;
  onEyeChange: (eye: Eye) => void;
  measurementView: MeasurementView;
  sessionAggregation: SessionAggregation;
  onMeasurementViewChange: (view: MeasurementView) => void;
  onSessionAggregationChange: (aggregation: SessionAggregation) => void;
  onOpenSessionInfo: () => void;
  inactive?: InactiveState;
};

function eyeLabel(eye: Eye): string {
  return eye === "OD" ? "Right" : "Left";
}

function diurnalBinLabel(bin: number): string {
  const startHour = bin * 3;
  const endHour = startHour + 2;
  return `${String(startHour).padStart(2, "0")}:00–${String(endHour).padStart(2, "0")}:59`;
}

function diurnalTickLabel(value: number): string {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:00`;
}

type TooltipPayload = {
  payload: DiurnalPoint;
};

type PinnedTooltip = {
  point: DiurnalPoint;
  seriesId: string;
  left: number;
  top: number;
};

const DIURNAL_TOOLTIP_WIDTH = 224;
const DIURNAL_TOOLTIP_HEIGHT = 168;
const DIURNAL_TOOLTIP_GAP = 12;
const DIURNAL_TOOLTIP_INSET = 8;

function DiurnalTooltip({ active, payload, measurementView }: { active?: boolean; payload?: TooltipPayload[]; measurementView: MeasurementView }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="diurnal-tooltip">
      <div className="diurnal-tooltip__eyebrow">
        <span className="diurnal-tooltip__series">{point.periodLabel}</span>
      </div>
      <span className="diurnal-tooltip__eye"><span className={`dot dot--${point.eye.toLowerCase()}`} aria-hidden="true" />{eyeLabel(point.eye)}</span>
      <div className="diurnal-tooltip__primary">
        <strong>{point.mean.toFixed(1)}</strong>
        <span>mmHg mean</span>
      </div>
      <dl className="diurnal-tooltip__rows">
        <div><dt>Time</dt><dd>{diurnalBinLabel(point.bin)}</dd></div>
        <div><dt>SD</dt><dd>{point.sd.toFixed(1)} mmHg</dd></div>
        <div><dt>{measurementView === "raw" ? "Measurements" : "Sessions"}</dt><dd>{point.count}</dd></div>
      </dl>
    </div>
  );
}

export function DiurnalChart({
  series,
  yScale,
  targetEnabled,
  targetValue,
  onTargetEnabledChange,
  onTargetValueChange,
  eye,
  onEyeChange,
  measurementView,
  sessionAggregation,
  onMeasurementViewChange,
  onSessionAggregationChange,
  onOpenSessionInfo,
  inactive,
}: Props) {
  const [hiddenSeriesIds, setHiddenSeriesIds] = useState<Set<string>>(() => new Set());
  const [hoveredSeriesId, setHoveredSeriesId] = useState<string | null>(null);
  const [pinnedTooltip, setPinnedTooltip] = useState<PinnedTooltip | null>(null);
  const points = useMemo(() => series.flatMap((item) => item.data), [series]);
  const visibleSeries = series.filter((item) => !hiddenSeriesIds.has(item.id));
  const focusedSeriesId = pinnedTooltip?.seriesId ?? hoveredSeriesId;
  const inactiveState = inactive ?? (points.length === 0 ? {
    title: "No readings",
    description: `No ${eye === "OD" ? "right" : "left"}-eye ${measurementView === "raw" ? "measurements" : "sessions"} fall inside the active comparison segments.`,
  } : null);

  useEffect(() => {
    setPinnedTooltip(null);
  }, [eye, measurementView, sessionAggregation]);

  useEffect(() => {
    if (!pinnedTooltip) return;
    function dismissPinnedTooltip(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest(".diurnal-chart .recharts-symbols")) return;
      setPinnedTooltip(null);
      setHoveredSeriesId(null);
    }
    document.addEventListener("pointerdown", dismissPinnedTooltip, true);
    return () => document.removeEventListener("pointerdown", dismissPinnedTooltip, true);
  }, [pinnedTooltip]);

  if (inactiveState) {
    return <div className="diurnal-chart diurnal-chart--inactive">
      <span>{inactiveState.title}</span>
      <small>{inactiveState.description}</small>
    </div>;
  }

  return <>
    <div className="diurnal-chart">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart data={points} margin={{ top: 16, right: 20, bottom: 20, left: 0 }}>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          {Array.from({ length: 8 }, (_, bin) => bin % 2 === 1 && (
            <ReferenceArea key={bin} x1={bin * 180} x2={(bin + 1) * 180} fill="#e8ecee" fillOpacity={0.72} stroke="none" />
          ))}
          <XAxis
            type="number"
            dataKey="minuteOfDay"
            domain={[0, 1440]}
            ticks={Array.from({ length: 8 }, (_, bin) => bin * 180 + 90)}
            tickFormatter={diurnalTickLabel}
            minTickGap={18}
            tick={{ fill: "var(--muted)", fontSize: 11 }}
          />
          <YAxis width={52} type="number" dataKey="mean" domain={yScale.domain} ticks={yScale.ticks} allowDataOverflow allowDecimals={false} tick={{ fill: "var(--muted)", fontSize: 12 }} label={{ value: "mmHg", angle: -90, position: "insideLeft", fill: "var(--muted)" }} />
          <Tooltip active={pinnedTooltip ? false : undefined} content={<DiurnalTooltip measurementView={measurementView} />} cursor={false} isAnimationActive={false} />
          {visibleSeries.map((item) => {
            const dimmed = focusedSeriesId !== null && focusedSeriesId !== item.id;
            return (
            <Scatter
              key={item.id}
              name={item.name}
              data={item.data}
              fill={item.color}
              line={{ stroke: item.color, strokeWidth: 2 }}
              shape="circle"
              opacity={dimmed ? 0.14 : 1}
              isAnimationActive={false}
              onMouseEnter={() => {
                if (!pinnedTooltip) setHoveredSeriesId(item.id);
              }}
              onMouseLeave={() => {
                if (!pinnedTooltip) setHoveredSeriesId(null);
              }}
              onClick={(data: ScatterPointItem, _index, event) => {
                const point = data.payload as DiurnalPoint | undefined;
                if (!point) return;
                const x = data.tooltipPosition.x;
                const y = data.tooltipPosition.y;
                const chart = event.currentTarget.closest<HTMLElement>(".diurnal-chart");
                const chartWidth = chart?.clientWidth ?? 0;
                const chartHeight = chart?.clientHeight ?? 0;
                let left = x + DIURNAL_TOOLTIP_GAP + DIURNAL_TOOLTIP_WIDTH <= chartWidth - DIURNAL_TOOLTIP_INSET
                  ? x + DIURNAL_TOOLTIP_GAP
                  : Math.max(DIURNAL_TOOLTIP_INSET, x - DIURNAL_TOOLTIP_GAP - DIURNAL_TOOLTIP_WIDTH);
                let top = Math.max(
                  DIURNAL_TOOLTIP_INSET,
                  Math.min(y - DIURNAL_TOOLTIP_HEIGHT / 2, chartHeight - DIURNAL_TOOLTIP_HEIGHT - DIURNAL_TOOLTIP_INSET),
                );
                const hoverTooltip = chart?.querySelector<HTMLElement>(".recharts-tooltip-wrapper");
                if (chart && hoverTooltip && getComputedStyle(hoverTooltip).visibility !== "hidden") {
                  const chartBounds = chart.getBoundingClientRect();
                  const tooltipBounds = hoverTooltip.getBoundingClientRect();
                  left = tooltipBounds.left - chartBounds.left;
                  top = tooltipBounds.top - chartBounds.top;
                }
                setHoveredSeriesId(null);
                setPinnedTooltip({ point, seriesId: item.id, left, top });
              }}
            >
              <ErrorBar dataKey="sd" width={8} stroke={item.color} strokeWidth={1.5} opacity={dimmed ? 0.14 : 1} direction="y" />
            </Scatter>
          )})}
        </ScatterChart>
      </ResponsiveContainer>
      {targetEnabled && <TargetLineOverlay
        className="target-line-overlay--diurnal"
        value={targetValue}
        minimum={yScale.domain[0]}
        maximum={yScale.domain[1]}
      />}
      {pinnedTooltip && <div className="diurnal-tooltip-pinned" style={{ left: pinnedTooltip.left, top: pinnedTooltip.top }}>
        <DiurnalTooltip active payload={[{ payload: pinnedTooltip.point }]} measurementView={measurementView} />
      </div>}
    </div>
    <SeriesVisibilityControl
      label="Comparison segments"
      items={series.map((item) => ({ id: item.id, label: item.name, color: item.color, empty: item.data.length === 0 }))}
      hiddenIds={hiddenSeriesIds}
      onToggle={(id) => {
        setHoveredSeriesId(null);
        setPinnedTooltip(null);
        setHiddenSeriesIds((current) => {
          const next = new Set(current);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
      }}
    />
    <footer className="diurnal-controls" role="group" aria-label="Diurnal chart controls">
      <MeasurementViewControl
        label="Diurnal chart measurement view"
        view={measurementView}
        aggregation={sessionAggregation}
        onViewChange={onMeasurementViewChange}
        onAggregationChange={onSessionAggregationChange}
        onOpenExplanation={onOpenSessionInfo}
      />
      <TargetControl
        enabled={targetEnabled}
        value={targetValue}
        onEnabledChange={onTargetEnabledChange}
        onValueChange={onTargetValueChange}
      />
      <EyeToggleGroup mode="single" label="Eye shown in diurnal chart" value={eye} onChange={onEyeChange} />
    </footer>
  </>;
}

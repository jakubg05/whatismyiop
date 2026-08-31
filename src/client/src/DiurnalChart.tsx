import { useMemo } from "react";
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
} from "recharts";
import type { Eye } from "./analysis";
import type { DiurnalPoint } from "./comparison";
import { SegmentedControl } from "./shared";

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
  eye: Eye;
  onEyeChange: (eye: Eye) => void;
  inactive?: InactiveState;
};

function eyeLabel(eye: Eye): string {
  return eye === "OD" ? "Right eye" : "Left eye";
}

function diurnalBinLabel(bin: number): string {
  const startHour = bin * 3;
  const endHour = startHour + 2;
  return `${String(startHour).padStart(2, "0")}:00–${String(endHour).padStart(2, "0")}:59`;
}

function diurnalTickLabel(value: number): string {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:00`;
}

function DiurnalTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: DiurnalPoint }> }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="diurnal-tooltip">
      <strong>{point.periodLabel} · {eyeLabel(point.eye)}</strong>
      <span>{diurnalBinLabel(point.bin)}</span>
      <span>Mean: {point.mean.toFixed(1)} mmHg</span>
      <span>SD: {point.sd.toFixed(1)} mmHg</span>
      <span>Sessions: {point.count}</span>
    </div>
  );
}

export function DiurnalChart({ series, eye, onEyeChange, inactive }: Props) {
  const points = useMemo(() => series.flatMap((item) => item.data), [series]);
  const inactiveState = inactive ?? (points.length === 0 ? {
    title: "No readings",
    description: `No ${eye === "OD" ? "right" : "left"}-eye sessions fall inside the active comparison segments.`,
  } : null);

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
          <YAxis width={52} type="number" dataKey="mean" domain={["dataMin - 2", "dataMax + 2"]} allowDecimals={false} tick={{ fill: "var(--muted)", fontSize: 12 }} label={{ value: "mmHg", angle: -90, position: "insideLeft", fill: "var(--muted)" }} />
          <Tooltip content={<DiurnalTooltip />} />
          {series.map((item) => (
            <Scatter key={item.id} name={item.name} data={item.data} fill={item.color} line={{ stroke: item.color, strokeWidth: 2 }} shape="circle">
              <ErrorBar dataKey="sd" width={8} stroke={item.color} strokeWidth={1.5} direction="y" />
            </Scatter>
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
    <div className="diurnal-series-status" aria-label="Comparison segments">
      {series.map((item) => <div key={item.id} className="diurnal-series-status__item">
        <span className="diurnal-series-status__swatch" style={{ backgroundColor: item.color }} aria-hidden="true" />
        <span className="diurnal-series-status__label" title={item.name}>{item.name}</span>
        {item.data.length === 0 && <em>No readings</em>}
      </div>)}
    </div>
    <footer className="diurnal-controls">
      <SegmentedControl label="Eye shown in diurnal chart" value={eye} options={["OS", "OD"] as const} optionLabel={(option) => option === "OD" ? "Right" : "Left"} onChange={onEyeChange} />
    </footer>
  </>;
}

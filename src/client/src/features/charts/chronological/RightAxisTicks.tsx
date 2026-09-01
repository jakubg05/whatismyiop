import type { CSSProperties } from "react";
import { formatChartTime } from "../timeAxis";

type Props = {
  ticks: readonly number[];
  domain: readonly [number, number];
  reversed?: boolean;
  className?: string;
  formatTick?: (tick: number) => string;
};

export function RightAxisTicks({
  ticks,
  domain,
  reversed = false,
  className = "",
  formatTick = String,
}: Props) {
  const span = Math.max(1, domain[1] - domain[0]);

  return (
    <div className={`chart-right-axis ${className}`.trim()} aria-hidden="true">
      {ticks.map((tick) => {
        const ratio = reversed
          ? (tick - domain[0]) / span
          : (domain[1] - tick) / span;
        const edge = ratio <= 0 ? " chart-right-axis__tick--top" : "";
        return (
          <span
            key={tick}
            className={`chart-right-axis__tick${edge}`}
            style={{ "--tick-position": `${ratio * 100}%` } as CSSProperties}
          >
            <i />
            <span>{formatTick(tick)}</span>
          </span>
        );
      })}
    </div>
  );
}

type TimeAxisTickProps = {
  x?: number;
  y?: number;
  index?: number;
  visibleTicksCount?: number;
  payload?: { value: number };
};

export function TimeAxisTick({
  x = 0,
  y = 0,
  index = 0,
  visibleTicksCount = 0,
  payload,
}: TimeAxisTickProps) {
  if (!payload) return null;
  const textAnchor =
    index === 0 ? "start" : index === visibleTicksCount - 1 ? "end" : "middle";

  return (
    <text
      x={x}
      y={y}
      dy="0.9em"
      fill="var(--muted)"
      fontSize={12}
      textAnchor={textAnchor}
    >
      {formatChartTime(payload.value)}
    </text>
  );
}

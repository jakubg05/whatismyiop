import type { CSSProperties } from "react";
import {
  type Eye,
  type SessionAggregation,
  type SessionPoint,
} from "../../../measurements";
import { formatFullTime } from "../../../../shared/lib/wallClock";
import { interpolateTrend, interpolateTrendEstimate } from "../trend/trend";
import {
  TREND_TOOLTIP_WIDTH,
  type CanvasTrendPoint,
  type PositionedCanvasPoint,
} from "./measurementCanvasModel";

function eyeLabel(eye: Eye): string {
  return eye === "OD" ? "Right" : "Left";
}

function formatIop(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function EyeName({ eye }: { eye: Eye }) {
  return (
    <span className="measurement-canvas-tooltip__eye">
      <span className={`dot dot--${eye.toLowerCase()}`} aria-hidden="true" />
      {eyeLabel(eye)}
    </span>
  );
}

function PressureValue({
  value,
  className,
}: {
  value: string;
  className: string;
}) {
  return (
    <span className={className}>
      <span className="measurement-canvas-tooltip__value">{value}</span>
      <span className="measurement-canvas-tooltip__unit">mmHg</span>
    </span>
  );
}

function TrendTooltipContent({ point }: { point: CanvasTrendPoint }) {
  const previous = interpolateTrend(
    point.trend.estimates,
    point.time - 30 * 86_400_000,
  );
  const change = previous === null ? null : point.iop - previous;
  const estimate = interpolateTrendEstimate(point.trend.estimates, point.time);
  const usesRawReadings = point.trend.view === "raw";
  const sourceLabel = usesRawReadings
    ? "Raw readings"
    : `${point.trend.aggregation === "median" ? "Median" : "Average"} sessions`;

  return (
    <>
      <div className="measurement-canvas-tooltip__eyebrow">
        <span>Trend</span>
        <span>{formatFullTime(point.time)}</span>
      </div>
      <div className="measurement-canvas-tooltip__trend-primary">
        <EyeName eye={point.eye} />
        <PressureValue
          className="measurement-canvas-tooltip__trend-reading"
          value={point.iop.toFixed(1)}
        />
      </div>
      <dl className="measurement-canvas-tooltip__rows measurement-canvas-tooltip__trend-row">
        {estimate && (
          <div>
            <dt>Uncertainty range</dt>
            <dd>
              {estimate.lower.toFixed(1)}–{estimate.upper.toFixed(1)}
              <span className="measurement-canvas-tooltip__unit">mmHg</span>
            </dd>
          </div>
        )}
        <div>
          <dt>Source</dt>
          <dd>{sourceLabel}</dd>
        </div>
        <div>
          <dt>{usesRawReadings ? "Readings" : "Sessions"}</dt>
          <dd>{point.trend.observationCount}</dd>
        </div>
        {change !== null && (
          <div>
            <dt>30d change</dt>
            <dd>
              {change >= 0 ? "+" : ""}
              {change.toFixed(1)}
              <span className="measurement-canvas-tooltip__unit">mmHg</span>
            </dd>
          </div>
        )}
      </dl>
    </>
  );
}

function SessionTooltipContent({
  point,
  aggregation,
  sessionPoints,
}: {
  point: Extract<PositionedCanvasPoint["point"], { kind: "session" }>;
  aggregation: SessionAggregation;
  sessionPoints: SessionPoint[];
}) {
  return (
    <>
      <div className="measurement-canvas-tooltip__eyebrow">
        <span>{aggregation}</span>
        <span>{formatFullTime(point.time)}</span>
      </div>
      <div className="measurement-canvas-tooltip__session-values">
        {sessionPoints.map((sessionPoint) => (
          <div
            key={sessionPoint.eye}
            className="measurement-canvas-tooltip__session-value"
          >
            <EyeName eye={sessionPoint.eye} />
            <PressureValue
              className="measurement-canvas-tooltip__session-reading"
              value={formatIop(sessionPoint.iop)}
            />
          </div>
        ))}
      </div>
      <dl className="measurement-canvas-tooltip__rows">
        {sessionPoints.map((sessionPoint) => (
          <div key={sessionPoint.eye}>
            <dt>{eyeLabel(sessionPoint.eye)}</dt>
            <dd>
              {sessionPoint.measurements
                .map((measurement) => measurement.iop)
                .join(", ")}
              <span className="measurement-canvas-tooltip__unit">mmHg</span>
            </dd>
          </div>
        ))}
      </dl>
    </>
  );
}

function RawReadingTooltipContent({
  point,
}: {
  point: Extract<PositionedCanvasPoint["point"], { kind: "raw" }>;
}) {
  return (
    <>
      <div className="measurement-canvas-tooltip__eyebrow">
        <EyeName eye={point.eye} />
        <span>{formatFullTime(point.time)}</span>
      </div>
      <div className="measurement-canvas-tooltip__primary">
        <span className="measurement-canvas-tooltip__value">
          {formatIop(point.iop)}
        </span>
        <span className="measurement-canvas-tooltip__unit">mmHg</span>
      </div>
      <dl className="measurement-canvas-tooltip__rows">
        <div>
          <dt>Quality</dt>
          <dd>{point.measurement.quality}</dd>
        </div>
        {point.measurement.position && (
          <div>
            <dt>Position</dt>
            <dd>{point.measurement.position}</dd>
          </div>
        )}
        <div>
          <dt>Source</dt>
          <dd>Row {point.measurement.sourceRow}</dd>
        </div>
      </dl>
    </>
  );
}

export function MeasurementTooltip({
  positionedPoint,
  sessionAggregation,
  focusedSessionPoints,
}: {
  positionedPoint: PositionedCanvasPoint;
  sessionAggregation: SessionAggregation;
  focusedSessionPoints: SessionPoint[];
}) {
  const { point } = positionedPoint;
  return (
    <div
      className={`measurement-canvas-tooltip${point.kind === "trend" ? " measurement-canvas-tooltip--trend measurement-canvas-tooltip--notch-bottom" : ""}`}
      style={
        {
          left: positionedPoint.left,
          top: positionedPoint.top,
          "--trend-tooltip-notch-left": `${positionedPoint.trendNotchLeft ?? TREND_TOOLTIP_WIDTH / 2}px`,
        } as CSSProperties
      }
    >
      {point.kind === "trend" ? (
        <TrendTooltipContent point={point} />
      ) : point.kind === "session" ? (
        <SessionTooltipContent
          point={point}
          aggregation={sessionAggregation}
          sessionPoints={focusedSessionPoints}
        />
      ) : (
        <RawReadingTooltipContent point={point} />
      )}
    </div>
  );
}

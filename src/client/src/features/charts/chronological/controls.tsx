import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type {
  Eye,
  MeasurementView,
  SessionAggregation,
} from "../../measurements";
import {
  DateInput,
  MaterialSymbol,
  Toggle,
  useDismissiblePopover,
} from "../../../shared/ui";

export const ChartDateTag = forwardRef<
  HTMLDivElement,
  {
    value: string;
    timeValue: string;
    displayValue?: string;
    displayTime?: string;
    ariaLabel: string;
    active?: boolean;
    disabled?: boolean;
    alignRight?: boolean;
    secondRow?: boolean;
    className?: string;
    style?: CSSProperties;
    onChange?: (value: string) => void;
    onTimeChange?: (value: string) => void;
    present?: { checked: boolean; onChange?: () => void };
  }
>(function ChartDateTag(
  {
    value,
    timeValue,
    displayValue,
    displayTime,
    ariaLabel,
    active = false,
    disabled = false,
    alignRight = false,
    secondRow = false,
    className = "",
    style,
    onChange,
    onTimeChange,
    present,
  },
  ref,
) {
  return (
    <div
      ref={ref}
      style={style}
      className={`selection-handle__date-control${active ? " selection-handle__date-control--active" : " selection-handle__date-control--readonly"}${!active && present?.checked ? " selection-handle__date-control--present" : ""}${alignRight ? " selection-handle__date-control--right" : ""}${secondRow ? " selection-handle__date-control--second-row" : ""} ${className}`.trim()}
      onPointerDown={(event) => active && event.stopPropagation()}
    >
      <div className="selection-handle__date-fields">
        {active ? (
          <>
            <DateInput
              className="selection-handle__date-input"
              aria-label={ariaLabel}
              disabled={disabled}
              value={value}
              onChange={(event) => onChange?.(event.target.value)}
            />
            <input
              className="selection-handle__time-input"
              type="time"
              aria-label={`${ariaLabel} time`}
              disabled={disabled}
              value={timeValue}
              onChange={(event) => onTimeChange?.(event.target.value)}
            />
          </>
        ) : present?.checked ? (
          <output
            className="selection-handle__date-value"
            aria-label={ariaLabel}
          >
            Now
          </output>
        ) : (
          <>
            <output
              className="selection-handle__date-value"
              aria-label={ariaLabel}
            >
              {displayValue ?? value}
            </output>
            <output
              className="selection-handle__time-value"
              aria-label={`${ariaLabel} time`}
            >
              {displayTime ?? timeValue}
            </output>
          </>
        )}
      </div>
      {active && present && (
        <div className="selection-handle__present-control">
          <span>Present</span>
          <Toggle
            className="selection-handle__present-toggle"
            label="Present"
            checked={present.checked}
            disabled={!present.onChange}
            onChange={() => present.onChange?.()}
          />
        </div>
      )}
    </div>
  );
});

export function ChartSelect<T extends string>({
  label,
  value,
  options,
  action,
  onChange,
  onTrigger,
  pressed,
  className = "",
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  action?: { label: string; onSelect: () => void };
  onChange: (value: T) => void;
  onTrigger?: () => void;
  pressed?: boolean;
  className?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  useDismissiblePopover(root, open, () => setOpen(false));
  const selectedLabel =
    options.find((option) => option.value === value)?.label ?? value;

  return (
    <div
      ref={root}
      className={`ui-chart-select ${className}`.trim()}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setOpen(false);
      }}
    >
      <button
        className="ui-chart-select__trigger"
        type="button"
        aria-pressed={pressed}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          onTrigger?.();
          setOpen((current) => !current);
        }}
      >
        <span className="ui-chart-select__label">{label}</span>
        <span className="ui-chart-select__value">
          <span>{selectedLabel}</span>
          <MaterialSymbol name="expand_more" />
        </span>
      </button>
      {open && (
        <div className="ui-chart-select__menu" role="menu" aria-label={label}>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-checked={value === option.value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              <span>{option.label}</span>
              {value === option.value && <MaterialSymbol name="check" />}
            </button>
          ))}
          {action && (
            <div className="ui-chart-select__menu-action">
              <button
                className="ui-chart-select__menu-link"
                type="button"
                role="menuitem"
                onClick={() => {
                  action.onSelect();
                  setOpen(false);
                }}
              >
                <span>{action.label}</span>
                <MaterialSymbol name="chevron_right" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function MeasurementViewControl({
  label,
  view,
  aggregation,
  onViewChange,
  onAggregationChange,
  onOpenExplanation,
}: {
  label: string;
  view: MeasurementView;
  aggregation: SessionAggregation;
  onViewChange: (view: MeasurementView) => void;
  onAggregationChange: (aggregation: SessionAggregation) => void;
  onOpenExplanation: () => void;
}) {
  return (
    <div className="measurement-view-control" role="group" aria-label={label}>
      <ChartSelect
        className={`measurement-view-control__sessions${view === "sessions" ? " measurement-view-control__sessions--active" : ""}`}
        label="Sessions"
        value={aggregation}
        options={[
          { value: "median", label: "Median" },
          { value: "average", label: "Average" },
        ]}
        action={{ label: "How sessions work", onSelect: onOpenExplanation }}
        pressed={view === "sessions"}
        onTrigger={() => onViewChange("sessions")}
        onChange={(nextAggregation) => {
          onAggregationChange(nextAggregation);
          onViewChange("sessions");
        }}
      />
      <button
        className="measurement-view-control__raw"
        type="button"
        aria-pressed={view === "raw"}
        onClick={() => onViewChange("raw")}
      >
        Raw
      </button>
    </div>
  );
}

export function SeriesVisibilityControl({
  label,
  items,
  hiddenIds,
  onToggle,
}: {
  label: string;
  items: readonly {
    id: string;
    label: string;
    color: string;
    empty?: boolean;
  }[];
  hiddenIds: ReadonlySet<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="series-visibility-control" role="group" aria-label={label}>
      {items.map((item) => {
        const visible = !hiddenIds.has(item.id);
        return (
          <button
            key={item.id}
            type="button"
            className={`series-visibility-control__item${visible ? "" : " series-visibility-control__item--hidden"}`}
            aria-pressed={visible}
            title={`${visible ? "Hide" : "Show"} ${item.label}`}
            onClick={() => onToggle(item.id)}
          >
            <span
              className="series-visibility-control__swatch"
              style={{ backgroundColor: item.color }}
              aria-hidden="true"
            />
            <span
              className="series-visibility-control__label"
              title={item.label}
            >
              {item.label}
            </span>
            {item.empty && <em>No readings</em>}
          </button>
        );
      })}
    </div>
  );
}

function ChartPopoverControl({
  label,
  value,
  menuLabel,
  className = "",
  children,
}: {
  label: string;
  value: string;
  menuLabel: string;
  className?: string;
  children: (close: () => void) => ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  useDismissiblePopover(root, open, () => setOpen(false));

  return (
    <div
      ref={root}
      className={`ui-chart-select ${className}`.trim()}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setOpen(false);
      }}
    >
      <button
        className="ui-chart-select__trigger"
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="ui-chart-select__label">{label}</span>
        <span className="ui-chart-select__value">
          <span>{value}</span>
          <MaterialSymbol name="expand_more" />
        </span>
      </button>
      {open && (
        <div
          className="ui-chart-select__menu chart-control__menu"
          role="dialog"
          aria-label={menuLabel}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function TargetControl({
  enabled,
  value,
  onEnabledChange,
  onValueChange,
}: {
  enabled: boolean;
  value: number;
  onEnabledChange: (enabled: boolean) => void;
  onValueChange: (value: number) => void;
}) {
  const minimumTarget = 0.1;
  const maximumTarget = 100;
  const [draft, setDraft] = useState(String(value));

  useEffect(() => setDraft(String(value)), [value]);

  function commitValue() {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed) || parsed < minimumTarget) {
      setDraft(String(value));
      return;
    }
    const next = Math.min(maximumTarget, Math.round(parsed * 10) / 10);
    setDraft(String(next));
    onValueChange(next);
  }

  function updateValue(nextDraft: string) {
    const parsed = Number(nextDraft);
    if (!Number.isFinite(parsed) || parsed < minimumTarget) {
      setDraft(nextDraft);
      return;
    }
    const next = Math.min(maximumTarget, Math.round(parsed * 10) / 10);
    setDraft(parsed > maximumTarget ? String(maximumTarget) : nextDraft);
    onValueChange(next);
    if (!enabled) onEnabledChange(true);
  }

  return (
    <ChartPopoverControl
      label="Target"
      value={enabled ? `${value} mmHg` : "Off"}
      menuLabel="Target pressure settings"
      className="target-control"
    >
      {() => (
        <>
          <div className="chart-control__section">
            <div className="chart-control__row">
              <span>Show target</span>
              <Toggle
                className="chart-control__toggle"
                label="Show target pressure"
                checked={enabled}
                onChange={() => onEnabledChange(!enabled)}
              />
            </div>
          </div>
          <div
            className="chart-control__section chart-control__target-value"
            aria-disabled={!enabled}
          >
            <div className="chart-control__target-input-group">
              <input
                className="chart-control__target-input"
                type="number"
                min={minimumTarget}
                max={maximumTarget}
                step="0.1"
                inputMode="decimal"
                aria-label="Target pressure in mmHg"
                disabled={!enabled}
                value={draft}
                onChange={(event) => updateValue(event.target.value)}
                onBlur={commitValue}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                  if (event.key === "Escape") {
                    setDraft(String(value));
                    event.currentTarget.blur();
                  }
                }}
              />
              <span>mmHg</span>
            </div>
          </div>
        </>
      )}
    </ChartPopoverControl>
  );
}

export function TargetLineOverlay({
  value,
  minimum,
  maximum,
  className = "",
}: {
  value: number;
  minimum: number;
  maximum: number;
  className?: string;
}) {
  const position =
    maximum === minimum
      ? 50
      : Math.max(
          0,
          Math.min(100, ((maximum - value) / (maximum - minimum)) * 100),
        );
  return (
    <div
      className={`target-line-overlay ${className}`.trim()}
      style={{ "--target-line-position": `${position}%` } as CSSProperties}
      aria-hidden="true"
    >
      <div className="target-line-overlay__rule">
        <span>Target {value} mmHg</span>
      </div>
    </div>
  );
}

function ChartControlOption({
  label,
  colorClass,
  checked,
  disabled = false,
  multiple = false,
  onClick,
}: {
  label: string;
  colorClass?: string;
  checked: boolean;
  disabled?: boolean;
  multiple?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="chart-control__option"
      type="button"
      role={multiple ? "checkbox" : "radio"}
      aria-checked={checked}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="chart-control__option-copy">
        {colorClass && (
          <span className={`dot ${colorClass}`} aria-hidden="true" />
        )}
        <span>{label}</span>
      </span>
      {checked && <MaterialSymbol name="check" />}
    </button>
  );
}

export function HeatmapControl({
  visible,
  eye,
  uncertainRegions,
  onToggleVisible,
  onEyeChange,
  onToggleUncertainRegions,
  onOpenExplanation,
}: {
  visible: boolean;
  eye: Eye;
  uncertainRegions: boolean;
  onToggleVisible: () => void;
  onEyeChange: (eye: Eye) => void;
  onToggleUncertainRegions: () => void;
  onOpenExplanation: () => void;
}) {
  const selectedLabel = visible ? (eye === "OS" ? "Left" : "Right") : "Off";

  return (
    <ChartPopoverControl
      label="Heatmap"
      value={selectedLabel}
      menuLabel="Heatmap settings"
      className="heatmap-control"
    >
      {(close) => (
        <>
          <div className="chart-control__section">
            <div className="chart-control__row">
              <span>Show heatmap</span>
              <Toggle
                className="chart-control__toggle"
                label="Show heatmap"
                checked={visible}
                onChange={onToggleVisible}
              />
            </div>
          </div>
          <div className="chart-control__section" aria-disabled={!visible}>
            <div className="chart-control__row">
              <span>Show uncertain regions</span>
              <Toggle
                className="chart-control__toggle"
                label="Show uncertain heatmap regions"
                checked={uncertainRegions}
                disabled={!visible}
                onChange={onToggleUncertainRegions}
              />
            </div>
          </div>
          <div
            className="chart-control__section"
            role="group"
            aria-label="Eye shown in heatmap"
            aria-disabled={!visible}
          >
            {(["OS", "OD"] as Eye[]).map((option) => (
              <ChartControlOption
                key={option}
                label={option === "OS" ? "Left" : "Right"}
                colorClass={`dot--${option.toLowerCase()}`}
                checked={eye === option}
                disabled={!visible}
                onClick={() => onEyeChange(option)}
              />
            ))}
          </div>
          <div className="ui-chart-select__menu-action">
            <button
              className="ui-chart-select__menu-link"
              type="button"
              onClick={() => {
                onOpenExplanation();
                close();
              }}
            >
              <span>How heatmaps work</span>
              <MaterialSymbol name="chevron_right" />
            </button>
          </div>
        </>
      )}
    </ChartPopoverControl>
  );
}

export function TrendControl({
  visible,
  eyes,
  onToggleVisible,
  onToggleEye,
  onOpenExplanation,
}: {
  visible: boolean;
  eyes: Record<Eye, boolean>;
  onToggleVisible: () => void;
  onToggleEye: (eye: Eye) => void;
  onOpenExplanation: () => void;
}) {
  return (
    <ChartPopoverControl
      label="Trend"
      value={visible ? "On" : "Off"}
      menuLabel="Trend settings"
      className="trend-control"
    >
      {(close) => (
        <>
          <div className="chart-control__section">
            <div className="chart-control__row">
              <span>Show trend</span>
              <Toggle
                className="chart-control__toggle"
                label="Show trend"
                checked={visible}
                onChange={onToggleVisible}
              />
            </div>
          </div>
          <div
            className="chart-control__section"
            role="group"
            aria-label="Eyes shown in trend"
            aria-disabled={!visible}
          >
            {(["OS", "OD"] as Eye[]).map((option) => (
              <ChartControlOption
                key={option}
                label={option === "OS" ? "Left" : "Right"}
                colorClass={`dot--${option.toLowerCase()}`}
                checked={eyes[option]}
                disabled={!visible}
                multiple
                onClick={() => onToggleEye(option)}
              />
            ))}
          </div>
          <div className="ui-chart-select__menu-action">
            <button
              className="ui-chart-select__menu-link"
              type="button"
              onClick={() => {
                onOpenExplanation();
                close();
              }}
            >
              <span>How trends work</span>
              <MaterialSymbol name="chevron_right" />
            </button>
          </div>
        </>
      )}
    </ChartPopoverControl>
  );
}

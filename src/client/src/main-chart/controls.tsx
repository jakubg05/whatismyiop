import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
} from "react";
import type { Eye } from "../analysis";
import { DateInput, Toggle } from "../shared/ui";
import type { TrendMode } from "./trend";

export const ChartDateTag = forwardRef<HTMLDivElement, {
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
}>(function ChartDateTag({
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
}, ref) {
  return (
    <div
      ref={ref}
      style={style}
      className={`selection-handle__date-control${active ? " selection-handle__date-control--active" : " selection-handle__date-control--readonly"}${!active && present?.checked ? " selection-handle__date-control--present" : ""}${alignRight ? " selection-handle__date-control--right" : ""}${secondRow ? " selection-handle__date-control--second-row" : ""} ${className}`.trim()}
      onPointerDown={(event) => active && event.stopPropagation()}
    >
      <div className="selection-handle__date-fields">
        {active ? <>
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
        </> : present?.checked
          ? <output className="selection-handle__date-value" aria-label={ariaLabel}>Now</output>
          : <>
            <output className="selection-handle__date-value" aria-label={ariaLabel}>{displayValue ?? value}</output>
            <output className="selection-handle__time-value" aria-label={`${ariaLabel} time`}>{displayTime ?? timeValue}</output>
          </>}
      </div>
      {active && present && <div className="selection-handle__present-control">
        <span>Present</span>
        <Toggle
          className="selection-handle__present-toggle"
          label="Present"
          checked={present.checked}
          disabled={!present.onChange}
          onChange={present.onChange}
        />
      </div>}
    </div>
  );
});

export function ChartToggle({ label, colorClass, checked, ariaDisabled = false, onChange }: {
  label: string;
  colorClass?: string;
  checked: boolean;
  ariaDisabled?: boolean;
  onChange: () => void;
}) {
  return (
    <label className={`ui-chart-toggle${ariaDisabled ? " ui-chart-toggle--disabled" : ""}`}>
      <input type="checkbox" checked={checked} aria-disabled={ariaDisabled} onChange={(event) => {
        if (ariaDisabled) event.preventDefault();
        onChange();
      }} />
      {colorClass && <span className={`dot ${colorClass}`} aria-hidden="true" />}
      <span>{label}</span>
    </label>
  );
}

export function ChartSelect<T extends string>({ label, value, options, action, onChange, onTrigger, pressed, className = "" }: {
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
  const selectedLabel = options.find((option) => option.value === value)?.label ?? value;

  useEffect(() => {
    if (!open) return;
    function closeOutside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", closeOutside);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function closeOnBlur(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
  }

  return (
    <div ref={root} className={`ui-chart-select ${className}`.trim()} onBlur={closeOnBlur}>
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
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
        </span>
      </button>
      {open && <div className="ui-chart-select__menu" role="menu" aria-label={label}>
        {options.map((option) => <button
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
          {value === option.value && <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8 3 3 7-7" /></svg>}
        </button>)}
        {action && <div className="ui-chart-select__menu-action">
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
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 4 4 4-4 4" /></svg>
          </button>
        </div>}
      </div>}
    </div>
  );
}

function ChartControlOption({ label, colorClass, checked, disabled = false, multiple = false, onClick }: {
  label: string;
  colorClass?: string;
  checked: boolean;
  disabled?: boolean;
  multiple?: boolean;
  onClick: () => void;
}) {
  return <button
    className="chart-control__option"
    type="button"
    role={multiple ? "checkbox" : "radio"}
    aria-checked={checked}
    disabled={disabled}
    onClick={onClick}
  >
    <span className="chart-control__option-copy">
      {colorClass && <span className={`dot ${colorClass}`} aria-hidden="true" />}
      <span>{label}</span>
    </span>
    {checked && <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8 3 3 7-7" /></svg>}
  </button>;
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
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selectedLabel = visible ? eye === "OS" ? "Left" : "Right" : "Off";

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return <div ref={root} className="ui-chart-select heatmap-control">
    <button
      className="ui-chart-select__trigger"
      type="button"
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={() => setOpen((current) => !current)}
    >
      <span className="ui-chart-select__label">Heatmap</span>
      <span className="ui-chart-select__value">
        <span>{selectedLabel}</span>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
      </span>
    </button>
    {open && <div className="ui-chart-select__menu chart-control__menu" role="dialog" aria-label="Heatmap settings">
      <div className="chart-control__section">
        <div className="chart-control__row">
          <span>Show heatmap</span>
          <Toggle className="chart-control__toggle" label="Show heatmap" checked={visible} onChange={onToggleVisible} />
        </div>
      </div>
      <div className="chart-control__section" aria-disabled={!visible}>
        <div className="chart-control__row">
          <span>Show uncertain regions</span>
          <Toggle className="chart-control__toggle" label="Show uncertain heatmap regions" checked={uncertainRegions} disabled={!visible} onChange={onToggleUncertainRegions} />
        </div>
      </div>
      <div className="chart-control__section" role="group" aria-label="Eye shown in heatmap" aria-disabled={!visible}>
          {(["OS", "OD"] as Eye[]).map((option) => <ChartControlOption
            key={option}
            label={option === "OS" ? "Left" : "Right"}
            colorClass={`dot--${option.toLowerCase()}`}
            checked={eye === option}
            disabled={!visible}
            onClick={() => onEyeChange(option)}
          />)}
      </div>
      <div className="ui-chart-select__menu-action">
        <button className="ui-chart-select__menu-link" type="button" onClick={() => {
          onOpenExplanation();
          setOpen(false);
        }}>
          <span>How heatmaps work</span>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 4 4 4-4 4" /></svg>
        </button>
      </div>
    </div>}
  </div>;
}

export function TrendControl({
  visible,
  mode,
  eyes,
  onToggleVisible,
  onModeChange,
  onToggleEye,
  onOpenExplanation,
}: {
  visible: boolean;
  mode: Exclude<TrendMode, "off">;
  eyes: Record<Eye, boolean>;
  onToggleVisible: () => void;
  onModeChange: (mode: Exclude<TrendMode, "off">) => void;
  onToggleEye: (eye: Eye) => void;
  onOpenExplanation: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return <div ref={root} className="ui-chart-select trend-control">
    <button
      className="ui-chart-select__trigger"
      type="button"
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={() => setOpen((current) => !current)}
    >
      <span className="ui-chart-select__label">Trend</span>
      <span className="ui-chart-select__value">
        <span>{visible ? mode === "adjusted" ? "Adjusted" : "Observed" : "Off"}</span>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
      </span>
    </button>
    {open && <div className="ui-chart-select__menu chart-control__menu" role="dialog" aria-label="Trend settings">
      <div className="chart-control__section">
        <div className="chart-control__row">
          <span>Show trend</span>
          <Toggle className="chart-control__toggle" label="Show trend" checked={visible} onChange={onToggleVisible} />
        </div>
      </div>
      <div className="chart-control__section" role="group" aria-label="Trend type" aria-disabled={!visible}>
          {(["adjusted", "observed"] as const).map((option) => <ChartControlOption
            key={option}
            label={option === "adjusted" ? "Adjusted" : "Observed"}
            checked={mode === option}
            disabled={!visible}
            onClick={() => onModeChange(option)}
          />)}
      </div>
      <div className="chart-control__section" role="group" aria-label="Eyes shown in trend" aria-disabled={!visible}>
          {(["OS", "OD"] as Eye[]).map((option) => <ChartControlOption
            key={option}
            label={option === "OS" ? "Left" : "Right"}
            colorClass={`dot--${option.toLowerCase()}`}
            checked={eyes[option]}
            disabled={!visible}
            multiple
            onClick={() => onToggleEye(option)}
          />)}
      </div>
      <div className="ui-chart-select__menu-action">
        <button className="ui-chart-select__menu-link" type="button" onClick={() => {
          onOpenExplanation();
          setOpen(false);
        }}>
          <span>How trends work</span>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 4 4 4-4 4" /></svg>
        </button>
      </div>
    </div>}
  </div>;
}

import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
} from "react";
import { DateInput, Toggle } from "../shared/ui";

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

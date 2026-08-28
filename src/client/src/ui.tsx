import { forwardRef, useEffect, useRef, useState, type CSSProperties, type FocusEvent, type InputHTMLAttributes, type ReactNode } from "react";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "quiet" | "danger" | "editor" | "editorPrimary";
};

export function Button({ className = "", variant = "secondary", ...props }: ButtonProps) {
  return <button className={`ui-button ui-button--${variant} ${className}`.trim()} {...props} />;
}

export function SectionHeading({ eyebrow, title, actions, className = "" }: {
  eyebrow: string;
  title: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={`section-heading ${actions ? "section-heading--with-actions" : ""} ${className}`.trim()}>
      <div className="section-heading__copy">
        <span>{eyebrow}</span>
        <h2>{title}</h2>
      </div>
      {actions}
    </header>
  );
}

export function SegmentedControl<T extends string>({ label, value, options, optionLabel, onChange }: {
  label: string;
  value: T;
  options: readonly T[];
  optionLabel?: (option: T) => ReactNode;
  onChange: (value: T) => void;
}) {
  return (
    <div className="ui-segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button key={option} type="button" aria-pressed={value === option} onClick={() => onChange(option)}>{optionLabel?.(option) ?? option}</button>
      ))}
    </div>
  );
}

export const DateInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function DateInput(
  { className = "", ...props },
  ref,
) {
  return <input ref={ref} className={`ui-date-input ${className}`.trim()} type="date" {...props} />;
});

export const ChartDateTag = forwardRef<HTMLDivElement, {
  value: string;
  timeValue: string;
  displayValue?: string;
  displayTime?: string;
  ariaLabel: string;
  active?: boolean;
  disabled?: boolean;
  empty?: boolean;
  alignRight?: boolean;
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
  empty = false,
  alignRight = false,
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
      className={`selection-handle__date-control${active ? " selection-handle__date-control--active" : " selection-handle__date-control--readonly"}${alignRight ? " selection-handle__date-control--right" : ""} ${className}`.trim()}
      onPointerDown={(event) => active && event.stopPropagation()}
    >
      <div className="selection-handle__date-fields">
        {active && empty ? <>
          <output className="selection-handle__date-input selection-handle__empty-value" aria-label={ariaLabel}>-- / -- / ----</output>
          <output className="selection-handle__time-input selection-handle__empty-value" aria-label={`${ariaLabel} time`}>-- : --</output>
        </> : active ? <>
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
        </> : <>
          <output className="selection-handle__date-value" aria-label={ariaLabel}>{empty ? "-- / -- / ----" : displayValue ?? value}</output>
          <output className="selection-handle__time-value" aria-label={`${ariaLabel} time`}>{empty ? "-- : --" : displayTime ?? timeValue}</output>
        </>}
      </div>
      {active && present && <div className="selection-handle__present-control">
        <span>Present</span>
        <button
          className="selection-handle__present-toggle"
          type="button"
          role="switch"
          aria-checked={present.checked}
          aria-label={`Present: ${present.checked ? "on" : "off"}`}
          disabled={!present.onChange}
          onClick={present.onChange}
        >
          <span className="publication-switch-track" aria-hidden="true"><span /></span>
        </button>
      </div>}
    </div>
  );
});

export function ChartToggle({ label, colorClass, checked, onChange }: {
  label: string;
  colorClass: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="ui-chart-toggle">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span className={`dot ${colorClass}`} aria-hidden="true" />
      <span>{label}</span>
    </label>
  );
}

export function ChartSelect<T extends string>({ label, value, options, onChange, onTrigger, pressed, className = "" }: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
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
      </div>}
    </div>
  );
}

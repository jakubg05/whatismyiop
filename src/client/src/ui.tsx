import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

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

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

export function Toggle({ label, checked, disabled = false, className = "", onChange }: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  className?: string;
  onChange?: () => void;
}) {
  return (
    <button
      className={`ui-toggle ${className}`.trim()}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
    >
      <span className="publication-switch-track" aria-hidden="true"><span /></span>
    </button>
  );
}

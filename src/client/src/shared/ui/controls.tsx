import {
  forwardRef,
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";

type Eye = "OD" | "OS";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "quiet" | "danger";
};

export function Button({
  className = "",
  variant = "secondary",
  ...props
}: ButtonProps) {
  return (
    <button
      className={`ui-button ui-button--${variant} ${className}`.trim()}
      {...props}
    />
  );
}

type ToggleButtonOption<T extends string> = {
  value: T;
  label: ReactNode;
  checked: boolean;
  colorClass?: string;
  ariaDisabled?: boolean;
};

export function ToggleButtonGroup<T extends string>({
  label,
  mode = "multiple",
  options,
  className = "",
  onChange,
}: {
  label: string;
  mode?: "single" | "multiple";
  options: readonly ToggleButtonOption<T>[];
  className?: string;
  onChange: (value: T) => void;
}) {
  const groupName = useId();
  const single = mode === "single";

  return (
    <div
      className={`ui-chart-toggle-group ui-chart-toggle-group--${mode} ${className}`.trim()}
      role={single ? "radiogroup" : "group"}
      aria-label={label}
    >
      {options.map((option) => (
        <label
          key={option.value}
          className={`ui-chart-toggle${option.ariaDisabled ? " ui-chart-toggle--disabled" : ""}`}
        >
          <input
            type={single ? "radio" : "checkbox"}
            name={single ? groupName : undefined}
            checked={option.checked}
            aria-disabled={option.ariaDisabled || undefined}
            onChange={(event) => {
              if (option.ariaDisabled) event.preventDefault();
              onChange(option.value);
            }}
          />
          {option.colorClass && (
            <span className={`dot ${option.colorClass}`} aria-hidden="true" />
          )}
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  );
}

type EyeToggleGroupProps = {
  label: string;
} & (
  | { mode: "single"; value: Eye; onChange: (eye: Eye) => void }
  | {
      mode: "multiple";
      value: Record<Eye, boolean>;
      onChange: (eye: Eye) => void;
    }
);

export function EyeToggleGroup(props: EyeToggleGroupProps) {
  const single = props.mode === "single";

  return (
    <ToggleButtonGroup
      className="eye-toggles"
      mode={props.mode}
      label={props.label}
      options={(["OS", "OD"] as const).map((eye) => ({
        value: eye,
        label: eye === "OD" ? "Right" : "Left",
        checked: single ? props.value === eye : props.value[eye],
        colorClass: `dot--${eye.toLowerCase()}`,
      }))}
      onChange={props.onChange}
    />
  );
}

type DateInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export const DateInput = forwardRef<HTMLInputElement, DateInputProps>(
  function DateInput({ className = "", ...props }, ref) {
    return (
      <input
        ref={ref}
        className={`ui-date-input ${className}`.trim()}
        type="date"
        {...props}
      />
    );
  },
);

export function Toggle({
  label,
  checked,
  disabled = false,
  className = "",
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  className?: string;
  onChange: () => void;
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
      <span className="publication-switch-track" aria-hidden="true">
        <span />
      </span>
    </button>
  );
}

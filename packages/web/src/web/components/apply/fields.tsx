import { Check } from "lucide-react";
import { cn } from "../../lib/utils";

export type FieldErrors = Partial<Record<string, string>>;

function ErrorText({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-2 flex items-start gap-2 text-sm font-medium text-white">
      <span aria-hidden className="mt-[3px] inline-flex size-4 shrink-0 items-center justify-center border border-white text-[10px] leading-none">
        !
      </span>
      {message}
    </p>
  );
}

type TextFieldProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & {
  id: string;
  label: string;
  hint?: string;
  optional?: boolean;
  value: string;
  error?: string;
  onValue: (v: string) => void;
};

export function TextField({ id, label, hint, optional, value, error, onValue, className, ...rest }: TextFieldProps) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-err` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="eyebrow flex items-baseline justify-between gap-3 text-white/60">
        <span>
          {label}
          {!optional && <span aria-hidden className="text-white/60"> *</span>}
        </span>
        {optional && <span className="text-[10px] tracking-[0.18em] text-white/60">Optional</span>}
      </label>
      <input
        id={id}
        name={id}
        value={value}
        onChange={(e) => onValue(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        aria-required={optional ? undefined : true}
        className="field-input"
        {...rest}
      />
      {hint && (
        <p id={`${id}-hint`} className="mt-2 text-sm text-white/60">
          {hint}
        </p>
      )}
      <ErrorText id={`${id}-err`} message={error} />
    </div>
  );
}

export function TextAreaField({
  id,
  label,
  hint,
  optional,
  value,
  error,
  onValue,
  maxLength,
  placeholder,
}: {
  id: string;
  label: string;
  hint?: string;
  optional?: boolean;
  value: string;
  error?: string;
  maxLength: number;
  placeholder?: string;
  onValue: (v: string) => void;
}) {
  const describedBy = [`${id}-count`, hint ? `${id}-hint` : null, error ? `${id}-err` : null].filter(Boolean).join(" ");
  return (
    <div>
      <label htmlFor={id} id={`${id}-label`} className="eyebrow flex items-baseline justify-between gap-3 text-white/60">
        <span>
          {label}
          {!optional && <span aria-hidden className="text-white/60"> *</span>}
        </span>
        {optional && <span className="text-[10px] tracking-[0.18em] text-white/60">Optional</span>}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="mt-2 text-sm text-white/60">
          {hint}
        </p>
      )}
      <textarea
        id={id}
        aria-labelledby={`${id}-label`}
        name={id}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => onValue(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        aria-required={optional ? undefined : true}
        className="field-input mt-3"
      />
      <div className="flex items-start justify-between gap-4">
        <ErrorText id={`${id}-err`} message={error} />
        <p id={`${id}-count`} className="ml-auto mt-2 shrink-0 text-xs tabular-nums text-white/60">
          {value.length} / {maxLength}
        </p>
      </div>
    </div>
  );
}

export function SelectField({
  id,
  label,
  value,
  error,
  onValue,
  options,
  placeholder,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  error?: string;
  onValue: (v: string) => void;
  options: readonly { value: string; label: string }[];
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="eyebrow block text-white/60">
        {label}
        <span aria-hidden className="text-white/60"> *</span>
      </label>
      <select
        id={id}
        name={id}
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onValue(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : undefined}
        aria-required
        className="field-input"
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ErrorText id={`${id}-err`} message={error} />
    </div>
  );
}

/**
 * Radio / checkbox group rendered as large tap targets. Uses native inputs
 * inside a <fieldset>, so arrow-key navigation (radio) and Space (checkbox)
 * work exactly like the platform defaults.
 */
export function ChoiceGroup({
  id,
  legend,
  hint,
  type,
  options,
  value,
  error,
  onValue,
  columns = 1,
  size = "md",
  optional,
}: {
  id: string;
  legend: string;
  hint?: string;
  type: "radio" | "checkbox";
  options: readonly { value: string; label: string; description?: string }[];
  value: string | string[] | undefined;
  error?: string;
  onValue: (v: string | string[]) => void;
  columns?: 1 | 2 | 3;
  size?: "md" | "lg";
  optional?: boolean;
}) {
  const selected = (v: string) => (Array.isArray(value) ? value.includes(v) : value === v);
  const toggle = (v: string) => {
    if (type === "radio") return onValue(v);
    const arr = Array.isArray(value) ? value : [];
    onValue(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  };
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-err` : null].filter(Boolean).join(" ") || undefined;
  return (
    <fieldset id={id} aria-describedby={describedBy} aria-invalid={error ? true : undefined} tabIndex={-1} className="outline-none">
      <legend className="text-xl font-medium tracking-tight text-white sm:text-2xl">
        {legend}
        {!optional && <span className="sr-only"> (required)</span>}
      </legend>
      {hint && (
        <p id={`${id}-hint`} className="mt-2 text-sm text-white/60">
          {hint}
        </p>
      )}
      <div
        className={cn(
          "mt-5 grid gap-2",
          columns === 2 && "sm:grid-cols-2",
          columns === 3 && "grid-cols-2 sm:grid-cols-3",
        )}
      >
        {options.map((o) => {
          const on = selected(o.value);
          return (
            <label
              key={o.value}
              className={cn(
                "choice relative flex cursor-pointer items-center gap-4 border px-4 transition-[background-color,border-color,color] duration-300 ease-[var(--ease-cine)]",
                size === "lg" ? "min-h-20 py-4 sm:min-h-24" : "min-h-14 py-3",
                on ? "border-white bg-white text-sx-black" : "border-white/20 bg-white/[0.02] text-white hover:border-white/60",
                error && !on && "border-dashed border-white/60",
              )}
            >
              <input
                type={type}
                name={id}
                value={o.value}
                aria-labelledby={`${id}-${o.value}-label`}
                checked={on}
                onChange={() => toggle(o.value)}
                className="sr-input"
              />
              <span
                aria-hidden
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center border transition-colors",
                  type === "radio" && "rounded-full",
                  on ? "border-sx-black bg-sx-black text-white" : "border-white/50",
                )}
              >
                {on && (type === "checkbox" ? <Check className="size-3.5" strokeWidth={2.5} /> : <span className="block size-2 rounded-full bg-white" />)}
              </span>
              <span className="min-w-0">
                <span id={`${id}-${o.value}-label`} className={cn("block font-medium leading-snug", size === "lg" ? "text-lg sm:text-xl" : "text-[15px] sm:text-base")}>
                  {o.label}
                </span>
                {o.description && (
                  <span className={cn("mt-1 block text-sm leading-snug", on ? "text-sx-black/65" : "text-white/60")}>{o.description}</span>
                )}
              </span>
            </label>
          );
        })}
      </div>
      <ErrorText id={`${id}-err`} message={error} />
    </fieldset>
  );
}

export function YesNo({
  id,
  legend,
  value,
  error,
  onValue,
}: {
  id: string;
  legend: string;
  value: boolean | undefined;
  error?: string;
  onValue: (v: boolean) => void;
}) {
  return (
    <ChoiceGroup
      id={id}
      legend={legend}
      type="radio"
      columns={2}
      options={[
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
      ]}
      value={value === undefined ? undefined : value ? "yes" : "no"}
      error={error}
      onValue={(v) => onValue(v === "yes")}
    />
  );
}

export function Checkbox({
  id,
  checked,
  onChange,
  children,
  error,
  required,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
  error?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className={cn(
          "choice flex cursor-pointer items-start gap-4 border p-4 transition-colors sm:p-5",
          checked ? "border-white bg-white/[0.06]" : "border-white/20 hover:border-white/50",
          error && !checked && "border-dashed border-white/70",
        )}
      >
        <input
          id={id}
          type="checkbox"
          aria-labelledby={`${id}-label`}
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-err` : undefined}
          aria-required={required || undefined}
          className="sr-input"
        />
        <span
          aria-hidden
          className={cn(
            "mt-0.5 flex size-5 shrink-0 items-center justify-center border transition-colors",
            checked ? "border-white bg-white text-sx-black" : "border-white/50",
          )}
        >
          {checked && <Check className="size-3.5" strokeWidth={2.5} />}
        </span>
        <span id={`${id}-label`} className="text-[15px] leading-relaxed text-white/85">{children}</span>
      </label>
      <ErrorText id={`${id}-err`} message={error} />
    </div>
  );
}

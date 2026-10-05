/**
 * Shared primitives for the staff console and worker portal.
 * Monochrome, square, Inter. Every control ≥44px tall, visible focus, and
 * every input has a programmatic label.
 */
import { useId, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "../../lib/utils";

/* ---------------- Errors ---------------- */
export type ErrorInfo = { code: string; message: string; missing: string[] };

/** Normalise an oRPC client error (code/message/data.missing) for display. */
export function errorInfo(err: unknown): ErrorInfo | null {
  if (!err) return null;
  const e = err as { code?: string; message?: string; data?: { missing?: unknown; errors?: unknown } };
  const missing = Array.isArray(e.data?.missing) ? (e.data!.missing as unknown[]).map(String) : Array.isArray(e.data?.errors) ? (e.data!.errors as unknown[]).map(String) : [];
  const code = e.code ?? "ERROR";
  const fallback: Record<string, string> = {
    UNAUTHORIZED: "Your session has ended. Sign in again.",
    FORBIDDEN: "Your role does not allow this.",
    CONFLICT: "This record changed since you loaded it. Reload and try again.",
    NOT_FOUND: "Not found.",
    TOO_MANY_REQUESTS: "Too many attempts. Wait a few minutes and try again.",
  };
  return { code, message: e.message && e.message !== code ? e.message : (fallback[code] ?? "Something went wrong."), missing };
}

export function ErrorNote({ error, className }: { error: unknown; className?: string }) {
  const info = errorInfo(error);
  if (!info) return null;
  return (
    <div role="alert" className={cn("border border-white/40 bg-white/[0.04] px-4 py-3 text-sm", className)}>
      <p className="font-medium">
        <span className="eyebrow mr-2 text-white/65">{info.code.replace(/_/g, " ")}</span>
        {info.message}
      </p>
      {info.missing.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-white/80">
          {info.missing.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------------- Layout ---------------- */
export function Panel({ title, eyebrow, actions, children, className, id }: { title?: ReactNode; eyebrow?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} aria-labelledby={title && id ? `${id}-h` : undefined} className={cn("border border-white/12 bg-sx-ink", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
          <div>
            {eyebrow && <p className="eyebrow text-white/60">{eyebrow}</p>}
            {title && (
              <h2 id={id ? `${id}-h` : undefined} className="text-base font-medium">
                {title}
              </h2>
            )}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="px-4 py-4 sm:px-5">{children}</div>
    </section>
  );
}

export function PageTitle({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="eyebrow text-white/60">{eyebrow}</p>}
        <h1 className="heading mt-1 text-3xl sm:text-4xl">{title}</h1>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="border border-white/12 bg-sx-ink px-4 py-3">
      <p className="eyebrow text-white/60">{label}</p>
      <p className="mt-1 text-2xl font-medium tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-white/60">{hint}</p>}
    </div>
  );
}

export function Tag({ children, tone = "default", className }: { children: ReactNode; tone?: "default" | "solid" | "warn" | "muted"; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em]",
        tone === "solid" && "bg-white text-sx-black",
        tone === "default" && "border border-white/40 text-white",
        tone === "warn" && "border border-dashed border-white text-white",
        tone === "muted" && "border border-white/20 text-white/65",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <output className="flex items-center gap-3 py-8 text-sm text-white/65">
      <Loader2 aria-hidden className="size-4 animate-spin" />
      {label}
    </output>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-sm text-white/65">{children}</p>;
}

/** Shown on every surface backed by the local intake store. */
export function StagingNote({ mode, reason }: { mode?: string | null; reason?: string | null }) {
  const connected = mode === "connected";
  return (
    <output className="flex flex-wrap items-center gap-x-3 gap-y-1 border border-dashed border-white/40 px-4 py-2 text-sm">
      <Tag tone={connected ? "solid" : "warn"}>{connected ? "Connected" : mode === "degraded" ? "Degraded" : "Local staging"}</Tag>
      <span className="text-white/80">
        {connected ? reason : mode === "degraded" ? reason : "Saved locally — Command Center connection pending"}
        {!connected && mode !== "degraded" && reason && reason !== "Saved locally — Command Center connection pending" ? ` · ${reason}` : ""}
      </span>
      <span className="text-xs text-white/60">authority=local_staging</span>
    </output>
  );
}

/* ---------------- Controls ---------------- */
type BtnProps = React.ComponentProps<"button"> & { variant?: "solid" | "outline" | "ghost"; busy?: boolean; size?: "md" | "sm" };
export function Btn({ variant = "outline", busy, size = "md", className, children, disabled, ...rest }: BtnProps) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cn(
        "inline-flex items-center justify-center gap-2 text-[12px] font-medium uppercase tracking-[0.16em] transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        size === "md" ? "min-h-11 px-4" : "min-h-11 px-3 sm:min-h-9",
        variant === "solid" && "bg-white text-sx-black hover:bg-sx-gray",
        variant === "outline" && "border border-white/40 text-white hover:border-white",
        variant === "ghost" && "text-white/80 underline-offset-4 hover:text-white hover:underline",
        className,
      )}
    >
      {busy && <Loader2 aria-hidden className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

type FieldShell = { label: string; hint?: ReactNode; className?: string; invalid?: boolean };

export function TextField({ label, hint, className, invalid, ...rest }: FieldShell & React.ComponentProps<"input">) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-white/75">
        {label}
      </label>
      <input id={id} aria-invalid={invalid || undefined} aria-describedby={hint ? `${id}-h` : undefined} {...rest} className="cx-input" />
      {hint && (
        <p id={`${id}-h`} className="mt-1 text-xs text-white/60">
          {hint}
        </p>
      )}
    </div>
  );
}

export function TextArea({ label, hint, className, invalid, ...rest }: FieldShell & React.ComponentProps<"textarea">) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-white/75">
        {label}
      </label>
      <textarea id={id} aria-invalid={invalid || undefined} aria-describedby={hint ? `${id}-h` : undefined} {...rest} className="cx-input" />
      {hint && (
        <p id={`${id}-h`} className="mt-1 text-xs text-white/60">
          {hint}
        </p>
      )}
    </div>
  );
}

export function SelectField({
  label,
  hint,
  className,
  options,
  ...rest
}: FieldShell & React.ComponentProps<"select"> & { options: readonly (readonly [string, string])[] }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-white/75">
        {label}
      </label>
      <select id={id} aria-describedby={hint ? `${id}-h` : undefined} {...rest} className="cx-input">
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      {hint && (
        <p id={`${id}-h`} className="mt-1 text-xs text-white/60">
          {hint}
        </p>
      )}
    </div>
  );
}

export function Check({ label, className, ...rest }: { label: ReactNode; className?: string } & React.ComponentProps<"input">) {
  const id = useId();
  return (
    <div className={cn("flex min-h-11 items-center gap-3", className)}>
      <input id={id} type="checkbox" {...rest} className="size-5 accent-white" />
      <label htmlFor={id} className="text-sm">
        {label}
      </label>
    </div>
  );
}

/* ---------------- Formatting ---------------- */
export const fmtDate = (d: Date | string | number | null | undefined) => {
  if (d === null || d === undefined) return "—";
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return "—";
  return x.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
};
export const fmtDay = (d: Date | string | number | null | undefined) => {
  if (d === null || d === undefined) return "—";
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return "—";
  return x.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};
export const humanize = (s: string | null | undefined) => {
  if (!s) return "—";
  const t = s.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
};
/** Unknown is not zero: null renders as "Unknown". */
export const countOrUnknown = (n: number | null | undefined) => (n === null || n === undefined ? "Unknown" : String(n));
export const usd = (cents: number | null | undefined) =>
  cents === null || cents === undefined ? "Not recorded" : (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

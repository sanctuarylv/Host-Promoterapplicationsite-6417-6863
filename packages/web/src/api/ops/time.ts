/**
 * Wall-clock ↔ UTC for event scheduling. Events persist UTC instants plus the
 * IANA zone (default America/Los_Angeles). Relative offsets resolve only after
 * a real date is confirmed. DST gaps are rejected; DST overlaps (fall-back
 * 01:00–02:00) are rejected unless the caller picks "earlier" or "later".
 */
export const DEFAULT_TZ = "America/Los_Angeles";

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    fmtCache.set(tz, f);
  }
  return f;
}

/** "YYYY-MM-DD HH:mm" wall time of an instant in tz. */
export function wallOf(utcMs: number, tz = DEFAULT_TZ): string {
  const p = Object.fromEntries(fmt(tz).formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

function offsetMs(utcMs: number, tz: string) {
  const w = wallOf(utcMs, tz);
  const [d, t] = w.split(" ");
  const [y, m, dd] = d!.split("-").map(Number);
  const [h, mi] = t!.split(":").map(Number);
  return Date.UTC(y!, m! - 1, dd!, h!, mi!) - Math.floor(utcMs / 60_000) * 60_000;
}

export type Resolve =
  | { ok: true; utc: number; ambiguous: boolean }
  | { ok: false; reason: "nonexistent" | "ambiguous" | "invalid"; candidates?: number[] };

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y!, m! - 1, d! + days));
  return t.toISOString().slice(0, 10);
}

/** Resolve a local wall time to a UTC instant. */
export function zonedToUtc(date: string, time: string, tz = DEFAULT_TZ, ambiguity: "reject" | "earlier" | "later" = "reject"): Resolve {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return { ok: false, reason: "invalid" };
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  if (h! > 23 || mi! > 59) return { ok: false, reason: "invalid" };
  const guess = Date.UTC(y!, m! - 1, d!, h!, mi!);
  const offsets = new Set([offsetMs(guess - 14 * 3600_000, tz), offsetMs(guess, tz), offsetMs(guess + 14 * 3600_000, tz)]);
  const want = `${date} ${time}`;
  const cands = [...offsets].map((o) => guess - o).filter((t) => wallOf(t, tz) === want);
  const uniq = [...new Set(cands)].sort((a, b) => a - b);
  if (uniq.length === 0) return { ok: false, reason: "nonexistent" };
  if (uniq.length > 1) {
    if (ambiguity === "reject") return { ok: false, reason: "ambiguous", candidates: uniq };
    return { ok: true, utc: ambiguity === "earlier" ? uniq[0]! : uniq[uniq.length - 1]!, ambiguous: true };
  }
  return { ok: true, utc: uniq[0]!, ambiguous: false };
}

export type MilestoneDef = { key: string; label: string; local_time: string; day_offset: number };
export type ResolvedMilestone = { key: string; label: string; local: string; utc: number };

/** Resolve template milestones for a confirmed local date. Fails on any DST gap/overlap. */
export function resolveMilestones(date: string, defs: MilestoneDef[], tz = DEFAULT_TZ, ambiguity: "reject" | "earlier" | "later" = "reject") {
  const out: ResolvedMilestone[] = [];
  const errors: string[] = [];
  for (const m of defs) {
    const day = addDays(date, m.day_offset);
    const r = zonedToUtc(day, m.local_time, tz, ambiguity);
    if (!r.ok) errors.push(`${m.label} (${day} ${m.local_time}): ${r.reason === "nonexistent" ? "does not exist (DST spring-forward gap)" : r.reason === "ambiguous" ? "occurs twice (DST fall-back) — choose earlier or later" : "invalid time"}`);
    else out.push({ key: m.key, label: m.label, local: `${day} ${m.local_time}`, utc: r.utc });
  }
  for (let i = 1; i < out.length; i++)
    if (out[i]!.utc < out[i - 1]!.utc) errors.push(`${out[i]!.label} is before ${out[i - 1]!.label}`);
  return errors.length ? { ok: false as const, errors } : { ok: true as const, milestones: out };
}

export const overlaps = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && b0 < a1;

/** Attendance math over the append-only log (pure — unit tested). */
/** Compute worked minutes from the append-only log (voided entries excluded). */
export function computeMinutes(log: { id: string; kind: string; at_utc: Date; corrects_id: string | null }[]) {
  const voided = new Set(log.filter((l) => l.kind === "void" && l.corrects_id).map((l) => l.corrects_id!));
  const live = log.filter((l) => l.kind !== "void" && !voided.has(l.id)).sort((a, b) => a.at_utc.getTime() - b.at_utc.getTime());
  let minutes = 0;
  let inAt: number | null = null;
  let breakAt: number | null = null;
  const issues: string[] = [];
  for (const l of live) {
    const t = l.at_utc.getTime();
    if (l.kind === "check_in") {
      if (inAt !== null) issues.push("Double check-in");
      inAt = t;
    } else if (l.kind === "break_start" && inAt !== null) {
      breakAt = t;
    } else if (l.kind === "break_end" && breakAt !== null) {
      minutes -= (t - breakAt) / 60_000;
      breakAt = null;
    } else if (l.kind === "check_out") {
      if (inAt === null) issues.push("Check-out without check-in");
      else minutes += (t - inAt) / 60_000;
      inAt = null;
    }
  }
  if (inAt !== null) issues.push("Open shift (no check-out)");
  if (breakAt !== null) issues.push("Open break");
  return { minutes: Math.max(0, Math.round(minutes)), issues };
}


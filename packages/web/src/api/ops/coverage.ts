/**
 * Workforce classification of a template role.
 * `unclassified` = the planning roster names the role but nobody has decided
 * whether it is a paid Sanctuary LV Group engagement, a nonprofit Serve Team
 * volunteer slot, or a founder seat. Unclassified roles count toward
 * Sanctuary-side headcount but cannot receive assignments until classified.
 */
export const WORKFORCE_KINDS = ["paid_group", "nonprofit_serve", "founder_tbd", "venue_provider", "provider", "unclassified"] as const;
export type WorkforceKind = (typeof WORKFORCE_KINDS)[number];

/**
 * Pure staffing math (unit-tested).
 *
 * - `null` always means UNKNOWN, never zero; any unknown input makes the
 *   dependent total unknown and is counted separately.
 * - Provider fulfilment REPLACES Sanctuary-side demand for the same role:
 *   a venue-provided engineer reduces the Sanctuary engineer demand, it is
 *   never added on top of it.
 * - Slots are planning positions, not unique hires; named people and peak
 *   concurrent headcount are reported separately.
 */

export type RoleCount = {
  role_key: string;
  group_key: string;
  slot_class: string; // core | talent | care | promoter | founder | venue
  workforce: string; // see WORKFORCE_KINDS
  planned: number | null;
};

export function slotTotals(roles: RoleCount[]) {
  const byGroup: Record<string, { slots: number; unknownRoles: number }> = {};
  const byClass: Record<string, number> = {};
  let sanctuary = 0;
  let unknownSanctuaryRoles = 0;
  const venue: { role_key: string; planned: number | null }[] = [];
  for (const r of roles) {
    if (r.workforce === "venue_provider") {
      venue.push({ role_key: r.role_key, planned: r.planned });
      continue;
    }
    const g = (byGroup[r.group_key] ??= { slots: 0, unknownRoles: 0 });
    if (r.planned === null) {
      g.unknownRoles += 1;
      unknownSanctuaryRoles += 1;
      continue;
    }
    g.slots += r.planned;
    byClass[r.slot_class] = (byClass[r.slot_class] ?? 0) + r.planned;
    sanctuary += r.planned;
  }
  return {
    sanctuarySlots: sanctuary,
    unknownSanctuaryRoles,
    byGroup,
    byClass,
    venue: {
      known: venue.filter((v) => v.planned !== null).reduce((s, v) => s + (v.planned ?? 0), 0),
      unknownRoles: venue.filter((v) => v.planned === null).map((v) => v.role_key),
    },
  };
}

/**
 * Remaining Sanctuary-side demand for one role after provider substitution.
 * venue_provider roles are fulfilled only by the provider.
 */
export function roleGap(
  workforce: string,
  planned: number | null,
  providerCounts: (number | null)[],
  filled: number,
): { demand: number | null; provider: number | null; gap: number | null } {
  if (planned === null) return { demand: null, provider: null, gap: null };
  const hasProvider = providerCounts.length > 0;
  const provider = hasProvider ? providerCounts.reduce<number | null>((a, c) => (a === null || c === null ? null : a + c), 0) : 0;
  if (workforce === "venue_provider") {
    return { demand: 0, provider, gap: provider === null ? null : Math.max(0, planned - provider) };
  }
  if (provider === null) return { demand: null, provider, gap: null };
  const demand = Math.max(0, planned - provider);
  return { demand, provider, gap: Math.max(0, demand - filled) };
}

/** Peak number of simultaneous shifts (half-open intervals; back-to-back does not overlap). */
export function peakConcurrent(intervals: { start: number; end: number }[]) {
  const pts: [number, number][] = [];
  for (const i of intervals) if (i.end > i.start) pts.push([i.start, 1], [i.end, -1]);
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let cur = 0;
  let peak = 0;
  for (const [, d] of pts) {
    cur += d;
    peak = Math.max(peak, cur);
  }
  return peak;
}

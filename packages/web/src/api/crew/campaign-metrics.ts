/**
 * Campaign recruitment funnel — evidence-based, scoped, denominator-explicit.
 *
 * Cohort: applications whose utm_campaign equals the campaign code, optionally
 * narrowed by role interest and by application date (inclusive local days in
 * America/Los_Angeles). Every stage is a count of cohort applications with
 * evidence for that stage, so every rate shares one denominator: the cohort.
 *
 * "Reached" a stage means the current status is that stage or later, OR an
 * audited status transition into it exists — so an application that was offered
 * and then declined still counts as offered. Stages backed by their own records
 * (interviews, offers, training) use those records, not the status alone.
 *
 * Cost per outcome is shown only when (a) the scope is the whole campaign —
 * spend is not allocated by role or date — (b) every budget line has an actual
 * recorded (partial spend is never treated as complete), and (c) the outcome
 * count is above zero (zero conversions never display as $0).
 */
import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "../database";
import { crewApplications, crewAudit, crewInterviews, crewOffers, crewTrainingModules, crewTrainingRecords } from "../database/schema";
import { addDays, DEFAULT_TZ, zonedToUtc } from "../ops/time";

export const QUALIFIED_STATUSES = ["selected", "offer_issued", "accepted", "onboarding", "event_ready"] as const;
const ORDER = ["submitted", "reviewed", "screen_invited", "screen_completed", "assessment", "selected", "offer_issued", "accepted", "onboarding", "event_ready"];
const rank = (s: string) => ORDER.indexOf(s);

export type MetricScope = { role: string | null; from: string | null; to: string | null };
type BudgetLine = { actual_cents: number | null };

export function scopeWindow(s: MetricScope) {
  const start = s.from ? zonedToUtc(s.from, "00:00", DEFAULT_TZ, "earlier") : null;
  const end = s.to ? zonedToUtc(addDays(s.to, 1), "00:00", DEFAULT_TZ, "earlier") : null;
  return {
    startMs: start && start.ok ? start.utc : null,
    endMs: end && end.ok ? end.utc : null, // exclusive
  };
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Spend completeness: all lines must carry an actual. No lines = unknown, not zero. */
export function spendState(lines: BudgetLine[]) {
  const recorded = lines.filter((l) => l.actual_cents !== null).length;
  const total = lines.length;
  const state = total === 0 || recorded === 0 ? "none" : recorded < total ? "partial" : "complete";
  return { state, recorded, total, actualCents: state === "complete" ? lines.reduce((s, l) => s + (l.actual_cents ?? 0), 0) : null } as const;
}

export function costPer(spend: ReturnType<typeof spendState>, count: number, wholeCampaign: boolean, what: string) {
  if (!wholeCampaign) return { value: null, note: `Spend is recorded for the whole campaign, not by role or date — clear the filters to see cost per ${what}` };
  if (spend.state === "none") return { value: null, note: "No actual spend recorded" };
  if (spend.state === "partial") return { value: null, note: `Spend partially recorded (${spend.recorded} of ${spend.total} budget lines) — not shown until every line has an actual` };
  if (count === 0) return { value: null, note: `No ${what}s yet — cost per ${what} is undefined, not $0` };
  return { value: Math.round(spend.actualCents! / count), note: `Actual spend ÷ ${count} ${what}${count === 1 ? "" : "s"}` };
}

export async function campaignFunnel(code: string, scope: MetricScope, budget: BudgetLine[]) {
  const { startMs, endMs } = scopeWindow(scope);
  const conds = [eq(crewApplications.utm_campaign, code)];
  if (scope.role) conds.push(eq(crewApplications.role_interest, scope.role));
  // created_at is stored in seconds.
  if (startMs !== null) conds.push(gte(crewApplications.created_at, new Date(startMs)));
  if (endMs !== null) conds.push(lt(crewApplications.created_at, new Date(endMs)));

  const apps = await db
    .select({ id: crewApplications.id, person: crewApplications.person_id, role: crewApplications.role_interest, status: crewApplications.application_status, created: crewApplications.created_at, source: crewApplications.utm_source, content: crewApplications.utm_content })
    .from(crewApplications)
    .where(and(...conds));
  const ids = apps.map((a) => a.id);
  const persons = [...new Set(apps.map((a) => a.person).filter((p): p is string => Boolean(p)))];

  // Store-wide denominator for share-of-intake, same date window, all campaigns.
  const allConds = [];
  if (startMs !== null) allConds.push(gte(crewApplications.created_at, new Date(startMs)));
  if (endMs !== null) allConds.push(lt(crewApplications.created_at, new Date(endMs)));
  if (scope.role) allConds.push(eq(crewApplications.role_interest, scope.role));
  const [{ n: storeTotal } = { n: 0 }] = await db.select({ n: sql<number>`count(*)` }).from(crewApplications).where(allConds.length ? and(...allConds) : undefined);

  const chunk = <T>(xs: T[], n = 400) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
  const many = async <R>(xs: string[], f: (part: string[]) => Promise<R[]>) => (xs.length ? (await Promise.all(chunk(xs).map(f))).flat() : []);

  const transitions = await many(ids, (part) =>
    db
      .select({ app: crewAudit.entity_id, from: crewAudit.from_value, to: crewAudit.to_value, at: crewAudit.created_at })
      .from(crewAudit)
      .where(and(eq(crewAudit.entity_type, "application"), eq(crewAudit.action, "status.transition"), inArray(crewAudit.entity_id, part))),
  );
  const interviews = await many(ids, (part) => db.select({ app: crewInterviews.application_id, status: crewInterviews.status }).from(crewInterviews).where(inArray(crewInterviews.application_id, part)));
  const offers = await many(ids, (part) => db.select({ app: crewOffers.application_id, status: crewOffers.status }).from(crewOffers).where(inArray(crewOffers.application_id, part)));
  const modules = await db.select().from(crewTrainingModules).where(eq(crewTrainingModules.status, "active"));
  const records = await many(persons, (part) => db.select().from(crewTrainingRecords).where(inArray(crewTrainingRecords.person_id, part)));

  const reachedVia = new Map<string, Set<string>>();
  const firstMove = new Map<string, number>();
  for (const t of transitions) {
    if (!t.to) continue;
    (reachedVia.get(t.app) ?? reachedVia.set(t.app, new Set()).get(t.app)!).add(t.to);
    if (t.from === "submitted") {
      const at = t.at.getTime();
      if (!firstMove.has(t.app) || at < firstMove.get(t.app)!) firstMove.set(t.app, at);
    }
  }
  const reached = (a: (typeof apps)[number], stage: string) => {
    if (rank(a.status) >= rank(stage)) return true;
    return Boolean(reachedVia.get(a.id) && [...reachedVia.get(a.id)!].some((s) => rank(s) >= rank(stage)));
  };
  const count = (pred: (a: (typeof apps)[number]) => boolean) => apps.filter(pred).length;

  const attended = new Set(interviews.filter((i) => i.status === "completed").map((i) => i.app));
  const noShow = new Set(interviews.filter((i) => i.status === "no_show").map((i) => i.app));
  const offered = new Set(offers.map((o) => o.app));
  const accepted = new Set(offers.filter((o) => o.status === "accepted").map((o) => o.app));

  const trainingDone = (a: (typeof apps)[number]) => {
    if (!a.person) return false;
    const req = modules.filter((m) => m.required_for.includes("*") || m.required_for.includes(a.role));
    if (!req.length) return false;
    return req.every((m) => {
      const r = records.find((x) => x.person_id === a.person && x.module_id === m.id);
      return m.verification === "staff_verified" ? Boolean(r?.verified_at) : Boolean(r?.completed_at || r?.verified_at);
    });
  };

  const reviewHours = apps
    .map((a) => (firstMove.has(a.id) ? (firstMove.get(a.id)! - a.created.getTime()) / 3_600_000 : null))
    .filter((h): h is number => h !== null && h >= 0);

  const n = apps.length;
  const of = (value: number) => ({ value, denominator: n });
  const qualified = count((a) => reached(a, "selected"));
  const acceptedN = count((a) => accepted.has(a.id));
  const wholeCampaign = !scope.role && !scope.from && !scope.to;
  const spend = spendState(budget);

  const byRole = new Map<string, Map<string, number>>();
  for (const a of apps) {
    const m = byRole.get(a.role) ?? byRole.set(a.role, new Map()).get(a.role)!;
    m.set(a.status, (m.get(a.status) ?? 0) + 1);
  }
  const bySource = new Map<string, { source: string | null; content: string | null; n: number }>();
  for (const a of apps) {
    const k = `${a.source ?? ""}|${a.content ?? ""}`;
    const cur = bySource.get(k) ?? { source: a.source, content: a.content, n: 0 };
    cur.n++;
    bySource.set(k, cur);
  }

  return {
    scope: {
      role: scope.role,
      from: scope.from,
      to: scope.to,
      timezone: DEFAULT_TZ,
      wholeCampaign,
      label: [scope.role ? `role: ${scope.role}` : "all roles", scope.from || scope.to ? `applied ${scope.from ?? "…"} to ${scope.to ?? "…"} (${DEFAULT_TZ})` : "all dates"].join(" · "),
    },
    denominatorLabel: "applications in this scope",
    applications: { value: n, denominator: Number(storeTotal), denominatorLabel: "all applications in the store for the same role/date scope" },
    uniquePeople: { value: persons.length, unlinked: apps.filter((a) => !a.person).length, note: "Distinct people; applications without a linked person are counted separately" },
    reviewed: of(count((a) => reached(a, "reviewed"))),
    medianHoursToReview: { value: reviewHours.length ? Math.round(median(reviewHours)! * 10) / 10 : null, n: reviewHours.length, note: "Submitted → first audited status change" },
    interviewAttended: of(count((a) => attended.has(a.id))),
    interviewNoShow: of(count((a) => noShow.has(a.id))),
    qualified: { ...of(qualified), definition: "Reached Selected or later" },
    offered: of(count((a) => offered.has(a.id))),
    accepted: of(acceptedN),
    onboarding: of(count((a) => reached(a, "onboarding"))),
    trainingComplete: { ...of(count(trainingDone)), definition: "Every active module required for the applied role is complete (staff-verified where required)" },
    eventReady: of(count((a) => reached(a, "event_ready"))),
    spend: { state: spend.state, recordedLines: spend.recorded, totalLines: spend.total, actualCents: spend.actualCents },
    costPerQualified: costPer(spend, qualified, wholeCampaign, "qualified applicant"),
    costPerAccepted: costPer(spend, acceptedN, wholeCampaign, "accepted offer"),
    clicks: { value: null, denominator: null, note: "Click/visit counts are not collected here — [TBD — VERIFIED DATA REQUIRED]" },
    byRole: [...byRole].flatMap(([role, m]) => [...m].map(([status, c]) => ({ role, status, n: c }))),
    bySource: [...bySource.values()],
  };
}

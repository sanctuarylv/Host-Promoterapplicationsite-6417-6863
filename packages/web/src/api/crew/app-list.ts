/**
 * Server-side application listing: filters, keyset (cursor) pagination and
 * population totals. Totals always describe the whole filtered population,
 * never just the loaded page.
 */
import { z } from "zod";
import { and, count, desc, eq, inArray, isNull, like, lt, or, sql, type SQL } from "drizzle-orm";
import { db } from "../database";
import { crewApplications } from "../database/schema";

const A = crewApplications;

export const listFilterSchema = z.object({
  status: z.array(z.string().max(40)).max(20).optional(),
  role: z.array(z.string().max(40)).max(10).optional(),
  opportunity: z.string().max(60).optional(),
  q: z.string().max(80).optional(),
  referral: z.enum(["any", "valid", "invalid", "unverified", "none"]).optional(),
  sync: z.enum(["any", "not_configured", "pending", "synced", "failed"]).optional(),
  reviewer: z.enum(["any", "unassigned", "mine"]).optional(),
  overdue: z.boolean().optional(),
  flagged: z.boolean().optional(),
});
export type ListFilter = z.infer<typeof listFilterSchema>;

export const listInputSchema = listFilterSchema.extend({
  cursor: z.string().max(200).nullish(),
  limit: z.number().int().min(1).max(200).default(50),
});

/** cursor = base64url("<created_at seconds>|<id>") */
const encodeCursor = (createdAt: Date, id: string) => Buffer.from(`${Math.floor(createdAt.getTime() / 1000)}|${id}`).toString("base64url");
function decodeCursor(c: string): { t: number; id: string } | null {
  try {
    const [t, id] = Buffer.from(c, "base64url").toString().split("|");
    const n = Number(t);
    return Number.isFinite(n) && id ? { t: n, id } : null;
  } catch {
    return null;
  }
}

export function filterWhere(f: ListFilter, me?: string | null): SQL | undefined {
  const parts: SQL[] = [];
  if (f.status?.length) parts.push(inArray(A.application_status, f.status));
  if (f.role?.length) parts.push(inArray(A.role_interest, f.role));
  if (f.opportunity) parts.push(eq(A.opportunity_key, f.opportunity));
  if (f.referral && f.referral !== "any") parts.push(eq(A.referral_code_status, f.referral));
  if (f.sync && f.sync !== "any") parts.push(eq(A.sync_status, f.sync));
  if (f.reviewer === "unassigned") parts.push(isNull(A.reviewer_user_id));
  if (f.reviewer === "mine" && me) parts.push(eq(A.reviewer_user_id, me));
  if (f.overdue) parts.push(sql`${A.review_due_at} IS NOT NULL AND ${A.review_due_at} < ${Math.floor(Date.now() / 1000)} AND ${A.application_status} NOT IN ('declined','withdrawn','event_ready')`);
  if (f.flagged) parts.push(sql`json_array_length(${A.status_flags}) > 0`);
  if (f.q && f.q.trim()) {
    const term = `%${f.q.trim().toLowerCase().replace(/[%_]/g, "")}%`;
    parts.push(
      or(
        like(sql`lower(${A.first_name} || ' ' || ${A.last_name})`, term),
        like(A.email_normalized, term),
        like(A.phone_normalized, term),
        like(sql`lower(${A.city})`, term),
        like(sql`lower(coalesce(${A.referral_code_used}, ''))`, term),
      )!,
    );
  }
  return parts.length ? and(...parts) : undefined;
}

/** Columns returned by list views (and the CSV export). */
export const LIST_COLUMNS = {
  id: A.id,
  person_id: A.person_id,
  opportunity_key: A.opportunity_key,
  pathway: A.pathway,
  first_name: A.first_name,
  last_name: A.last_name,
  email: A.email_normalized,
  phone: A.phone_normalized,
  city: A.city,
  state: A.state,
  role_interest: A.role_interest,
  instagram: A.instagram,
  tiktok: A.tiktok,
  other_social: A.other_social,
  network_types: A.network_types,
  availability: A.availability,
  evenings_available: A.evenings_available,
  weekends_available: A.weekends_available,
  travel_range: A.travel_range,
  promoter_invite_range: A.promoter_invite_range,
  promoter_experience: A.promoter_experience,
  promoter_experience_notes: A.promoter_experience_notes,
  host_interests: A.host_interests,
  motivation: A.motivation,
  relevant_experience: A.relevant_experience,
  scenario_response: A.scenario_response,
  portfolio_url: A.portfolio_url,
  referral_source: A.referral_source,
  referral_code_used: A.referral_code_used,
  referral_code_status: A.referral_code_status,
  campaign: A.campaign,
  event_id: A.event_id,
  qr_campaign: A.qr_campaign,
  utm_source: A.utm_source,
  utm_medium: A.utm_medium,
  utm_campaign: A.utm_campaign,
  utm_content: A.utm_content,
  referring_url: A.referring_url,
  entry_point: A.entry_point,
  landing_path: A.landing_path,
  application_status: A.application_status,
  legacy_status: A.legacy_status,
  status_flags: A.status_flags,
  revision: A.revision,
  reviewer_user_id: A.reviewer_user_id,
  review_due_at: A.review_due_at,
  consent_version: A.consent_version,
  marketing_consent: A.marketing_consent,
  sync_status: A.sync_status,
  authority: A.authority,
  duplicate_attempts: A.duplicate_attempts,
  created_at: A.created_at,
};

export async function listApplications(input: z.infer<typeof listInputSchema>, me?: string | null) {
  const where = filterWhere(input, me);
  const cur = input.cursor ? decodeCursor(input.cursor) : null;
  const cursorWhere = cur
    ? or(lt(sql`${A.created_at}`, cur.t), and(eq(sql`${A.created_at}`, cur.t), lt(A.id, cur.id)))
    : undefined;
  const rows = await db
    .select(LIST_COLUMNS)
    .from(A)
    .where(where && cursorWhere ? and(where, cursorWhere) : (where ?? cursorWhere))
    .orderBy(desc(A.created_at), desc(A.id))
    .limit(input.limit + 1);
  const hasMore = rows.length > input.limit;
  const page = rows.slice(0, input.limit);
  const last = page[page.length - 1];

  const [total] = await db.select({ n: count() }).from(A).where(where);
  const byStatus = await db.select({ k: A.application_status, n: count() }).from(A).where(where).groupBy(A.application_status);
  const byRole = await db.select({ k: A.role_interest, n: count() }).from(A).where(where).groupBy(A.role_interest);
  const [all] = await db.select({ n: count() }).from(A);

  return {
    rows: page,
    nextCursor: hasMore && last ? encodeCursor(last.created_at, last.id) : null,
    totals: {
      matching: Number(total?.n ?? 0),
      population: Number(all?.n ?? 0),
      byStatus: Object.fromEntries(byStatus.map((s) => [s.k, Number(s.n)])) as Record<string, number>,
      byRole: Object.fromEntries(byRole.map((s) => [s.k, Number(s.n)])) as Record<string, number>,
    },
  };
}

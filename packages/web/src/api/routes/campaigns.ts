/**
 * Recruitment campaign workspace (internal planning only).
 *
 * Nothing here publishes, posts, emails or spends. Budget lines are
 * proposed → approved → actual, each recorded separately; a null actual means
 * "no spend recorded", never zero spend. Metrics always ship with their
 * denominators, and unknown denominators are reported as null (not guessed).
 */
import { z } from "zod";
import QRCode from "qrcode";
import { ORPCError } from "@orpc/server";
import { and, asc, eq } from "drizzle-orm";
import { staffProc } from "../middleware/auth";
import { db } from "../database";
import { cmpBudgetLines, cmpCampaigns, cmpGoals, cmpLinks, cmpTasks } from "../database/schema";
import { actorOf, can, requireCan } from "../shared/permissions";
import { audit } from "../shared/audit";
import { uuid } from "../shared/ids";
import { campaignFunnel } from "../crew/campaign-metrics";
import { ROLE_OPTIONS } from "../crew/contract";

const ROLE_KEYS = ROLE_OPTIONS.map((o) => o.value) as [string, ...string[]];
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

const id = z.string().min(1).max(64);
const slug = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(60)
  .regex(/^[a-z0-9][a-z0-9_-]*$/, "Use lowercase letters, numbers, - or _");
const label = (n = 200) => z.string().trim().min(1).max(n);
const cents = z.number().int().min(0).max(100_000_00);

export const PHASES = [
  { key: "d1_7", label: "Days 1–7", from: 1, to: 7 },
  { key: "d8_14", label: "Days 8–14", from: 8, to: 14 },
  { key: "d15_21", label: "Days 15–21", from: 15, to: 21 },
  { key: "d22_30", label: "Days 22–30", from: 22, to: 30 },
] as const;

/** Public base the tracked links point at. Never invented — falls back to the configured site URL. */
function publicBase() {
  const raw = process.env.VITE_SANCTUARY_PUBLIC_URL || process.env.WEBSITE_URL || "";
  try {
    const u = new URL(raw);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

export function trackedUrl(
  base: string,
  campaignCode: string,
  l: { utm_source: string; utm_medium: string; utm_content: string | null; role_hint: string | null },
) {
  const u = new URL("/crew", base);
  u.searchParams.set("utm_source", l.utm_source);
  u.searchParams.set("utm_medium", l.utm_medium);
  u.searchParams.set("utm_campaign", campaignCode);
  if (l.utm_content) u.searchParams.set("utm_content", l.utm_content);
  if (l.role_hint) u.searchParams.set("role", l.role_hint);
  return u.toString();
}

async function loadCampaign(campaignId: string) {
  const [c] = await db.select().from(cmpCampaigns).where(eq(cmpCampaigns.id, campaignId)).limit(1);
  if (!c) throw new ORPCError("NOT_FOUND", { message: "Campaign not found" });
  return c;
}

const addDaysIso = (ymd: string, days: number) => {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export const campaigns = {
  list: staffProc.handler(async ({ context }) => {
    requireCan(context.principal, "campaigns.read");
    const rows = await db.select().from(cmpCampaigns).orderBy(asc(cmpCampaigns.start_date));
    return { rows, canWrite: can(context.principal, "campaigns.write") };
  }),

  detail: staffProc
    .input(
      z
        .object({
          id,
          role: z.enum(ROLE_KEYS).nullish(),
          from: ymd.nullish(),
          to: ymd.nullish(),
        })
        .refine((v) => !v.from || !v.to || v.from <= v.to, { message: "The start date must be on or before the end date", path: ["to"] }),
    )
    .handler(async ({ input, context }) => {
    requireCan(context.principal, "campaigns.read");
    const c = await loadCampaign(input.id);
    const [goals, links, tasks, budget] = await Promise.all([
      db.select().from(cmpGoals).where(eq(cmpGoals.campaign_id, c.id)).orderBy(asc(cmpGoals.label)),
      db.select().from(cmpLinks).where(eq(cmpLinks.campaign_id, c.id)).orderBy(asc(cmpLinks.created_at)),
      db.select().from(cmpTasks).where(eq(cmpTasks.campaign_id, c.id)).orderBy(asc(cmpTasks.day_offset), asc(cmpTasks.created_at)),
      db.select().from(cmpBudgetLines).where(eq(cmpBudgetLines.campaign_id, c.id)).orderBy(asc(cmpBudgetLines.category)),
    ]);
    const base = publicBase();
    const linkRows = links.map((l) => ({ ...l, url: base ? trackedUrl(base, c.code, l) : null }));

    // Metrics: evidence-based funnel for the requested scope (see crew/campaign-metrics.ts).
    const funnel = await campaignFunnel(c.code, { role: input.role ?? null, from: input.from ?? null, to: input.to ?? null }, budget);

    const sum = (k: "proposed_cents" | "approved_cents" | "actual_cents") => {
      const vals = budget.map((b) => b[k]);
      if (k !== "proposed_cents" && vals.every((v) => v === null)) return null;
      return vals.reduce<number>((s, v) => s + (v ?? 0), 0);
    };

    return {
      campaign: c,
      phases: PHASES.map((p) => ({ ...p, startsOn: addDaysIso(c.start_date, p.from - 1), endsOn: addDaysIso(c.start_date, p.to - 1) })),
      goals,
      links: linkRows,
      linkBaseConfigured: Boolean(base),
      tasks,
      budget: {
        lines: budget,
        proposedCents: sum("proposed_cents"),
        approvedCents: sum("approved_cents"),
        actualCents: sum("actual_cents"),
        note: "Proposed figures are a plan, not approved spend. Nothing is spent from this workspace.",
      },
      metrics: funnel,
      authority: "local_staging" as const,
      canWrite: can(context.principal, "campaigns.write"),
    };
  }),

  create: staffProc
    .input(z.object({ name: label(), concept: label(1000), code: slug, startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
    .handler(async ({ input, context }) => {
      requireCan(context.principal, "campaigns.write");
      const existing = await db.select({ id: cmpCampaigns.id }).from(cmpCampaigns).where(eq(cmpCampaigns.code, input.code)).limit(1);
      if (existing.length) throw new ORPCError("CONFLICT", { message: "That campaign code is already used" });
      const cid = uuid();
      await db.insert(cmpCampaigns).values({
        id: cid,
        name: input.name,
        concept: input.concept,
        code: input.code,
        start_date: input.startDate,
        owner_user_id: context.principal.userId,
        owner_label: context.principal.name,
      });
      await audit(db, actorOf(context.principal), { entityType: "campaign", entityId: cid, action: "campaign.create", to: input.code });
      return { id: cid };
    }),

  update: staffProc
    .input(
      z.object({
        id,
        revision: z.number().int(),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        status: z.enum(["planning", "approved", "running", "closed"]).optional(),
        ownerLabel: label(120).optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      requireCan(context.principal, "campaigns.write");
      const c = await loadCampaign(input.id);
      if (c.revision !== input.revision) throw new ORPCError("CONFLICT", { message: "This campaign changed since you loaded it. Reload and try again." });
      const res = await db
        .update(cmpCampaigns)
        .set({
          start_date: input.startDate ?? c.start_date,
          status: input.status ?? c.status,
          owner_label: input.ownerLabel ?? c.owner_label,
          revision: c.revision + 1,
          updated_at: new Date(),
        })
        .where(and(eq(cmpCampaigns.id, c.id), eq(cmpCampaigns.revision, input.revision)));
      if (res.rowsAffected === 0) throw new ORPCError("CONFLICT", { message: "Concurrent edit — reload and try again." });
      await audit(db, actorOf(context.principal), {
        entityType: "campaign",
        entityId: c.id,
        action: "campaign.update",
        revision: c.revision + 1,
        data: { startDate: input.startDate, status: input.status, ownerLabel: input.ownerLabel },
      });
      return { revision: c.revision + 1 };
    }),

  setGoal: staffProc
    .input(
      z.object({
        campaignId: id,
        roleKey: slug,
        label: label(120),
        target: z.number().int().min(0).max(500),
        reserve: z.number().int().min(0).max(500),
        existingQualified: z.number().int().min(0).max(500).nullable(),
        ownerLabel: label(120).nullable(),
      }),
    )
    .handler(async ({ input, context }) => {
      requireCan(context.principal, "campaigns.write");
      await loadCampaign(input.campaignId);
      await db
        .insert(cmpGoals)
        .values({
          id: uuid(),
          campaign_id: input.campaignId,
          role_key: input.roleKey,
          label: input.label,
          target: input.target,
          reserve: input.reserve,
          existing_qualified: input.existingQualified,
          owner_label: input.ownerLabel,
        })
        .onConflictDoUpdate({
          target: [cmpGoals.campaign_id, cmpGoals.role_key],
          set: { label: input.label, target: input.target, reserve: input.reserve, existing_qualified: input.existingQualified, owner_label: input.ownerLabel },
        });
      await audit(db, actorOf(context.principal), { entityType: "campaign", entityId: input.campaignId, action: "campaign.goal", to: input.roleKey, data: { target: input.target, reserve: input.reserve } });
      return { ok: true };
    }),

  addLink: staffProc
    .input(z.object({ campaignId: id, label: label(120), roleHint: z.enum(["host", "promoter", "both"]).nullable(), source: slug, medium: slug, content: slug.nullable() }))
    .handler(async ({ input, context }) => {
      requireCan(context.principal, "campaigns.write");
      await loadCampaign(input.campaignId);
      const lid = uuid();
      await db.insert(cmpLinks).values({
        id: lid,
        campaign_id: input.campaignId,
        label: input.label,
        role_hint: input.roleHint,
        utm_source: input.source,
        utm_medium: input.medium,
        utm_content: input.content,
      });
      await audit(db, actorOf(context.principal), { entityType: "campaign", entityId: input.campaignId, action: "campaign.link", to: lid });
      return { id: lid };
    }),

  /** QR for a tracked link, generated on demand as SVG (nothing stored or published). */
  linkQr: staffProc.input(z.object({ linkId: id })).handler(async ({ input, context }) => {
    requireCan(context.principal, "campaigns.read");
    const [l] = await db.select().from(cmpLinks).where(eq(cmpLinks.id, input.linkId)).limit(1);
    if (!l) throw new ORPCError("NOT_FOUND", { message: "Link not found" });
    const c = await loadCampaign(l.campaign_id);
    const base = publicBase();
    if (!base) throw new ORPCError("PRECONDITION_FAILED", { message: "Public site URL is not configured, so no QR can be generated." });
    const url = trackedUrl(base, c.code, l);
    const svg = await QRCode.toString(url, { type: "svg", margin: 2, color: { dark: "#0A0A0A", light: "#FFFFFF" } });
    return { url, svg };
  }),

  addTask: staffProc
    .input(
      z.object({
        campaignId: id,
        kind: z.enum(["asset", "calendar"]),
        dayOffset: z.number().int().min(1).max(30).nullable(),
        title: label(200),
        channel: label(80).nullable(),
        ownerLabel: label(120).nullable(),
      }),
    )
    .handler(async ({ input, context }) => {
      requireCan(context.principal, "campaigns.write");
      await loadCampaign(input.campaignId);
      const phase = input.dayOffset ? (PHASES.find((p) => input.dayOffset! >= p.from && input.dayOffset! <= p.to)?.key ?? null) : null;
      const tid = uuid();
      await db.insert(cmpTasks).values({
        id: tid,
        campaign_id: input.campaignId,
        kind: input.kind,
        phase,
        day_offset: input.dayOffset,
        title: input.title,
        channel: input.channel,
        owner_label: input.ownerLabel,
      });
      return { id: tid };
    }),

  setTaskStatus: staffProc.input(z.object({ taskId: id, status: z.enum(["todo", "in_progress", "done"]) })).handler(async ({ input, context }) => {
    requireCan(context.principal, "campaigns.write");
    const res = await db.update(cmpTasks).set({ status: input.status }).where(eq(cmpTasks.id, input.taskId));
    if (res.rowsAffected === 0) throw new ORPCError("NOT_FOUND", { message: "Task not found" });
    await audit(db, actorOf(context.principal), { entityType: "campaign_task", entityId: input.taskId, action: "campaign.task_status", to: input.status });
    return { ok: true };
  }),

  /** Budget line edit. Approval of spend is recorded, never executed. */
  setBudgetLine: staffProc
    .input(
      z.object({
        campaignId: id,
        category: slug,
        label: label(120),
        proposedCents: cents,
        approvedCents: cents.nullable(),
        actualCents: cents.nullable(),
      }),
    )
    .handler(async ({ input, context }) => {
      requireCan(context.principal, "campaigns.write");
      await loadCampaign(input.campaignId);
      await db
        .insert(cmpBudgetLines)
        .values({
          id: uuid(),
          campaign_id: input.campaignId,
          category: input.category,
          label: input.label,
          proposed_cents: input.proposedCents,
          approved_cents: input.approvedCents,
          actual_cents: input.actualCents,
        })
        .onConflictDoUpdate({
          target: [cmpBudgetLines.campaign_id, cmpBudgetLines.category],
          set: { label: input.label, proposed_cents: input.proposedCents, approved_cents: input.approvedCents, actual_cents: input.actualCents },
        });
      await audit(db, actorOf(context.principal), {
        entityType: "campaign",
        entityId: input.campaignId,
        action: "campaign.budget",
        to: input.category,
        data: { proposed: input.proposedCents, approved: input.approvedCents, actual: input.actualCents },
      });
      return { ok: true };
    }),
};

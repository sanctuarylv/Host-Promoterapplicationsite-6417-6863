/**
 * Submission service (v2).
 *
 *   route (crew.submit) → submitApplication() → [crew_people + crew_applications + outbox, one transaction]
 *                                             → [drain outbox inline when forward mode is on]
 *
 * Identity policy (docs/RUNBOOK_V2.md §Identity):
 * - A PERSON is identified by normalized email (crew_people, unique).
 * - An APPLICATION is unique per (person/email, opportunity_key). Re-applying to the
 *   same opportunity is a duplicate (not stored, same public response); applying to
 *   a different opportunity creates a new application for the same person.
 * - Phone is NOT an identity key. A phone already used by a different person is
 *   stored, and both people are flagged `phone_shared` for human review —
 *   never merged and never silently rejected.
 * - Concurrency: person insert is ON CONFLICT DO NOTHING; the application unique
 *   index decides races (loser → duplicate).
 * Duplicates return exactly the same response, so the endpoint can't be used to
 * probe whether someone's email/phone is on file.
 */
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "../database";
import { crewApplications, crewPeople, type CrewApplicationRow } from "../database/schema";
import {
  CONSENT_VERSION,
  CONTRACT_VERSION,
  DEFAULT_OPPORTUNITY,
  type ApplicationParsed,
  normalizeCode,
  normalizeEmail,
  normalizeHandle,
  normalizePhone,
  roleNeedsHost,
  roleNeedsPromoter,
} from "./contract";
import { resolveReferral } from "./referrals";
import { sanitizeFirstTouch, safePath, safeUrl } from "./analytics";
import { drainDue, enqueueApplicationCreate } from "./outbox";
import { getCrewConfig } from "./config";
import { uuid } from "../shared/ids";

export type SubmitOutcome =
  | { kind: "created"; id: string; personId: string; phoneShared: boolean }
  | { kind: "duplicate" }
  | { kind: "dropped"; reason: "honeypot" | "too_fast" | "stale_consent" };

const MIN_FILL_MS = 4000;

const clip = (v: string | null | undefined, max: number) => {
  if (!v) return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
};

const isUnique = (e: unknown) => /UNIQUE|SQLITE_CONSTRAINT/i.test(String((e as Error)?.message ?? e) + String((e as { cause?: unknown })?.cause ?? ""));

export async function submitApplication(input: ApplicationParsed, opts: { opportunityKey?: string } = {}): Promise<SubmitOutcome> {
  if (input.website && input.website.trim() !== "") return { kind: "dropped", reason: "honeypot" };
  if (input.startedAt && Date.now() - input.startedAt < MIN_FILL_MS) return { kind: "dropped", reason: "too_fast" };
  // A form rendered with an older (or no) acknowledgement must not be recorded under the current one.
  if (input.consentVersion !== CONSENT_VERSION) return { kind: "dropped", reason: "stale_consent" };

  const emailNorm = normalizeEmail(input.email);
  const phoneNorm = normalizePhone(input.phone)!;
  const opportunityKey = opts.opportunityKey ?? DEFAULT_OPPORTUNITY;
  const now = new Date();

  const existing = await db
    .select({ id: crewApplications.id })
    .from(crewApplications)
    .where(and(eq(crewApplications.email_normalized, emailNorm), eq(crewApplications.opportunity_key, opportunityKey)))
    .limit(1);
  if (existing[0]) {
    await markDuplicate(existing[0].id, now);
    return { kind: "duplicate" };
  }

  const isPromoter = roleNeedsPromoter(input.roleInterest);
  const isHost = roleNeedsHost(input.roleInterest);
  const a = input.attribution ?? {};
  const referral = await resolveReferral(a.referralCode);
  const firstTouch = sanitizeFirstTouch(a.firstTouch);

  try {
    const result = await db.transaction(async (tx) => {
      await tx
        .insert(crewPeople)
        .values({ id: uuid(), email_normalized: emailNorm, first_name: input.firstName, last_name: input.lastName, phone_normalized: phoneNorm, created_at: now, updated_at: now })
        .onConflictDoNothing({ target: crewPeople.email_normalized });
      const [person] = await tx.select().from(crewPeople).where(eq(crewPeople.email_normalized, emailNorm)).limit(1);
      if (!person) throw new Error("person upsert failed");

      const others = await tx
        .select({ id: crewPeople.id })
        .from(crewPeople)
        .where(and(eq(crewPeople.phone_normalized, phoneNorm), ne(crewPeople.id, person.id)))
        .limit(20);
      const phoneShared = others.length > 0;
      if (phoneShared) {
        await tx.update(crewPeople).set({ phone_shared: true, updated_at: now }).where(eq(crewPeople.phone_normalized, phoneNorm));
      }

      const id = uuid();
      const row = {
        id,
        person_id: person.id,
        opportunity_key: opportunityKey,
        pathway: "paid_group",
        contract_version: CONTRACT_VERSION,
        status_flags: phoneShared ? ["phone_shared"] : [],
        authority: "local_staging",
        first_name: input.firstName,
        last_name: input.lastName,
        email: input.email.trim(),
        email_normalized: emailNorm,
        phone: input.phone.trim(),
        phone_normalized: phoneNorm,
        city: input.city,
        state: input.state,
        role_interest: input.roleInterest,
        instagram: input.instagram ? normalizeHandle(input.instagram, "instagram") || null : null,
        tiktok: input.tiktok ? normalizeHandle(input.tiktok, "tiktok") || null : null,
        other_social: input.otherSocial || null,
        network_types: input.networkTypes,
        availability: input.availability,
        evenings_available: input.eveningsAvailable,
        weekends_available: input.weekendsAvailable,
        travel_range: input.travelRange ?? null,
        relevant_experience: input.relevantExperience || null,
        scenario_response: input.scenarioResponse || null,
        portfolio_url: input.portfolioUrl || null,
        promoter_invite_range: isPromoter ? (input.promoterInviteRange ?? null) : null,
        promoter_experience: isPromoter ? (input.promoterExperience ?? null) : null,
        promoter_experience_notes: isPromoter && input.promoterExperience ? input.promoterExperienceNotes || null : null,
        host_interests: isHost ? (input.hostInterests ?? []) : [],
        motivation: input.motivation,
        referral_source: input.referralSource,
        referral_code_used: referral.code,
        referral_code_status: referral.status,
        campaign: normalizeCode(a.campaign),
        event_id: normalizeCode(a.eventId),
        qr_campaign: normalizeCode(a.qrCampaign),
        utm_source: clip(a.utmSource, 120),
        utm_medium: clip(a.utmMedium, 120),
        utm_campaign: clip(a.utmCampaign, 120),
        utm_content: clip(a.utmContent, 120),
        utm_term: clip(a.utmTerm, 120),
        referring_url: safeUrl(a.referringUrl),
        landing_path: safePath(a.landingPath),
        entry_point: clip(a.entryPoint, 60),
        attribution_json: { capturedAt: a.capturedAt ?? null, firstTouch: firstTouch.value },
        application_status: "submitted",
        required_consent_at: now,
        consent_version: CONSENT_VERSION,
        marketing_consent: input.marketingConsent === true,
        marketing_consent_at: input.marketingConsent ? now : null,
        sync_status: getCrewConfig().submissionMode === "forward" ? "pending" : "not_configured",
        created_at: now,
        updated_at: now,
      } satisfies typeof crewApplications.$inferInsert;
      await tx.insert(crewApplications).values(row);
      const [stored] = await tx.select().from(crewApplications).where(eq(crewApplications.id, id)).limit(1);
      await enqueueApplicationCreate(tx, stored as CrewApplicationRow);
      return { id, personId: person.id, phoneShared };
    });

    if (getCrewConfig().submissionMode === "forward") await drainDue(3);
    return { kind: "created", ...result };
  } catch (e) {
    if (isUnique(e)) return { kind: "duplicate" };
    throw e;
  }
}

async function markDuplicate(id: string, now: Date) {
  await db
    .update(crewApplications)
    .set({ duplicate_attempts: sql`${crewApplications.duplicate_attempts} + 1`, last_duplicate_at: now })
    .where(eq(crewApplications.id, id));
}

/**
 * Derived readiness for an event assignment. Never stored as a flag — it is
 * recomputed from the underlying records so it can't drift.
 */
import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import { db } from "../database";
import {
  crewOffers,
  crewQualifications,
  crewTrainingModules,
  crewTrainingRecords,
  opsAssignments,
  opsCredentials,
  opsEvents,
  opsTemplateRoles,
} from "../database/schema";
import { hmac, sha256 } from "../shared/ids";

export type Readiness = { ready: boolean; blockers: string[] };
export const NO_CREDENTIAL_BLOCKER = "No active credential issued";

/** Credential value shown to the worker. Derived from a server secret, so the DB stores only its hash. */
export const credentialToken = (credentialId: string) => `SXC.${hmac("credential", credentialId)}`;
export const credentialHash = (credentialId: string) => sha256(credentialToken(credentialId));

export async function assignmentReadiness(assignmentId: string): Promise<Readiness> {
  const [a] = await db.select().from(opsAssignments).where(eq(opsAssignments.id, assignmentId)).limit(1);
  if (!a) return { ready: false, blockers: ["Assignment not found"] };
  const [ev] = await db.select().from(opsEvents).where(eq(opsEvents.id, a.event_id)).limit(1);
  const [role] = ev
    ? await db
        .select()
        .from(opsTemplateRoles)
        .where(and(eq(opsTemplateRoles.template_version_id, ev.template_version_id), eq(opsTemplateRoles.role_key, a.role_key)))
        .limit(1)
    : [];
  const b: string[] = [];
  if (!ev) b.push("Event missing");
  else {
    if (!ev.date_confirmed || !ev.local_date) b.push("Event date not confirmed");
    if (!ev.venue_confirmed) b.push("Venue not confirmed");
  }
  if (a.status !== "approved") b.push("Assignment not approved");
  if (role?.workforce === "unclassified") b.push("Role workforce unclassified");
  if (role?.workforce === "paid_group") {
    const [o] = a.offer_id ? await db.select().from(crewOffers).where(eq(crewOffers.id, a.offer_id)).limit(1) : [];
    if (!o || o.status !== "accepted") b.push("No accepted Sanctuary LV Group offer");
  }
  if (!a.shift_start_utc || !a.shift_end_utc) b.push("Shift times not set");
  else if (!a.shift_confirmed) b.push("Shift not confirmed");
  if (role?.supervisor_role_key && !a.supervisor_person_id) b.push("Supervisor not assigned");

  const keys = role?.training ?? [];
  if (keys.length) {
    const mods = await db
      .select()
      .from(crewTrainingModules)
      .where(and(inArray(crewTrainingModules.module_key, keys), eq(crewTrainingModules.status, "active")));
    const recs = mods.length
      ? await db
          .select()
          .from(crewTrainingRecords)
          .where(and(eq(crewTrainingRecords.person_id, a.person_id), inArray(crewTrainingRecords.module_id, mods.map((m) => m.id))))
      : [];
    for (const k of keys) {
      const m = mods.find((x) => x.module_key === k);
      if (!m) {
        b.push(`Training module "${k}" not published`);
        continue;
      }
      const r = recs.find((x) => x.module_id === m.id);
      if (!r?.completed_at) b.push(`Training incomplete: ${m.title}`);
      else if (m.verification === "staff_verified" && !r.verified_at) b.push(`Training awaiting verification: ${m.title}`);
    }
  }
  const quals = role?.qualifications ?? [];
  if (quals.length) {
    const now = new Date();
    const have = await db
      .select()
      .from(crewQualifications)
      .where(and(eq(crewQualifications.person_id, a.person_id), isNull(crewQualifications.revoked_at)));
    for (const q of quals) {
      const h = have.find((x) => x.qualification_key === q && (!x.expires_at || x.expires_at > now));
      if (!h) b.push(`Missing verified qualification: ${q}`);
    }
  }
  const creds = await db
    .select({ id: opsCredentials.id })
    .from(opsCredentials)
    .where(and(eq(opsCredentials.assignment_id, a.id), isNull(opsCredentials.revoked_at), gt(opsCredentials.expires_at, new Date())))
    .limit(1);
  if (!creds.length) b.push(NO_CREDENTIAL_BLOCKER);
  return { ready: b.length === 0, blockers: b };
}

/** Active credentials for a worker (used by the worker portal). */
export async function activeCredentialFor(assignmentId: string) {
  const [c] = await db
    .select()
    .from(opsCredentials)
    .where(and(eq(opsCredentials.assignment_id, assignmentId), isNull(opsCredentials.revoked_at), gt(opsCredentials.expires_at, new Date())))
    .limit(1);
  return c ?? null;
}

/**
 * INTERFACE SPEC ONLY — ticketing / registration import (no PII).
 *
 * NOT CONNECTED. Today guest data exists only as test fixtures
 * (promoters.fixtureRegister / fixtureScan, gated by CREW_TICKETING_FIXTURES)
 * and promoters.aggregates reports `live: false`. No ticketing provider is
 * chosen, no endpoint or credential exists, and nothing imports this module.
 *
 * The contract below is what a FUTURE importer would accept from a ticketing
 * provider export. It maps onto the existing staging tables without schema
 * changes:
 *
 *   attendee.attendee_ref ─HMAC("guest", "<provider>:<ref>")─▶ guest_registrations.guest_key
 *   attendee.promo_code   ─approved link for THIS event, valid at registered_at─▶ promoter_link_id
 *   (source = "import")
 *   scan.*                ─first admitted per registration, later = reentry─▶ guest_scans
 *
 * Privacy: every object is `.strict()` — an export carrying a name, email,
 * phone, address, date of birth, payment or free-text field is REJECTED rather
 * than silently dropped, so PII can never be staged by accident.
 */
import { z } from "zod";

export const TICKETING_SPEC_STATUS = { implemented: false, wired: false, provider: null, version: "ticketing-import.v0-proposed" } as const;

const isoTs = z.iso.datetime();
/** Provider's opaque attendee / order-line reference. Must not be an email or phone number. */
const opaqueRef = z
  .string()
  .min(4)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/)
  .refine((s) => !/@/.test(s) && !/^\+?\d{7,}$/.test(s), "attendee_ref must be opaque (not an email or phone number)");

export const TicketAttendeeSchema = z
  .object({
    attendee_ref: opaqueRef,
    ticket_type: z.string().min(1).max(60),
    registered_at: isoTs,
    promo_code: z.string().trim().max(20).regex(/^[A-Za-z0-9-]*$/).nullable(),
    status: z.enum(["valid", "cancelled", "refunded"]),
  })
  .strict();

export const TicketScanSchema = z
  .object({
    attendee_ref: opaqueRef,
    scanned_at: isoTs,
    gate: z.string().max(40).nullable(),
  })
  .strict();

export const TicketingImportSchema = z
  .object({
    version: z.literal(TICKETING_SPEC_STATUS.version),
    provider: z.string().regex(/^[a-z][a-z0-9_]{1,30}$/),
    provider_event_ref: z.string().min(1).max(128),
    event_id: z.string().min(1),
    exported_at: isoTs,
    attendees: z.array(TicketAttendeeSchema).max(50_000),
    scans: z.array(TicketScanSchema).max(200_000),
  })
  .strict();
export type TicketingImport = z.infer<typeof TicketingImportSchema>;

export type StagedRegistration = { guest_key: string; event_id: string; promo_code: string | null; registered_at: string; source: "import" };
export type StagedScan = { guest_key: string; event_id: string; scanned_at: string; result: "admitted" | "reentry" };
export type ImportDryRun = {
  live: false;
  applied: false;
  registrations: StagedRegistration[];
  scans: StagedScan[];
  skipped: { reason: string; count: number }[];
  totals: { attendees: number; registrations: number; scans: number; admitted: number; reentries: number };
};

/**
 * Pure DRY RUN of the import mapping. `keyOf` stands in for the server-side
 * HMAC (shared/ids.ts guestKey namespace) so this spec never needs the secret.
 * Rules mirror the fixture procedures:
 *  - one registration per (event, guest_key); the earliest registered_at wins
 *  - cancelled / refunded attendees are not staged
 *  - first scan per registration = admitted, later scans = reentry
 *  - scans for unknown / unstaged attendees are skipped, never invented
 */
export function dryRunTicketingImport(input: unknown, keyOf: (namespaced: string) => string): ImportDryRun {
  const x = TicketingImportSchema.parse(input);
  const key = (ref: string) => keyOf(`${x.provider}:${ref}`);
  const skipped = new Map<string, number>();
  const skip = (r: string) => skipped.set(r, (skipped.get(r) ?? 0) + 1);
  const regs = new Map<string, StagedRegistration>();
  for (const a of [...x.attendees].sort((p, q) => p.registered_at.localeCompare(q.registered_at))) {
    if (a.status !== "valid") {
      skip(`attendee_${a.status}`);
      continue;
    }
    const k = key(a.attendee_ref);
    if (regs.has(k)) {
      skip("duplicate_attendee");
      continue;
    }
    regs.set(k, { guest_key: k, event_id: x.event_id, promo_code: a.promo_code ? a.promo_code.toUpperCase() : null, registered_at: a.registered_at, source: "import" });
  }
  const admitted = new Set<string>();
  const scans: StagedScan[] = [];
  for (const s of [...x.scans].sort((p, q) => p.scanned_at.localeCompare(q.scanned_at))) {
    const k = key(s.attendee_ref);
    if (!regs.has(k)) {
      skip("scan_without_registration");
      continue;
    }
    const result = admitted.has(k) ? "reentry" : "admitted";
    admitted.add(k);
    scans.push({ guest_key: k, event_id: x.event_id, scanned_at: s.scanned_at, result });
  }
  return {
    live: false,
    applied: false,
    registrations: [...regs.values()],
    scans,
    skipped: [...skipped.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => a.reason.localeCompare(b.reason)),
    totals: { attendees: x.attendees.length, registrations: regs.size, scans: scans.length, admitted: admitted.size, reentries: scans.length - admitted.size },
  };
}

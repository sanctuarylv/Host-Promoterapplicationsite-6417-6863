/**
 * Referral-code resolution boundary.
 *
 * Today ("format" mode) any well-formed code is accepted and stored as
 * `unverified` — attribution is never lost, and Sanctuary can reconcile
 * codes later. When the Command Center becomes the authoritative source of
 * promoter codes, set CREW_REFERRAL_VALIDATION_MODE=command_center and the
 * lookup path; codes are then marked `valid` / `invalid`.
 *
 * Invalid codes are still stored (marked invalid) rather than dropped, so a
 * mistyped promoter link is recoverable by a human.
 */
import { normalizeCode } from "./contract";
import { getCrewConfig } from "./config";
import { lookupReferralCode } from "./command-center";

export type ReferralStatus = "none" | "unverified" | "valid" | "invalid";

export async function resolveReferral(raw: string | null | undefined): Promise<{
  code: string | null;
  status: ReferralStatus;
}> {
  if (!raw) return { code: null, status: "none" };
  const code = normalizeCode(raw);
  if (!code) return { code: null, status: "none" };
  const cfg = getCrewConfig();
  if (cfg.referralMode !== "command_center") return { code, status: "unverified" };
  return { code, status: await lookupReferralCode(code) };
}

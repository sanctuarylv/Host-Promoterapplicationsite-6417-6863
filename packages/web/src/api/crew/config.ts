/**
 * Server-only configuration. Every integration point is an environment
 * variable in the root `.env` — nothing here has a production default, so
 * no endpoint, domain or credential is ever assumed.
 *
 * Never import this file from browser code.
 */

export type SubmissionMode = "local" | "forward";
export type ReferralValidationMode = "format" | "command_center";

const env = (k: string) => {
  const v = process.env[k];
  return v && v.trim() !== "" ? v.trim() : undefined;
};

export function getCrewConfig() {
  const baseUrl = env("COMMAND_CENTER_API_BASE_URL")?.replace(/\/+$/, "");
  const applicationsPath = env("COMMAND_CENTER_APPLICATIONS_PATH");
  const referralPath = env("COMMAND_CENTER_REFERRAL_LOOKUP_PATH");
  const statusPath = env("COMMAND_CENTER_STATUS_PATH"); // proposed: /.../applications/{id}/status-events
  const mode = (env("CREW_SUBMISSION_MODE") ?? "local") as SubmissionMode;
  const referralMode = (env("CREW_REFERRAL_VALIDATION_MODE") ?? "format") as ReferralValidationMode;

  return {
    submissionMode: mode === "forward" ? "forward" : ("local" as SubmissionMode),
    referralMode: referralMode === "command_center" ? "command_center" : ("format" as ReferralValidationMode),
    commandCenter: {
      baseUrl,
      applicationsPath,
      referralPath,
      statusPath,
      apiKey: env("COMMAND_CENTER_API_KEY"),
      signingSecret: env("COMMAND_CENTER_SIGNING_SECRET"),
      timeoutMs: Number(env("COMMAND_CENTER_TIMEOUT_MS") ?? 8000),
      /** True only when every value needed to forward applications exists. */
      canForward: Boolean(baseUrl && applicationsPath && env("COMMAND_CENTER_API_KEY")),
      canLookupReferrals: Boolean(baseUrl && referralPath && env("COMMAND_CENTER_API_KEY")),
    },
    adminAccessKey: env("CREW_ADMIN_ACCESS_KEY"),
    /**
     * Legacy shared-key admin after individual staff auth: "readonly" (default —
     * list/export only, no status changes or retries) or "disabled".
     */
    legacyAdminMode: env("CREW_LEGACY_ADMIN_MODE") === "disabled" ? ("disabled" as const) : ("readonly" as const),
  };
}

/**
 * Production configuration points for https://crew.sanctuarylv.org.
 *
 * Server-only. Nothing here holds a secret or a credential: the canonical
 * origin is public (DNS: CNAME crew → fallback.runable.site, configured by the
 * Sanctuary administrator, never from this repository). Every other value is
 * read from the root `.env` at runtime.
 *
 * `readinessReport()` turns the live configuration into PASS / BLOCKED
 * checks for the staff Integration page. It reports presence and shape only —
 * never a secret value, a token or a client IP.
 */

/** Official production origin. No trailing slash. */
export const CANONICAL_ORIGIN = "https://crew.sanctuarylv.org";

const env = (k: string) => {
  const v = process.env[k];
  return v && v.trim() !== "" ? v.trim() : undefined;
};

/** Origin of a URL string, or null when it is not an absolute http(s) URL. */
export function originOf(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.origin : null;
  } catch {
    return null;
  }
}

/** True when this process is configured as the production deployment of the canonical domain. */
export function isCanonicalDeployment(): boolean {
  return originOf(env("WEBSITE_URL")) === CANONICAL_ORIGIN;
}

/**
 * Origins allowed to make state-changing Better Auth requests (CSRF / origin
 * check) and to be used as auth redirect targets. Explicit allow-list —
 * a request's own Origin header is never reflected back as trusted.
 *
 *  - the canonical production domain;
 *  - WEBSITE_URL (the platform-injected origin of this deployment or preview);
 *  - VITE_SANCTUARY_PUBLIC_URL (public link origin, if set);
 *  - CREW_EXTRA_TRUSTED_ORIGINS (comma-separated, exact origins only);
 *  - localhost dev origins, only when WEBSITE_URL itself is not the canonical domain.
 */
export function trustedOriginList(): string[] {
  const out = new Set<string>([CANONICAL_ORIGIN]);
  for (const v of [env("WEBSITE_URL"), env("VITE_SANCTUARY_PUBLIC_URL")]) {
    const o = originOf(v);
    if (o) out.add(o);
  }
  for (const raw of (env("CREW_EXTRA_TRUSTED_ORIGINS") ?? "").split(",")) {
    const o = originOf(raw);
    // Exact origins only; wildcards and paths are ignored on purpose.
    if (o && !raw.includes("*")) out.add(o);
  }
  if (!isCanonicalDeployment()) {
    const port = env("PORT") ?? "4200";
    for (const p of new Set([port, "4200"])) {
      out.add(`http://localhost:${p}`);
      out.add(`http://127.0.0.1:${p}`);
    }
  }
  return [...out];
}

/**
 * Ticketing fixtures (synthetic guest registrations/scans) fabricate data, so
 * they are OFF on the canonical production deployment unless an administrator
 * explicitly sets CREW_TICKETING_FIXTURES=enabled. Elsewhere they default on
 * for tests and demos; set CREW_TICKETING_FIXTURES=disabled to turn them off.
 */
export function ticketingFixturesEnabled(): boolean {
  const v = env("CREW_TICKETING_FIXTURES")?.toLowerCase();
  if (v === "enabled") return true;
  if (v === "disabled") return false;
  return !isCanonicalDeployment();
}

/** Fails closed when the canonical deployment is missing a usable auth secret. */
export function assertProductionSecrets(): void {
  if (!isCanonicalDeployment() && env("NODE_ENV") !== "production") return;
  const s = env("BETTER_AUTH_SECRET");
  if (!s || s.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must be set (32+ characters) for the production deployment. Refusing to start with a default or short secret.");
  }
}

export type ReadinessState = "pass" | "blocked_user" | "blocked_external" | "not_started";
export type ReadinessCheck = { key: string; label: string; state: ReadinessState; detail: string };

/** Legal/consent URLs the public pages link to (see docs/LEGAL_PLACEHOLDERS_V2.md). */
export const LEGAL_ENV_KEYS = [
  ["VITE_SANCTUARY_PRIVACY_URL", "Privacy Policy"],
  ["VITE_SANCTUARY_TERMS_URL", "Terms of Use"],
  ["VITE_SANCTUARY_GROUP_DISCLOSURE_URL", "Sanctuary LV Group paid-role (employment/contractor) disclosure"],
  ["VITE_SANCTUARY_VOLUNTEER_TERMS_URL", "Sanctuary LV nonprofit volunteer terms"],
  ["VITE_SANCTUARY_COMMUNICATIONS_URL", "Email/SMS communications consent terms"],
  ["VITE_SANCTUARY_DATA_RETENTION_URL", "Data-retention notice"],
] as const;

const httpsOrNull = (k: string) => {
  const v = env(k);
  return v && v.startsWith("https://") ? v : null;
};

/**
 * Configuration readiness for production. `headers` is the current request's
 * headers — only header PRESENCE is reported, so an administrator can confirm
 * which client-IP headers the real edge sets without exposing any IP.
 */
export function readinessReport(headers?: Headers) {
  const checks: ReadinessCheck[] = [];
  const add = (key: string, label: string, state: ReadinessState, detail: string) => checks.push({ key, label, state, detail });

  const site = originOf(env("WEBSITE_URL"));
  add(
    "website_url",
    "WEBSITE_URL is the canonical domain",
    site === CANONICAL_ORIGIN ? "pass" : "blocked_user",
    site === CANONICAL_ORIGIN ? CANONICAL_ORIGIN : `Currently ${site ?? "unset"}. Production must be ${CANONICAL_ORIGIN} (platform-injected; set when the custom domain is attached).`,
  );

  const nodeEnv = env("NODE_ENV") ?? "(unset)";
  add(
    "node_env",
    "Runtime NODE_ENV is production",
    nodeEnv === "production" ? "pass" : "blocked_user",
    nodeEnv === "production" ? "production" : `Runtime NODE_ENV=${nodeEnv}. Builds force production; remove NODE_ENV=development from the deployed .env (or set production).`,
  );

  const secret = env("BETTER_AUTH_SECRET");
  add("auth_secret", "BETTER_AUTH_SECRET present (32+ chars)", secret && secret.length >= 32 ? "pass" : "blocked_user", secret ? `${secret.length >= 32 ? "Present" : "Too short"}` : "Missing");
  add("token_secret", "CREW_TOKEN_SECRET set (stable, separate from auth secret)", env("CREW_TOKEN_SECRET") ? "pass" : "blocked_user", env("CREW_TOKEN_SECRET") ? "Present" : "Unset — falls back to BETTER_AUTH_SECRET. Set a dedicated stable value before issuing production credentials.");

  const managed = Boolean(env("APPLICATION_ID") && env("VITE_RUNABLE_AUTH_ISSUER") && env("VITE_APPLICATION_ID"));
  add("managed_auth_env", "Managed Google sign-in env present", managed ? "pass" : "blocked_external", managed ? "APPLICATION_ID, VITE_RUNABLE_AUTH_ISSUER, VITE_APPLICATION_ID present (platform-injected)" : "Platform-injected values missing");
  add("managed_auth_domain", "Google sign-in verified on the canonical domain", "blocked_external", `Requires the Runable broker to accept ${CANONICAL_ORIGIN} as a redirect target for this application. Verify by signing in with Google on ${CANONICAL_ORIGIN}.`);

  const proxy = (env("CREW_TRUSTED_PROXY") ?? "none").toLowerCase();
  const present = (h: string) => Boolean(headers?.get(h));
  const seen = ["cf-connecting-ip", "x-real-ip", "x-forwarded-for", "fly-client-ip", "true-client-ip"].filter(present);
  add(
    "trusted_proxy",
    "Client-IP trust configured for the verified edge",
    proxy === "none" ? "blocked_external" : "pass",
    `CREW_TRUSTED_PROXY=${proxy}. Headers on this request: ${seen.length ? seen.join(", ") : "none"}. Keep "none" until the edge contract is verified (docs/RUNBOOK_V2.md §8).`,
  );

  const cc = Boolean(env("COMMAND_CENTER_API_BASE_URL") && env("COMMAND_CENTER_APPLICATIONS_PATH") && env("COMMAND_CENTER_API_KEY"));
  add("command_center", "Command Center connection", "blocked_external", cc ? "Values present but the contract is unverified — Saved locally — Command Center connection pending" : "Saved locally — Command Center connection pending (contract, environment and credentials not supplied)");

  for (const [k, label] of LEGAL_ENV_KEYS) {
    add(`legal:${k}`, label, httpsOrNull(k) ? "pass" : "blocked_user", httpsOrNull(k) ? "Linked" : `${k} unset — placeholder shown`);
  }

  add("ticketing", "Live ticketing integration", "blocked_external", `Not connected. Fixtures ${ticketingFixturesEnabled() ? "ENABLED (demo/test data only)" : "disabled"}.`);
  add("workbook", "Official 36-role staffing workbook imported", "blocked_user", "Not supplied. Template roles are a planning seed (scripts/workbook-reconcile.ts validates an export, dry run only).");

  return { canonicalOrigin: CANONICAL_ORIGIN, trustedOrigins: trustedOriginList(), checks };
}

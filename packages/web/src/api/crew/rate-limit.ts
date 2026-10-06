/**
 * Shared, DB-backed fixed-window rate limiter (every server instance shares
 * the same counters in crew_rate_limits — no per-process state).
 *
 * Client identity is derived ONLY from headers the deployment trust boundary
 * guarantees. Configure CREW_TRUSTED_PROXY:
 *   - "none" (default): no client IP header is trusted. Limits fall back to a
 *     single shared "untrusted" bucket with a higher ceiling plus per-identity
 *     limits (e.g. email hash) applied by callers.
 *   - "cloudflare": trust cf-connecting-ip.
 *   - "x-real-ip": trust x-real-ip (set by our own reverse proxy).
 *   - "xff:N": trust the N-th entry from the RIGHT of x-forwarded-for
 *     (N = number of proxies we operate, e.g. xff:1).
 * The Runable edge header contract is not documented here; until verified,
 * leave "none" (see docs/RUNBOOK_V2.md → externally blocked).
 */
import { isIP } from "node:net";
import { sql } from "drizzle-orm";
import { db } from "../database";
import { crewRateLimits } from "../database/schema";

export type ClientIdentity = { key: string; trusted: boolean };

export function trustedProxyMode(): string {
  return (process.env.CREW_TRUSTED_PROXY ?? "none").trim().toLowerCase() || "none";
}

export function clientIdentity(headers: Headers): ClientIdentity {
  const mode = trustedProxyMode();
  let ip: string | null = null;
  if (mode === "cloudflare") ip = headers.get("cf-connecting-ip");
  else if (mode === "x-real-ip") ip = headers.get("x-real-ip");
  else if (mode.startsWith("xff:")) {
    const n = Math.max(1, Number(mode.slice(4)) || 1);
    const hops = (headers.get("x-forwarded-for") ?? "").split(",").map((h) => h.trim()).filter(Boolean);
    ip = hops.length >= n ? hops[hops.length - n]! : null;
  }
  ip = ip?.trim().toLowerCase() ?? null;
  // Must parse as a real IPv4/IPv6 literal — anything else is treated as untrusted.
  if (ip && isIP(ip) !== 0) return { key: `ip:${ip}`, trusted: true };
  return { key: "untrusted", trusted: false };
}

/** Back-compat helper used by older call sites. */
export const clientIp = (headers: Headers) => clientIdentity(headers).key;

/**
 * Atomic increment-and-check. One UPSERT ... RETURNING statement, so
 * concurrent requests on any instance see a consistent count.
 */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<{ ok: boolean; retryAfterMs: number; count: number }> {
  const now = Date.now();
  const cutoff = now - windowMs;
  const rows = await db
    .insert(crewRateLimits)
    .values({ key, window_start: now, count: 1 })
    .onConflictDoUpdate({
      target: crewRateLimits.key,
      set: {
        count: sql`CASE WHEN ${crewRateLimits.window_start} <= ${cutoff} THEN 1 ELSE ${crewRateLimits.count} + 1 END`,
        window_start: sql`CASE WHEN ${crewRateLimits.window_start} <= ${cutoff} THEN ${now} ELSE ${crewRateLimits.window_start} END`,
      },
    })
    .returning({ count: crewRateLimits.count, window_start: crewRateLimits.window_start });
  const r = rows[0] ?? { count: 1, window_start: now };
  return { ok: r.count <= limit, retryAfterMs: Math.max(0, r.window_start + windowMs - now), count: r.count };
}

/** Apply a limit to a request: per trusted IP, or a larger shared bucket when untrusted. */
export async function limitRequest(headers: Headers, bucket: string, perClient: number, untrustedShared: number, windowMs: number) {
  const id = clientIdentity(headers);
  return rateLimit(`${bucket}:${id.key}`, id.trusted ? perClient : untrustedShared, windowMs);
}

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { runableManagedAuth } from "@runablehq/managed-auth/server";
import { createHash } from "node:crypto";
import { db } from "./database";
import { rateLimit } from "./crew/rate-limit";

/**
 * Client-IP trust for Better Auth's rate limiter, aligned with CREW_TRUSTED_PROXY
 * (see crew/rate-limit.ts). Better Auth's default trusts the LEFTMOST
 * x-forwarded-for entry, which a client can spoof, so we never use that default:
 *   - cloudflare -> cf-connecting-ip, x-real-ip -> x-real-ip (per-IP buckets).
 *   - none / xff:N -> no header trusted; Better Auth falls back to ONE shared
 *     bucket per path, so those buckets get a higher ceiling (SHARED_FACTOR).
 * The Runable edge header contract is unverified (externally blocked).
 */
const proxyMode = (process.env.CREW_TRUSTED_PROXY ?? "none").trim().toLowerCase();
const trustedIpHeader = proxyMode === "cloudflare" ? "cf-connecting-ip" : proxyMode === "x-real-ip" ? "x-real-ip" : null;
const SHARED_FACTOR = 20;
const sharedCeiling = (_req: Request, cur: { window: number; max: number }) => (trustedIpHeader ? cur : { window: cur.window, max: cur.max * SHARED_FACTOR });

/**
 * Per-ACCOUNT password-guessing guard, independent of client IP (which may be
 * untrusted/shared — see above). Counts every email sign-in attempt for one
 * normalized address in the shared DB limiter. Trade-off: someone hammering an
 * address can delay that address's password sign-in for the window; Google
 * sign-in is unaffected. Counters store only a hash of the address.
 */
export const SIGNIN_PER_EMAIL = { limit: 10, windowMs: 15 * 60_000 };
const signInGuard = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== "/sign-in/email") return;
  const email = String((ctx.body as { email?: unknown } | undefined)?.email ?? "").trim().toLowerCase();
  if (!email) return;
  const key = `signin-email:${createHash("sha256").update(email).digest("hex").slice(0, 32)}`;
  const r = await rateLimit(key, SIGNIN_PER_EMAIL.limit, SIGNIN_PER_EMAIL.windowMs);
  if (!r.ok) throw new APIError("TOO_MANY_REQUESTS", { message: "Too many sign-in attempts for this account. Try again later or use Google sign-in." });
});

/**
 * Individual sign-in for staff and workers (Better Auth).
 * - Email + password (no automatic privileges — an account alone grants nothing).
 * - Runable managed Google sign-in.
 * Staff permissions come only from `staff_memberships`; worker access only from an
 * explicit person link (see crew/identity.ts). Email matches never grant or link anything.
 */
export const auth = betterAuth({
  basePath: "/api/auth",
  baseURL: process.env.WEBSITE_URL,
  database: drizzleAdapter(db, { provider: "sqlite" }),
  emailAndPassword: { enabled: true, minPasswordLength: 10 },
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: (request) => {
    const origin = request?.headers.get("origin");
    return origin ? [origin] : ["*"];
  },
  hooks: { before: signInGuard },
  advanced: { ipAddress: { ipAddressHeaders: [trustedIpHeader ?? "x-sanctuary-no-trusted-ip"] } },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 30,
    customRules: {
      // Session reads are bearer/cookie-authenticated, not a guessing surface; limiting
      // them signed real users out (a 429 here looked like "no session").
      "/get-session": false,
      "/**": sharedCeiling,
    },
  },
  plugins: [
    ...runableManagedAuth({
      applicationId: process.env.APPLICATION_ID!,
      issuer: process.env.VITE_RUNABLE_AUTH_ISSUER!,
    }),
  ],
});

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { runableManagedAuth } from "@runablehq/managed-auth/server";
import { db } from "./database";

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

import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";

export const uuid = () => randomUUID();

/** URL-safe opaque random token (no embedded data). */
export const opaqueToken = (bytes = 24) => randomBytes(bytes).toString("base64url");

export const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

/** Server-side secret used for HMAC-derived tokens/keys. Never logged. */
function serverSecret(): string {
  const s = process.env.CREW_TOKEN_SECRET || process.env.BETTER_AUTH_SECRET;
  if (!s) throw new Error("CREW_TOKEN_SECRET / BETTER_AUTH_SECRET is not configured");
  return s;
}

export const hmac = (purpose: string, v: string) => createHmac("sha256", serverSecret()).update(`${purpose}:${v}`).digest("base64url");

/** Pseudonymous key for a guest email (dedupe without storing the address). */
export const guestKey = (emailNormalized: string) => hmac("guest", emailNormalized.trim().toLowerCase());

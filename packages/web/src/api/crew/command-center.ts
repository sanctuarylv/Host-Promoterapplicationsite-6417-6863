/**
 * Sanctuary Command Center adapter — the ONLY file that knows how to talk to
 * the Command Center.
 *
 * STATUS: the real Command Center API contract has NOT been provided or
 * verified. Everything below implements the PROPOSED contract in
 * docs/COMMAND_CENTER_CONTRACT_V2.md. Parsing is deliberately strict: any
 * response that does not match the documented shape is treated as NOT
 * synchronized (classified "malformed" / "conflict"), never as success.
 * Configuration presence is not proof of connectivity.
 */
import { createHmac } from "node:crypto";
import { z } from "zod";
import { CONTRACT_VERSION } from "./contract";
import { getCrewConfig } from "./config";
import type { CrewApplicationRow } from "../database/schema";

export const PROPOSED_CONTRACT_ID = "sanctuary-cc.crew.proposed-v2";

/** Versioned payload for operation application.create. Contains no analytics or private scoring notes. */
export function toCommandCenterPayload(row: CrewApplicationRow) {
  const firstTouch = (row.attribution_json as { firstTouch?: unknown } | null)?.firstTouch ?? null;
  return {
    contract_version: CONTRACT_VERSION,
    source: "sanctuary-crew-public-site",
    submission_id: row.id,
    application: {
      id: row.id,
      person_id: row.person_id,
      opportunity_key: row.opportunity_key,
      pathway: row.pathway,
      first_name: row.first_name,
      last_name: row.last_name,
      email: row.email_normalized,
      phone: row.phone_normalized,
      city: row.city,
      state: row.state,
      role_interest: row.role_interest,
      instagram: row.instagram,
      tiktok: row.tiktok,
      other_social: row.other_social,
      network_types: row.network_types,
      availability: row.availability,
      evenings_available: row.evenings_available,
      weekends_available: row.weekends_available,
      travel_range: row.travel_range,
      relevant_experience: row.relevant_experience,
      scenario_response: row.scenario_response,
      portfolio_url: row.portfolio_url,
      promoter_invite_range: row.promoter_invite_range,
      promoter_experience: row.promoter_experience,
      promoter_experience_notes: row.promoter_experience_notes,
      host_interests: row.host_interests,
      motivation: row.motivation,
      referral_source: row.referral_source,
      local_status: row.application_status,
      legacy_status: row.legacy_status,
      status_flags: row.status_flags,
      marketing_consent: row.marketing_consent,
      marketing_consent_at: row.marketing_consent_at?.toISOString() ?? null,
      required_consent_at: row.required_consent_at.toISOString(),
      consent_version: row.consent_version,
      created_at: row.created_at.toISOString(),
    },
    recruitment_attribution: {
      referral_code_used: row.referral_code_used,
      referral_code_status: row.referral_code_status,
      campaign: row.campaign,
      event_id: row.event_id,
      qr_campaign: row.qr_campaign,
      utm_source: row.utm_source,
      utm_medium: row.utm_medium,
      utm_campaign: row.utm_campaign,
      utm_content: row.utm_content,
      utm_term: row.utm_term,
      referring_url: row.referring_url,
      landing_path: row.landing_path,
      entry_point: row.entry_point,
      first_touch: firstTouch,
    },
  };
}

async function request(path: string, init: RequestInit & { idempotencyKey?: string }) {
  const { commandCenter: cc } = getCrewConfig();
  const body = typeof init.body === "string" ? init.body : "";
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${cc.apiKey}`,
    "User-Agent": "sanctuary-crew/2.0",
    "X-Sanctuary-Contract": PROPOSED_CONTRACT_ID,
  };
  if (body) headers["Content-Type"] = "application/json";
  if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;
  if (cc.signingSecret && body) {
    const ts = Math.floor(Date.now() / 1000).toString();
    headers["X-Sanctuary-Timestamp"] = ts;
    headers["X-Sanctuary-Signature"] = "sha256=" + createHmac("sha256", cc.signingSecret).update(`${ts}.${body}`).digest("hex");
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cc.timeoutMs);
  try {
    return await fetch(`${cc.baseUrl}${path}`, { ...init, headers, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export type ErrorClass =
  | "network"
  | "timeout"
  | "server"
  | "rate_limited"
  | "rejected"
  | "auth"
  | "conflict"
  | "malformed"
  | "not_configured";

/** Retryable classes are re-attempted with backoff (same idempotency key). Others need a human. */
export const RETRYABLE: ReadonlySet<ErrorClass> = new Set(["network", "timeout", "server", "rate_limited", "malformed"]);

export type ForwardResult =
  | { ok: true; receiptId: string; canonicalId: string; replay: boolean }
  | { ok: false; errorClass: ErrorClass; error: string; retryAfterMs?: number };

const id = z.string().trim().min(1).max(200);

/** 200/201 body (proposed contract). */
const acceptedSchema = z.object({
  status: z.enum(["created", "replayed"]),
  submission_id: id,
  receipt_id: id,
  canonical_id: id,
  payload_hash: z.string().optional(),
});

/** 409 body for a verified idempotent replay (proposed contract). */
const replaySchema = z.object({
  error: z.literal("idempotent_replay"),
  submission_id: id,
  receipt_id: id,
  canonical_id: id,
  payload_hash: z.string().min(16),
});

function retryAfter(res: Response): number | undefined {
  const h = res.headers.get("retry-after");
  if (!h) return undefined;
  const n = Number(h);
  if (Number.isFinite(n)) return Math.min(Math.max(n, 0), 3600) * 1000;
  const d = Date.parse(h);
  return Number.isFinite(d) ? Math.min(Math.max(d - Date.now(), 0), 3_600_000) : undefined;
}

/**
 * Interpret a response for an operation. Exported for unit tests.
 * - 2xx: success ONLY with a body matching acceptedSchema whose submission_id equals ours.
 * - 409: success ONLY for {error:"idempotent_replay"} with matching submission_id AND payload_hash.
 *   Any other 409 (payload conflict, unrelated record) stays failed + visible.
 */
export async function interpretForwardResponse(res: Response, expected: { submissionId: string; payloadHash: string }): Promise<ForwardResult> {
  const text = await res.text().catch(() => "");
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (res.status === 200 || res.status === 201) {
    const p = acceptedSchema.safeParse(data);
    if (!p.success) return { ok: false, errorClass: "malformed", error: `HTTP ${res.status} without a valid receipt` };
    if (p.data.submission_id !== expected.submissionId)
      return { ok: false, errorClass: "malformed", error: "Receipt is for a different submission" };
    if (p.data.payload_hash && p.data.payload_hash !== expected.payloadHash)
      return { ok: false, errorClass: "conflict", error: "Receipt payload hash does not match" };
    return { ok: true, receiptId: p.data.receipt_id, canonicalId: p.data.canonical_id, replay: p.data.status === "replayed" };
  }
  if (res.status >= 200 && res.status < 300)
    return { ok: false, errorClass: "malformed", error: `Unexpected HTTP ${res.status} (no receipt)` };
  if (res.status === 409) {
    const p = replaySchema.safeParse(data);
    if (p.success && p.data.submission_id === expected.submissionId && p.data.payload_hash === expected.payloadHash)
      return { ok: true, receiptId: p.data.receipt_id, canonicalId: p.data.canonical_id, replay: true };
    return { ok: false, errorClass: "conflict", error: "HTTP 409 — not a verified idempotent replay of this submission" };
  }
  if (res.status === 401 || res.status === 403) return { ok: false, errorClass: "auth", error: `HTTP ${res.status}` };
  if (res.status === 429) return { ok: false, errorClass: "rate_limited", error: "HTTP 429", retryAfterMs: retryAfter(res) };
  if (res.status === 408) return { ok: false, errorClass: "timeout", error: "HTTP 408" };
  if (res.status >= 500) return { ok: false, errorClass: "server", error: `HTTP ${res.status}`, retryAfterMs: retryAfter(res) };
  return { ok: false, errorClass: "rejected", error: `HTTP ${res.status}` };
}

/** Send one outbox operation. The idempotency key is stable for the life of the operation. */
export async function sendOperation(op: {
  operation: string;
  idempotencyKey: string;
  submissionId: string;
  payload: Record<string, unknown>;
  payloadHash: string;
}): Promise<ForwardResult> {
  const { commandCenter: cc } = getCrewConfig();
  const path = op.operation === "application.create" ? cc.applicationsPath : cc.statusPath;
  if (!cc.canForward || !path) return { ok: false, errorClass: "not_configured", error: "Command Center not configured" };
  try {
    const res = await request(path.replace("{id}", encodeURIComponent(op.submissionId)), {
      method: "POST",
      body: JSON.stringify({ ...op.payload, operation: op.operation, payload_hash: op.payloadHash }),
      idempotencyKey: op.idempotencyKey,
    });
    return await interpretForwardResponse(res, { submissionId: op.submissionId, payloadHash: op.payloadHash });
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    return name === "AbortError" || name === "TimeoutError"
      ? { ok: false, errorClass: "timeout", error: "Request timed out" }
      : { ok: false, errorClass: "network", error: "Network error" };
  }
}

export type ReferralLookup = "valid" | "invalid" | "unverified";

const referralSchema = z.object({
  code: z.string().min(1).max(60),
  status: z.enum(["active", "inactive", "revoked"]),
});
const referralNotFound = z.object({ error: z.literal("referral_not_found") });

/** Exported for unit tests. Generic 2xx bodies are NOT proof of validity. */
export async function interpretReferralResponse(res: Response, code: string): Promise<ReferralLookup> {
  const data = await res.json().catch(() => null);
  if (res.status === 200) {
    const p = referralSchema.safeParse(data);
    if (!p.success || p.data.code.toUpperCase() !== code.toUpperCase()) return "unverified";
    return p.data.status === "active" ? "valid" : "invalid";
  }
  if (res.status === 404) return referralNotFound.safeParse(data).success ? "invalid" : "unverified";
  return "unverified";
}

export async function lookupReferralCode(code: string): Promise<ReferralLookup> {
  const { commandCenter: cc } = getCrewConfig();
  if (!cc.canLookupReferrals || !cc.referralPath) return "unverified";
  const enc = encodeURIComponent(code);
  const path = cc.referralPath.includes("{code}") ? cc.referralPath.replace("{code}", enc) : `${cc.referralPath.replace(/\/+$/, "")}/${enc}`;
  try {
    return await interpretReferralResponse(await request(path, { method: "GET" }), code);
  } catch {
    return "unverified";
  }
}

/**
 * Analytics sanitization. Only allowlisted property names (contract.ANALYTICS_PROPS)
 * survive, each coerced to its declared kind. Free text, emails, phones and URLs
 * with query strings are never stored.
 */
import { ANALYTICS_PROPS } from "./contract";
import { CODE_RE } from "./codes";

type Out = Record<string, string | number | boolean>;

const UTM_RE = /^[a-z0-9._-]{1,40}$/i;

export function sanitizeAnalyticsProps(input: Record<string, unknown> | undefined | null): Out {
  const out: Out = {};
  if (!input) return out;
  for (const [k, raw] of Object.entries(input)) {
    const spec = ANALYTICS_PROPS[k];
    if (!spec) continue;
    switch (spec.kind) {
      case "enum":
        if (typeof raw === "string" && spec.values.includes(raw)) out[k] = raw;
        break;
      case "bool":
        if (typeof raw === "boolean") out[k] = raw;
        break;
      case "int":
        if (typeof raw === "number" && Number.isInteger(raw) && raw >= 0 && raw <= spec.max) out[k] = raw;
        break;
      case "code":
        if (typeof raw === "string" && raw === "") out[k] = "";
        else if (typeof raw === "string" && CODE_RE.test(raw)) out[k] = raw.toUpperCase();
        break;
      case "utm":
        if (typeof raw === "string" && (raw === "none" || UTM_RE.test(raw))) out[k] = raw.toLowerCase();
        break;
      case "path": {
        if (typeof raw !== "string") break;
        const p = raw.split(/[?#]/)[0]!;
        // Only first-party route shapes; referral code segment kept only if code-shaped.
        if (/^\/(crew(\/(apply|portal))?|serve|r\/[A-Za-z0-9_-]{1,40})?$/.test(p)) out[k] = p.slice(0, 60);
        break;
      }
    }
  }
  return out;
}

const ATTR_CODE_KEYS = new Set(["referralCode", "campaign", "eventId", "qrCampaign"]);
const ATTR_UTM_KEYS = new Set(["utmSource", "utmMedium", "utmCampaign", "utmContent", "utmTerm"]);
const UTM_ALIASES: Record<string, string> = { utm_source: "utmSource", utm_medium: "utmMedium", utm_campaign: "utmCampaign", utm_content: "utmContent", utm_term: "utmTerm" };

/** Origin + path only (drops query/fragment, which may carry tokens or PII). */
export function safeUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return `${u.origin}${u.pathname}`.slice(0, 300);
  } catch {
    return null;
  }
}

export const safePath = (raw: unknown): string | null =>
  typeof raw === "string" && raw.startsWith("/") ? raw.split(/[?#]/)[0]!.slice(0, 200) : null;

/**
 * Sanitize a first-touch attribution record (client-supplied or legacy-stored).
 * Returns the cleaned record plus the names of keys that were changed/dropped
 * (for the audit trail — never the dropped values).
 */
export function sanitizeFirstTouch(raw: unknown): { value: Record<string, string> | null; changed: string[] } {
  if (!raw || typeof raw !== "object") return { value: null, changed: [] };
  const out: Record<string, string> = {};
  const changed: string[] = [];
  for (const [rawKey, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v !== "string" || !v) continue;
    // snake_case UTM aliases (seen in hand-built/legacy payloads) are kept under the camelCase key
    const k = UTM_ALIASES[rawKey] ?? rawKey;
    if (k !== rawKey) changed.push(rawKey);
    let clean: string | null = null;
    if (ATTR_CODE_KEYS.has(k)) clean = CODE_RE.test(v) ? v.toUpperCase() : null;
    else if (ATTR_UTM_KEYS.has(k)) clean = v.replace(/[<>"'`]/g, "").slice(0, 120);
    else if (k === "referringUrl") clean = safeUrl(v);
    else if (k === "landingPath") clean = safePath(v);
    else if (k === "capturedAt") clean = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z?$/.test(v) ? v : null;
    else if (k === "entryPoint") clean = /^[a-z_]{1,40}$/.test(v) ? v : null;
    if (clean === null) changed.push(k);
    else {
      if (clean !== v) changed.push(k);
      out[k] = clean;
    }
  }
  return { value: Object.keys(out).length ? out : null, changed };
}

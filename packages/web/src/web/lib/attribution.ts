/**
 * Attribution capture. Runs once, synchronously, at app boot — BEFORE the
 * router renders or redirects — so query parameters are never discarded.
 *
 * - Last touch: stored in sessionStorage, refreshed whenever a new URL
 *   carries attribution parameters. This is what gets sent with the
 *   application as the primary attribution.
 * - First touch: stored in localStorage once (30-day expiry) and sent as
 *   `firstTouch` so the Command Center can apply either model.
 * - Short referral links: /r/:code is treated like ?ref=:code.
 *
 * Only whitelisted keys are kept, values are length-limited, and nothing
 * here is personally identifying.
 */
import type { AttributionInput } from "../../api/crew/contract";
import { CODE_RE } from "../../api/crew/codes";

const LAST_KEY = "sx_attr_last";
const FIRST_KEY = "sx_attr_first";
const SESSION_KEY = "sx_session";
const FIRST_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** URL param → attribution field. Aliases let printed QR codes stay short. */
const PARAM_MAP: Record<string, keyof Attribution> = {
  ref: "referralCode",
  referral: "referralCode",
  promoter: "referralCode",
  campaign: "campaign",
  c: "campaign",
  event: "eventId",
  event_id: "eventId",
  qr: "qrCampaign",
  utm_source: "utmSource",
  utm_medium: "utmMedium",
  utm_campaign: "utmCampaign",
  utm_content: "utmContent",
  utm_term: "utmTerm",
};

const CODE_FIELDS = new Set<keyof Attribution>(["referralCode", "campaign", "eventId", "qrCampaign"]);

export type Attribution = {
  referralCode?: string;
  campaign?: string;
  eventId?: string;
  qrCampaign?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  referringUrl?: string;
  landingPath?: string;
  capturedAt?: string;
};

export type CaptureResult = {
  attribution: Attribution;
  /** True when this page load carried a referral code. */
  isReferralVisit: boolean;
  /** True when this page load came from a QR code (qr= or utm_medium=qr). */
  isQrVisit: boolean;
};

const safeStorage = (kind: "local" | "session") => {
  try {
    const s = kind === "local" ? window.localStorage : window.sessionStorage;
    const k = "__sx_t";
    s.setItem(k, "1");
    s.removeItem(k);
    return s;
  } catch {
    return null;
  }
};

function readJSON<T>(s: Storage | null, key: string): T | null {
  if (!s) return null;
  try {
    const raw = s.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function cleanValue(field: keyof Attribution, raw: string): string | undefined {
  const v = raw.trim().slice(0, 120);
  if (!v) return undefined;
  if (CODE_FIELDS.has(field)) return CODE_RE.test(v) ? v.toUpperCase() : undefined;
  return v.replace(/[<>"'`]/g, "");
}

function externalReferrer(): string | undefined {
  if (!document.referrer) return undefined;
  try {
    const r = new URL(document.referrer);
    if (r.host === window.location.host) return undefined;
    return `${r.origin}${r.pathname}`.slice(0, 300);
  } catch {
    return undefined;
  }
}

let captured: CaptureResult | null = null;

export function captureAttribution(): CaptureResult {
  if (captured) return captured;
  const url = new URL(window.location.href);
  const fromUrl: Attribution = {};

  for (const [param, field] of Object.entries(PARAM_MAP)) {
    const raw = url.searchParams.get(param);
    if (raw && !fromUrl[field]) {
      const v = cleanValue(field, raw);
      if (v) fromUrl[field] = v;
    }
  }
  const short = url.pathname.match(/^\/r\/([^/?#]+)/i);
  if (short && !fromUrl.referralCode) {
    const v = cleanValue("referralCode", decodeURIComponent(short[1]!));
    if (v) fromUrl.referralCode = v;
  }

  const ref = externalReferrer();
  const hasNew = Object.keys(fromUrl).length > 0;
  const session = safeStorage("session");
  const local = safeStorage("local");
  const prevLast = readJSON<Attribution>(session, LAST_KEY);

  let last: Attribution;
  if (hasNew) {
    last = {
      ...fromUrl,
      referringUrl: ref ?? prevLast?.referringUrl,
      landingPath: url.pathname,
      capturedAt: new Date().toISOString(),
    };
  } else if (prevLast) {
    last = prevLast;
  } else {
    last = { referringUrl: ref, landingPath: url.pathname, capturedAt: new Date().toISOString() };
  }
  session?.setItem(LAST_KEY, JSON.stringify(last));

  const first = readJSON<Attribution & { expiresAt?: number }>(local, FIRST_KEY);
  if (!first || (first.expiresAt ?? 0) < Date.now()) {
    local?.setItem(FIRST_KEY, JSON.stringify({ ...last, expiresAt: Date.now() + FIRST_TTL_MS }));
  }

  captured = {
    attribution: last,
    isReferralVisit: Boolean(fromUrl.referralCode),
    isQrVisit: Boolean(fromUrl.qrCampaign) || fromUrl.utmMedium?.toLowerCase() === "qr",
  };
  return captured;
}

export function getAttributionPayload(entryPoint?: string): NonNullable<AttributionInput> {
  const { attribution: a } = captureAttribution();
  const first = readJSON<Attribution & { expiresAt?: number }>(safeStorage("local"), FIRST_KEY);
  const firstTouch: Record<string, string> = {};
  if (first) {
    for (const [k, v] of Object.entries(first)) {
      if (k !== "expiresAt" && typeof v === "string" && v) firstTouch[k] = v.slice(0, 300);
    }
  }
  return {
    referralCode: a.referralCode ?? null,
    campaign: a.campaign ?? null,
    eventId: a.eventId ?? null,
    qrCampaign: a.qrCampaign ?? null,
    utmSource: a.utmSource ?? null,
    utmMedium: a.utmMedium ?? null,
    utmCampaign: a.utmCampaign ?? null,
    utmContent: a.utmContent ?? null,
    utmTerm: a.utmTerm ?? null,
    referringUrl: a.referringUrl ?? null,
    landingPath: a.landingPath ?? null,
    capturedAt: a.capturedAt ?? null,
    entryPoint: entryPoint ?? null,
    firstTouch: Object.keys(firstTouch).length ? firstTouch : null,
  };
}

/** Random, non-identifying id that scopes analytics to one browser session. */
export function getSessionId(): string {
  const s = safeStorage("session");
  let id = s?.getItem(SESSION_KEY);
  if (!id) {
    id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
    s?.setItem(SESSION_KEY, id);
  }
  return id;
}

/** Query string that preserves attribution when linking within the site. */
export function attributionQuery(): string {
  const { attribution: a } = captureAttribution();
  const p = new URLSearchParams();
  if (a.referralCode) p.set("ref", a.referralCode);
  if (a.eventId) p.set("event", a.eventId);
  if (a.campaign) p.set("campaign", a.campaign);
  return p.toString();
}

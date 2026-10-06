import { describe, expect, test } from "bun:test";
import { interpretForwardResponse, interpretReferralResponse } from "../src/api/crew/command-center";
import { sanitizeFirstTouch, sanitizeAnalyticsProps } from "../src/api/crew/analytics";
import { csvCell, toCsv } from "../src/web/lib/csv";
import { applicationSchema, CONSENT_VERSION } from "../src/api/crew/contract";

const expected = { submissionId: "submission-test", payloadHash: "1234567890abcdef" };
const accepted = { status: "created", submission_id: expected.submissionId, payload_hash: expected.payloadHash, receipt_id: "receipt-test", canonical_id: "canonical-test" };
const response = (body: unknown, status = 200, headers?: HeadersInit) => new Response(JSON.stringify(body), { status, headers });

describe("proposed Command Center receipt contract (not a live connection)", () => {
  test("201 returns canonical receipt", async () => {
    expect(await interpretForwardResponse(response(accepted, 201), expected)).toEqual({ ok: true, canonicalId: "canonical-test", receiptId: "receipt-test", replay: false });
  });
  for (const [label, body] of [["empty", {}], ["unrelated submission", { ...accepted, submission_id: "someone-else" }], ["missing canonical ID", { ...accepted, canonical_id: "" }]] as const) {
    test(`2xx ${label} is not synchronized`, async () => {
      expect((await interpretForwardResponse(response(body), expected)).ok).toBe(false);
    });
  }
  test("malformed JSON and 204 do not synchronize", async () => {
    expect((await interpretForwardResponse(new Response("not json"), expected)).ok).toBe(false);
    expect((await interpretForwardResponse(new Response(null, { status: 204 }), expected)).ok).toBe(false);
  });
  test("unrelated 409 and mismatched replay hash fail", async () => {
    expect(await interpretForwardResponse(response({ error: "conflict" }, 409), expected)).toMatchObject({ ok: false, errorClass: "conflict" });
    expect((await interpretForwardResponse(response({ ...accepted, error: "idempotent_replay", payload_hash: "different-hash-012345" }, 409), expected)).ok).toBe(false);
  });
  test("verified idempotent 409 succeeds", async () => {
    expect(await interpretForwardResponse(response({ ...accepted, error: "idempotent_replay" }, 409), expected)).toMatchObject({ ok: true, replay: true });
  });
  test("429 retry-after bounded to an hour; auth never retryable", async () => {
    expect(await interpretForwardResponse(response({}, 429, { "retry-after": "99999" }), expected)).toMatchObject({ ok: false, errorClass: "rate_limited", retryAfterMs: 3600000 });
    expect(await interpretForwardResponse(response({}, 401), expected)).toMatchObject({ ok: false, errorClass: "auth" });
  });
});

describe("referral tri-state", () => {
  test("explicit matching active -> valid; revoked -> invalid", async () => {
    expect(await interpretReferralResponse(response({ code: "TEST", status: "active" }), "test")).toBe("valid");
    expect(await interpretReferralResponse(response({ code: "TEST", status: "revoked" }), "TEST")).toBe("invalid");
  });
  test("generic/mismatched 200 and generic 404 remain unverified", async () => {
    for (const body of [{}, { valid: true }, { code: "OTHER", status: "active" }]) expect(await interpretReferralResponse(response(body), "TEST")).toBe("unverified");
    expect(await interpretReferralResponse(response({}, 404), "TEST")).toBe("unverified");
    expect(await interpretReferralResponse(response({ error: "referral_not_found" }, 404), "TEST")).toBe("invalid");
  });
});

describe("CSV and privacy sanitization", () => {
  test("formula payloads neutralized; pure E.164 preserved", () => {
    for (const s of ["=1+1", "+HYPERLINK(foo)", "-cmd", "@SUM(A1)", "\t=1", "\r=1", "+1 702 555", "+1234567890123456"]) expect(csvCell(s)).toContain("'");
    expect(csvCell("+17025551234")).toBe("+17025551234");
    expect(csvCell('say "hello", please')).toBe('"say ""hello"", please"');
    expect(toCsv([{ n: null }], [["Value", (r) => r.n]])).toBe("Value\r\n");
  });
  test("first touch drops private keys and URL secrets, retains UTM provenance", () => {
    const r = sanitizeFirstTouch({ utm_campaign: "build-night", referringUrl: "https://example.com/path?token=secret#private", landingPath: "/crew?email=private", email: "private@example.com", referralCode: "test" });
    expect(r.value).toEqual({ utmCampaign: "build-night", referringUrl: "https://example.com/path", landingPath: "/crew", referralCode: "TEST" });
    expect(r.changed).toContain("email");
  });
  test("analytics removes arbitrary PII and strips query strings", () => {
    const r = sanitizeAnalyticsProps({ email: "private@example.com", phone: "+17025551234", secret: "secret", path: "/crew/apply?token=secret" });
    expect(Object.keys(r)).not.toContain("email");
    expect(JSON.stringify(r)).not.toContain("secret");
  });
});
describe("full application schema matches what the public form sends", () => {
  // The form starts from EMPTY_FORM, so role-irrelevant arrays arrive as [] (never omitted).
  const form = (role: string, extra: Record<string, unknown> = {}) => ({
    firstName: "Vee", lastName: "Fixture", email: "vee.fixture@example.com", phone: "(702) 555-2100",
    city: "Las Vegas", state: "NV", roleInterest: role, instagram: "@vee.qa", tiktok: "", otherSocial: "",
    networkTypes: ["friends"], promoterExperienceNotes: "", hostInterests: [], availability: "occasionally",
    eveningsAvailable: true, weekendsAvailable: true, travelRange: "las_vegas_valley",
    relevantExperience: "Front desk two years.", scenarioResponse: "Stay calm, check, escalate.", portfolioUrl: "",
    motivation: "I want to help build a welcoming room.", referralSource: "friend", requiredConsent: true,
    marketingConsent: false, website: "", startedAt: Date.now() - 60_000, consentVersion: CONSENT_VERSION, attribution: {},
    ...extra,
  });
  const promoterBlock = { promoterInviteRange: "11_25", promoterExperience: false };

  for (const role of ["promoter", "promoter_manager"]) {
    test(`${role} with hostInterests: [] is accepted (regression: promoters could not submit)`, () => {
      const r = applicationSchema.safeParse(form(role, promoterBlock));
      expect(r.success ? [] : r.error.issues.map((i) => i.path.join("."))).toEqual([]);
    });
  }
  for (const role of ["host", "both", "guest_experience_lead"]) {
    test(`${role} still requires at least one host area`, () => {
      const r = applicationSchema.safeParse(form(role, promoterBlock));
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues.map((i) => i.path[0])).toContain("hostInterests");
      expect(applicationSchema.safeParse(form(role, { ...promoterBlock, hostInterests: ["check_in"] })).success).toBe(true);
    });
  }
  test("promoter roles still require the promoter block", () => {
    const r = applicationSchema.safeParse(form("promoter"));
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.map((i) => i.path[0])).toEqual(expect.arrayContaining(["promoterInviteRange", "promoterExperience"]));
  });
});

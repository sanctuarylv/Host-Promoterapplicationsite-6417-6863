import { describe, expect, test } from "bun:test";
import { interpretForwardResponse, interpretReferralResponse } from "../src/api/crew/command-center";
import { sanitizeFirstTouch, sanitizeAnalyticsProps } from "../src/api/crew/analytics";
import { csvCell, toCsv } from "../src/web/lib/csv";

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
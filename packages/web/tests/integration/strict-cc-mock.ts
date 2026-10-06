/**
 * STRICT local mock of the PROPOSED Command Center crew contract
 * (docs/COMMAND_CENTER_CONTRACT_V2.md). Test-only. It is NOT the real
 * Command Center and passing against it proves only that this app honours
 * the proposed contract — not that any real service is connected.
 *
 * Unlike the old generic mock it:
 * - requires Bearer auth, the contract header, an Idempotency-Key and (when a
 *   secret is set) a valid HMAC over `${timestamp}.${body}`;
 * - recomputes the payload hash and rejects mismatches;
 * - keeps an idempotency ledger: same key + same hash → 409 idempotent_replay
 *   with the ORIGINAL receipt; same key + different hash → 409 idempotency_conflict;
 * - can be scripted to return failures, obsolete bodies, or slow responses.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/** Independent re-implementation (sorted keys) — deliberately not imported from app code. */
function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(v ?? null);
}

export type Scripted = { status: number; body?: unknown; delayMs?: number; headers?: Record<string, string> };
type Ledger = { hash: string; receipt: string; canonical: string; submission: string };

export function startStrictMock(opts: { apiKey: string; signingSecret?: string; contractId: string }) {
  const ledger = new Map<string, Ledger>();
  const script: Scripted[] = [];
  const seen: { path: string; idem: string | null; hash: string | null; verdict: string }[] = [];
  let n = 0;

  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      const body = await req.text();
      const idem = req.headers.get("idempotency-key");
      const record = (verdict: string, hash: string | null = null) => seen.push({ path: url.pathname, idem, hash, verdict });

      const next = script.shift();
      if (next) {
        if (next.delayMs) await Bun.sleep(next.delayMs);
        record(`scripted_${next.status}`);
        return new Response(next.body === undefined ? "" : JSON.stringify(next.body), {
          status: next.status,
          headers: { "content-type": "application/json", ...next.headers },
        });
      }

      if (req.headers.get("authorization") !== `Bearer ${opts.apiKey}`) return (record("auth"), Response.json({ error: "unauthorized" }, { status: 401 }));
      if (req.headers.get("x-sanctuary-contract") !== opts.contractId) return (record("contract"), Response.json({ error: "unknown_contract" }, { status: 400 }));
      if (req.method !== "POST" || !idem) return (record("shape"), Response.json({ error: "idempotency_key_required" }, { status: 400 }));
      if (opts.signingSecret) {
        const ts = req.headers.get("x-sanctuary-timestamp") ?? "";
        const sig = req.headers.get("x-sanctuary-signature") ?? "";
        const want = "sha256=" + createHmac("sha256", opts.signingSecret).update(`${ts}.${body}`).digest("hex");
        const ok = sig.length === want.length && timingSafeEqual(Buffer.from(sig), Buffer.from(want));
        if (!ok || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return (record("signature"), Response.json({ error: "bad_signature" }, { status: 401 }));
      }
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(body);
      } catch {
        return (record("json"), Response.json({ error: "invalid_json" }, { status: 400 }));
      }
      const { operation: _op, payload_hash: claimed, ...payload } = parsed;
      const hash = createHash("sha256").update(stableStringify(payload)).digest("hex");
      if (claimed !== hash) return (record("hash", hash), Response.json({ error: "payload_hash_mismatch" }, { status: 422 }));
      const submission = String(payload.submission_id ?? "");
      const prior = ledger.get(idem);
      if (prior) {
        if (prior.hash !== hash) return (record("idem_conflict", hash), Response.json({ error: "idempotency_conflict", submission_id: submission }, { status: 409 }));
        record("replay", hash);
        return Response.json(
          { error: "idempotent_replay", submission_id: prior.submission, receipt_id: prior.receipt, canonical_id: prior.canonical, payload_hash: prior.hash },
          { status: 409 },
        );
      }
      n += 1;
      const entry = { hash, receipt: `rcpt_${n}`, canonical: `cc_app_${n}`, submission };
      ledger.set(idem, entry);
      record("created", hash);
      return Response.json(
        { status: "created", submission_id: submission, receipt_id: entry.receipt, canonical_id: entry.canonical, payload_hash: hash },
        { status: 201 },
      );
    },
  });
  return {
    url: `http://127.0.0.1:${server.port}`,
    ledger,
    script,
    seen,
    stop: () => server.stop(true),
  };
}

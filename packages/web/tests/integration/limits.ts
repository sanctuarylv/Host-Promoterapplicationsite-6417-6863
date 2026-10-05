/**
 * Rate-limit / proxy-trust suite — in-process, FRESH disposable DB.
 *
 *   cd packages/web && env -u DATABASE_URL -u DATABASE_AUTH_TOKEN bun tests/integration/limits.ts
 *
 * Proves: client identity is taken ONLY from the configured trusted header
 * (spoofed X-Forwarded-For is ignored in "none"; xff:N takes the N-th hop from
 * the right), malformed values fall back to the untrusted bucket, the shared DB
 * counter is exact under concurrency, windows reset, and per-account limits
 * hold regardless of headers. It does NOT prove what the Runable edge sends —
 * that header contract is externally unverified (see docs/RUNBOOK_V2.md).
 */
const H = await import("./harness");
const { client, signUp, cleanup, rpc } = H;
const { clientIdentity, rateLimit } = await import("../../src/api/crew/rate-limit");
const { recorder } = await import("../e2e/helpers");
const { check, report } = recorder();

const hdr = (h: Record<string, string>) => new Headers(h);
const withMode = <T>(mode: string, fn: () => T): T => {
  const prev = process.env.CREW_TRUSTED_PROXY;
  process.env.CREW_TRUSTED_PROXY = mode;
  try {
    return fn();
  } finally {
    process.env.CREW_TRUSTED_PROXY = prev;
  }
};

try {
  // ---- identity derivation
  check("none: spoofed XFF ignored", withMode("none", () => clientIdentity(hdr({ "x-forwarded-for": "1.2.3.4" })).key), "untrusted");
  check("none: spoofed cf-connecting-ip ignored", withMode("none", () => clientIdentity(hdr({ "cf-connecting-ip": "1.2.3.4" })).key), "untrusted");
  check("none: x-real-ip ignored", withMode("none", () => clientIdentity(hdr({ "x-real-ip": "1.2.3.4" })).key), "untrusted");
  check("unset mode behaves as none", withMode("", () => clientIdentity(hdr({ "x-forwarded-for": "1.2.3.4" })).key), "untrusted");
  check("cloudflare: uses cf-connecting-ip", withMode("cloudflare", () => clientIdentity(hdr({ "cf-connecting-ip": "203.0.113.9", "x-forwarded-for": "6.6.6.6" })).key), "ip:203.0.113.9");
  check("cloudflare: XFF alone not trusted", withMode("cloudflare", () => clientIdentity(hdr({ "x-forwarded-for": "6.6.6.6" })).key), "untrusted");
  check("x-real-ip: uses x-real-ip", withMode("x-real-ip", () => clientIdentity(hdr({ "x-real-ip": "198.51.100.7" })).key), "ip:198.51.100.7");
  check("xff:1: right-most hop (client cannot prepend)", withMode("xff:1", () => clientIdentity(hdr({ "x-forwarded-for": "6.6.6.6, 198.51.100.20" })).key), "ip:198.51.100.20");
  check("xff:2: second hop from right", withMode("xff:2", () => clientIdentity(hdr({ "x-forwarded-for": "6.6.6.6, 198.51.100.21, 10.0.0.2" })).key), "ip:198.51.100.21");
  check("xff:2 with too few hops -> untrusted", withMode("xff:2", () => clientIdentity(hdr({ "x-forwarded-for": "198.51.100.21" })).key), "untrusted");
  check("xff:1 missing header -> untrusted", withMode("xff:1", () => clientIdentity(hdr({})).key), "untrusted");
  check("malformed value -> untrusted", withMode("cloudflare", () => clientIdentity(hdr({ "cf-connecting-ip": "1.2.3.4; drop" })).key), "untrusted");
  check("colon soup (not an IP) -> untrusted", withMode("cloudflare", () => clientIdentity(hdr({ "cf-connecting-ip": "::::::::::" })).key), "untrusted");
  check("IPv6 accepted + lower-cased", withMode("cloudflare", () => clientIdentity(hdr({ "cf-connecting-ip": "2001:DB8::1" })).key), "ip:2001:db8::1");

  // ---- shared counter correctness
  const N = 50;
  const LIMIT = 20;
  const burst = await Promise.all(Array.from({ length: N }, () => rateLimit("it:burst", LIMIT, 60_000)));
  check(`${N} concurrent hits, limit ${LIMIT}: exactly ${LIMIT} allowed`, burst.filter((r) => r.ok).length, LIMIT);
  check("counts are unique 1..N (atomic UPSERT)", new Set(burst.map((r) => r.count)).size, N);
  check("blocked hits report retry-after", burst.filter((r) => !r.ok).every((r) => r.retryAfterMs > 0), true);
  for (let i = 0; i < 3; i++) await rateLimit("it:window", 2, 300);
  check("over limit inside window", (await rateLimit("it:window", 2, 300)).ok, false);
  await new Promise((r) => setTimeout(r, 350));
  const reset = await rateLimit("it:window", 2, 300);
  check("window resets after expiry", `${reset.ok}/${reset.count}`, "true/1");

  // ---- per-account limit on link-code redemption ignores headers
  const acct = await signUp("redeemer");
  const outcomes: string[] = [];
  for (let i = 0; i < 11; i++) {
    const c = client(acct.token, { "x-forwarded-for": `10.0.0.${i}`, "cf-connecting-ip": `10.1.0.${i}` });
    outcomes.push(await H.outcome(c.me.redeemLink({ code: `SX-not-real-${i}` })));
  }
  check("10 bad link codes -> BAD_REQUEST", outcomes.slice(0, 10).every((o) => o === "BAD_REQUEST"), true);
  check("11th attempt (rotating spoofed IPs) -> TOO_MANY_REQUESTS", outcomes[10], "TOO_MANY_REQUESTS");

  // ---- public submit: untrusted callers share one bucket regardless of spoofed headers
  const { applicationPayload } = await import("./pipeline");
  const codes: number[] = [];
  for (let i = 0; i < 61; i++) codes.push((await rpc("crew/submit", applicationPayload(`flood${i}@example.com`, "host"), undefined, { "x-forwarded-for": `172.16.0.${i}` })).status);
  check("60 submits from 'different' spoofed IPs accepted (shared ceiling)", codes.slice(0, 60).every((c) => c === 200), true);
  check("61st -> 429 (spoofing does not mint new buckets)", codes[60], 429);
} catch (e) {
  console.error("SUITE ERROR", e);
  process.exitCode = 1;
} finally {
  report("rate-limit / proxy-trust integration");
  cleanup();
}
process.exit(process.exitCode ?? 0);

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { CANONICAL_ORIGIN, assertProductionSecrets, isCanonicalDeployment, originOf, readinessReport, ticketingFixturesEnabled, trustedOriginList } from "../src/api/crew/production";
import { clientIdentity } from "../src/api/crew/rate-limit";

const KEYS = ["WEBSITE_URL", "VITE_SANCTUARY_PUBLIC_URL", "CREW_EXTRA_TRUSTED_ORIGINS", "CREW_TICKETING_FIXTURES", "NODE_ENV", "BETTER_AUTH_SECRET", "CREW_TRUSTED_PROXY", "PORT"] as const;
let saved: Record<string, string | undefined> = {};
beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("canonical production domain", () => {
  test("is https://crew.sanctuarylv.org", () => expect(CANONICAL_ORIGIN).toBe("https://crew.sanctuarylv.org"));
  test("originOf strips paths and rejects non-http", () => {
    expect(originOf("https://crew.sanctuarylv.org/")).toBe(CANONICAL_ORIGIN);
    expect(originOf("https://crew.sanctuarylv.org/crew?x=1")).toBe(CANONICAL_ORIGIN);
    expect(originOf("javascript:alert(1)")).toBeNull();
    expect(originOf("not a url")).toBeNull();
  });
  test("WEBSITE_URL with trailing slash still counts as canonical", () => {
    process.env.WEBSITE_URL = "https://crew.sanctuarylv.org/";
    expect(isCanonicalDeployment()).toBe(true);
  });
});

describe("trusted origins (explicit allow-list, never reflected)", () => {
  test("production: canonical + WEBSITE_URL only, no localhost", () => {
    process.env.WEBSITE_URL = "https://crew.sanctuarylv.org";
    const l = trustedOriginList();
    expect(l).toContain(CANONICAL_ORIGIN);
    expect(l.some((o) => o.includes("localhost") || o.includes("127.0.0.1"))).toBe(false);
    expect(l).not.toContain("https://evil.example");
  });
  test("preview: canonical + preview origin + localhost dev", () => {
    process.env.WEBSITE_URL = "https://sanctua-preview-4200.runable.site/";
    const l = trustedOriginList();
    expect(l).toEqual(expect.arrayContaining([CANONICAL_ORIGIN, "https://sanctua-preview-4200.runable.site", "http://localhost:4200"]));
  });
  test("extra origins: exact origins only, wildcards dropped", () => {
    process.env.WEBSITE_URL = CANONICAL_ORIGIN;
    process.env.CREW_EXTRA_TRUSTED_ORIGINS = "https://staging.sanctuarylv.org/path, https://*.example.com, nonsense";
    const l = trustedOriginList();
    expect(l).toContain("https://staging.sanctuarylv.org");
    expect(l.some((o) => o.includes("example.com"))).toBe(false);
    expect(l).toHaveLength(2);
  });
});

describe("ticketing fixtures", () => {
  test("off by default on the canonical deployment", () => {
    process.env.WEBSITE_URL = CANONICAL_ORIGIN;
    expect(ticketingFixturesEnabled()).toBe(false);
  });
  test("on by default elsewhere; explicit override wins", () => {
    process.env.WEBSITE_URL = "http://localhost:4200";
    expect(ticketingFixturesEnabled()).toBe(true);
    process.env.CREW_TICKETING_FIXTURES = "disabled";
    expect(ticketingFixturesEnabled()).toBe(false);
    process.env.WEBSITE_URL = CANONICAL_ORIGIN;
    process.env.CREW_TICKETING_FIXTURES = "enabled";
    expect(ticketingFixturesEnabled()).toBe(true);
  });
});

describe("production secret guard", () => {
  test("canonical deployment without a secret fails closed", () => {
    process.env.WEBSITE_URL = CANONICAL_ORIGIN;
    expect(() => assertProductionSecrets()).toThrow(/BETTER_AUTH_SECRET/);
    process.env.BETTER_AUTH_SECRET = "short";
    expect(() => assertProductionSecrets()).toThrow();
    process.env.BETTER_AUTH_SECRET = "x".repeat(32);
    expect(() => assertProductionSecrets()).not.toThrow();
  });
  test("NODE_ENV=production also requires it; local dev does not", () => {
    process.env.WEBSITE_URL = "http://localhost:4200";
    expect(() => assertProductionSecrets()).not.toThrow();
    process.env.NODE_ENV = "production";
    expect(() => assertProductionSecrets()).toThrow();
  });
});

describe("readiness report", () => {
  test("never contains secret values or IPs; reports header presence only", () => {
    process.env.WEBSITE_URL = CANONICAL_ORIGIN;
    process.env.BETTER_AUTH_SECRET = "s3cr3t-value-that-must-not-leak-0123456789";
    const r = readinessReport(new Headers({ "cf-connecting-ip": "203.0.113.9", "x-real-ip": "203.0.113.9" }));
    const json = JSON.stringify(r);
    expect(json).not.toContain("s3cr3t-value");
    expect(json).not.toContain("203.0.113.9");
    expect(json).toContain("cf-connecting-ip, x-real-ip");
    const by = Object.fromEntries(r.checks.map((c) => [c.key, c.state]));
    expect(by.website_url).toBe("pass");
    expect(by.auth_secret).toBe("pass");
    expect(by.command_center).toBe("blocked_external");
    expect(by.trusted_proxy).toBe("blocked_external");
    expect(by.ticketing).toBe("blocked_external");
    expect(by.workbook).toBe("blocked_user");
    expect(by.node_env).toBe("blocked_user");
  });
  test("Command Center is never reported as connected", () => {
    const r = readinessReport();
    const cc = r.checks.find((c) => c.key === "command_center")!;
    expect(cc.state).not.toBe("pass");
    expect(cc.detail).toContain("Saved locally — Command Center connection pending");
  });
});

describe("client IP trust (rate limiting)", () => {
  const h = (o: Record<string, string>) => new Headers(o);
  test("default none: no header trusted, even with every header present", () => {
    expect(clientIdentity(h({ "cf-connecting-ip": "1.2.3.4", "x-real-ip": "1.2.3.4", "x-forwarded-for": "1.2.3.4" })).trusted).toBe(false);
  });
  test("x-real-ip mode ignores X-Forwarded-For and True-Client-IP", () => {
    process.env.CREW_TRUSTED_PROXY = "x-real-ip";
    expect(clientIdentity(h({ "x-forwarded-for": "6.6.6.6", "true-client-ip": "9.9.9.9" })).trusted).toBe(false);
    expect(clientIdentity(h({ "x-real-ip": "34.83.245.209" })).key).toBe("ip:34.83.245.209");
  });
  test("cloudflare mode trusts only cf-connecting-ip", () => {
    process.env.CREW_TRUSTED_PROXY = "cloudflare";
    expect(clientIdentity(h({ "x-real-ip": "1.1.1.1" })).trusted).toBe(false);
    expect(clientIdentity(h({ "cf-connecting-ip": "not-an-ip" })).trusted).toBe(false);
    expect(clientIdentity(h({ "cf-connecting-ip": "2001:db8::1" })).trusted).toBe(true);
  });
});

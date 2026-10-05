/**
 * Auth smoke against a running LOCAL dev server (localhost:4200, local test DB).
 * Run: bun tests/e2e/auth-smoke.ts   (from packages/web)
 */
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { AppRouterClient } from "../../src/api";

const ORIGIN = "http://localhost:4200";
const PASSWORD = process.env.QA_PASSWORD ?? "correct-horse-battery";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function signIn(email: string): Promise<string> {
  const r = await fetch(`${ORIGIN}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const tok = r.headers.get("set-auth-token");
  if (r.status !== 200 || !tok) throw new Error(`sign-in ${email} -> ${r.status} ${(await r.text()).slice(0, 120)}`);
  return tok;
}

export function clientFor(token?: string): AppRouterClient {
  return createORPCClient(new RPCLink({ url: `${ORIGIN}/api/rpc`, headers: () => (token ? { Authorization: `Bearer ${token}` } : {}) }));
}

export async function outcome<T>(p: Promise<T>): Promise<string> {
  try {
    await p;
    return "OK";
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

if (import.meta.main) {
  const results: [string, string, string][] = [];
  const check = (name: string, got: string, want: string) => results.push([name, got, got === want ? "PASS" : "FAIL"]);

  const anon = clientFor();
  check("anon me.session", await outcome(anon.me.session()), "UNAUTHORIZED");
  check("anon recruiting.list", await outcome(anon.recruiting.list({})), "UNAUTHORIZED");
  check("bogus bearer recruiting.list", await outcome(clientFor("not-a-token").recruiting.list({})), "UNAUTHORIZED");

  const adminTok = await signIn("admin.test@example.com");
  const admin = clientFor(adminTok);
  const s = await admin.me.session();
  check("admin me.session isStaff", String(s.isStaff && s.staff.some((m) => m.role === "admin")), "true");
  check("admin recruiting.list", await outcome(admin.recruiting.list({})), "OK");
  check("admin templates.list", await outcome(admin.templates.list()), "OK");
  check("admin events.list", await outcome(admin.events.list()), "OK");
  check("admin integration.state", await outcome(admin.integration.state()), "OK");
  await sleep(4000);

  const workerTok = await signIn("worker.test@example.com");
  const worker = clientFor(workerTok);
  const ws = await worker.me.session();
  check("worker me.session isStaff=false", String(ws.isStaff), "false");
  check("worker recruiting.list", await outcome(worker.recruiting.list({})), "FORBIDDEN");
  check("worker events.list", await outcome(worker.events.list()), "FORBIDDEN");
  check("worker staff.list", await outcome(worker.staff.list()), "FORBIDDEN");
  check("worker (unlinked) worker.overview", await outcome(worker.worker.overview()), "FORBIDDEN");

  for (const r of results) console.log(r[2], r[0].padEnd(40), r[1]);
  const fails = results.filter((r) => r[2] === "FAIL").length;
  console.log(`${results.length - fails}/${results.length} passed`);
  process.exit(fails ? 1 : 0);
}

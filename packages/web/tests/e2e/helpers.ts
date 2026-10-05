/**
 * Shared helpers for e2e scripts that run against the LOCAL dev server and a
 * LOCAL libSQL file. They refuse to open anything but a file: database.
 */
import { createClient, type Client } from "@libsql/client";

export const ORIGIN = "http://localhost:4200";
export const TEST_DB = process.env.TEST_DB ?? "/home/user/sanctuary-testdb/crew-test.db";
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let client: Client | null = null;
export function testDb(): Client {
  if (!TEST_DB.startsWith("/")) throw new Error(`TEST_DB must be an absolute local file path, got ${TEST_DB}`);
  client ??= createClient({ url: `file:${TEST_DB}` });
  return client;
}

export async function q<T = Record<string, unknown>>(sql: string, args: (string | number | null)[] = []): Promise<T[]> {
  const r = await testDb().execute({ sql, args });
  return r.rows as unknown as T[];
}

/** Raw oRPC call (lets us assert HTTP status + error code on invalid input). */
export async function rpc(path: string, json: unknown, headers: Record<string, string> = {}) {
  const r = await fetch(`${ORIGIN}/api/rpc/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ json }),
  });
  const text = await r.text();
  let code: string | undefined;
  try {
    code = JSON.parse(text)?.json?.code;
  } catch {
    /* not json */
  }
  return { status: r.status, code, text };
}

export type Result = [name: string, got: string, want: string, pass: boolean];
export function recorder() {
  const results: Result[] = [];
  const check = (name: string, got: unknown, want: unknown) => {
    const g = String(got);
    const w = String(want);
    results.push([name, g, w, g === w]);
  };
  const report = (title: string) => {
    for (const [n, g, w, p] of results) console.log(`${p ? "PASS" : "FAIL"}  ${n.padEnd(60)} got=${g}${p ? "" : ` want=${w}`}`);
    const passed = results.filter((r) => r[3]).length;
    console.log(`\n${title}: ${passed}/${results.length} PASS`);
    if (passed !== results.length) process.exitCode = 1;
  };
  return { check, report, results };
}

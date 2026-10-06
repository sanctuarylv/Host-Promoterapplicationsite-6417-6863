/**
 * In-process test harness: a FRESH disposable libSQL file (migrations 0000 +
 * 0001 + the planning seed) and the real Hono app (`app.fetch`) — full auth,
 * oRPC middleware and permissions, with no dev server and no shared DB.
 *
 * Every value set here is test-only. No secret from the root .env is read.
 * Import this module FIRST (it must set env before any app module loads):
 *
 *   const h = await import("./harness"); await h.ready;
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

export const dir = mkdtempSync(join(tmpdir(), "crew-it-"));
export const dbFile = join(dir, "crew.db");
export const ORIGIN = "http://crew.test";

const testEnv: Record<string, string> = {
  DATABASE_URL: `file:${dbFile}`,
  DATABASE_AUTH_TOKEN: "local-file",
  BETTER_AUTH_SECRET: randomBytes(24).toString("hex"),
  CREW_TOKEN_SECRET: randomBytes(24).toString("hex"),
  WEBSITE_URL: ORIGIN,
  APPLICATION_ID: "test-application",
  VITE_RUNABLE_AUTH_ISSUER: "https://issuer.invalid",
  CREW_SUBMISSION_MODE: "local",
  CREW_TRUSTED_PROXY: "none",
};
// Drop anything that could point at a real service, then apply test values.
for (const k of Object.keys(process.env)) if (k.startsWith("COMMAND_CENTER_") || k.startsWith("TURSO")) delete process.env[k];
Object.assign(process.env, testEnv);
if (!process.env.DATABASE_URL!.startsWith("file:")) throw new Error("refusing non-file database");

const { migrate } = await import("drizzle-orm/libsql/migrator");
export const { db } = await import("../../src/api/database");
await migrate(db, { migrationsFolder: join(import.meta.dir, "../../drizzle") });

const seed = Bun.spawnSync(["bun", "scripts/seed-planning.ts"], { cwd: join(import.meta.dir, "../.."), env: { ...process.env, ...testEnv } });
if (seed.exitCode !== 0) throw new Error(`seed failed: ${seed.stderr.toString().slice(0, 400)}`);

export const app = (await import("../../src/api/index")).default;
export const S = await import("../../src/api/database/schema");
export const ready = Promise.resolve(true);

export type Rpc = { status: number; code?: string; json: unknown; message?: string };

/** Call an oRPC procedure through the real HTTP stack. */
export async function rpc(path: string, json: unknown, token?: string, headers: Record<string, string> = {}): Promise<Rpc> {
  const res = await app.fetch(
    new Request(`${ORIGIN}/api/rpc/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN, ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
      body: JSON.stringify({ json }),
    }),
  );
  const text = await res.text();
  let body: { json?: unknown } = {};
  try {
    body = JSON.parse(text);
  } catch {
    /* not json */
  }
  const j = body.json as { code?: string; message?: string } | undefined;
  return { status: res.status, code: res.status >= 400 ? j?.code : undefined, message: res.status >= 400 ? j?.message : undefined, json: body.json };
}

export const PASSWORD = "correct-horse-battery";
let n = 0;

/** Create an account via the real Better Auth sign-up and return its bearer token + user id. */
export async function signUp(label: string): Promise<{ token: string; userId: string; email: string }> {
  const email = `${label}.${++n}.${Date.now().toString(36)}@example.com`;
  const res = await app.fetch(
    new Request(`${ORIGIN}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify({ email, password: PASSWORD, name: label }),
    }),
  );
  const token = res.headers.get("set-auth-token");
  const body = (await res.json().catch(() => ({}))) as { user?: { id: string } };
  if (res.status !== 200 || !token || !body.user) throw new Error(`sign-up ${label} -> ${res.status}`);
  return { token, userId: body.user.id, email };
}

/**
 * Test fixture equivalent of `scripts/grant-staff.ts` (the only bootstrap path):
 * a direct membership row. Used only to create the FIRST admin; every other
 * grant in the suites goes through the real `staff.grant` procedure.
 */
export async function bootstrapAdmin(userId: string) {
  const { uuid } = await import("../../src/api/shared/ids");
  await db.insert(S.staffMemberships).values({ id: uuid(), user_id: userId, role: "admin", event_id: null, department_key: null, granted_by: "test-bootstrap" });
}

export function cleanup() {
  rmSync(dir, { recursive: true, force: true });
}

const { createORPCClient } = await import("@orpc/client");
const { RPCLink } = await import("@orpc/client/fetch");
type Client = import("../../src/api").AppRouterClient;

/** Typed oRPC client whose transport is the in-process app (no network). */
export function client(token?: string, extraHeaders: Record<string, string> = {}): Client {
  return createORPCClient(
    new RPCLink({
      url: `${ORIGIN}/api/rpc`,
      headers: () => ({ origin: ORIGIN, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extraHeaders }),
      fetch: async (req: Request) => await app.fetch(req),
    }),
  );
}

/** "OK" or the oRPC error code — for asserting denials. */
export async function outcome<T>(p: Promise<T>): Promise<string> {
  try {
    await p;
    return "OK";
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

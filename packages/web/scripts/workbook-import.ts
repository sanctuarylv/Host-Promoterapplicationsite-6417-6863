/**
 * Canonical staffing-taxonomy importer — DRY RUN BY DEFAULT.
 *
 *   bun scripts/workbook-import.ts --file data/staffing/sanctuary_lv_group_36_role_canonical_v1.csv
 *   bun scripts/workbook-import.ts --file <path> --dry-run [--target local] [--out <plan.json>]
 *   bun scripts/workbook-import.ts --file <path> --apply --target local --confirm-source-hash=<sha256>   # LOCAL REHEARSAL ONLY
 *
 * Formats (detected by the COMPLETE header set, never one column):
 *   canonical_v1 — the Sanctuary LV Group 36-role workbook export (CSV, or JSON array of rows)
 *   legacy       — the six-column template-role export; validated only, never written
 *
 * Dry run (default): parses, validates, reconciles through the reviewed map
 * (src/api/ops/staffing/role-map.ts — no fuzzy matching), resolves reporting
 * lines, maps credentials/training through controlled tables, computes
 * headcount and the After Dark vNext preview, and writes a deterministic plan to
 * artifacts/workbook-import-plan.json (git-ignored). No database is opened
 * unless `--target local`, which only READS the local file DB to say what an
 * apply would insert / update / leave unchanged.
 *
 * --apply exists so the write path can be rehearsed and proven idempotent on a
 * disposable LOCAL copy. It writes only ops_canonical_roles (upsert by
 * canonical_role_id) and requires: a valid plan, `--target local`, a `file:`
 * DATABASE_URL, and --confirm-source-hash equal to the plan's source_hash.
 * Any remote/production target is refused in this phase — there is no flag to
 * override it. Template versions, event plans, assignments, credentials,
 * permissions and training records are never written.
 *
 * Exit codes: 0 ok · 1 validation errors · 2 refused / usage.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { buildImportPlan, recordsForApply, type CanonicalRoleRecord, type ImportPlan } from "../src/api/ops/staffing/plan";

const argv = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const eq = argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : undefined;
};
const has = (name: string) => argv.includes(`--${name}`);
const die = (msg: string, code = 2): never => {
  console.error(`[workbook-import] ${msg}`);
  process.exit(code);
};

const file = opt("file");
if (!file) die("usage: bun scripts/workbook-import.ts --file <path> [--dry-run] [--target local] [--out <plan.json>]");
const apply = has("apply");
if (apply && has("dry-run")) die("--apply and --dry-run are mutually exclusive");
const target = opt("target") ?? "none";
const out = resolve(opt("out") ?? "artifacts/workbook-import-plan.json");

const dbUrl = process.env.DATABASE_URL ?? "";
const localDb = dbUrl.startsWith("file:");
if (target !== "none" && target !== "local") {
  // Named environments (staging, production, a Turso host…) are never opened by this phase.
  if (apply) die(`refusing --apply to target "${target}": only a local file database may be written in this phase (production import is not authorized)`);
  console.log(`[workbook-import] target "${target}" is not opened in this phase — plan is computed without reading it`);
}
if (target === "local" && !localDb) die(`--target local requires DATABASE_URL=file:<path> (got ${dbUrl ? "a non-file URL" : "nothing"}); remote databases are never opened`);
if (apply && target !== "local") die("--apply requires --target local (a disposable local file database)");

const bytes = readFileSync(file!);
const source_hash = createHash("sha256").update(bytes).digest("hex");
const text = bytes.toString("utf8");
const kind = file!.toLowerCase().endsWith(".json") ? "json" : "csv";
const source_file = relative(process.cwd(), resolve(file!)) || file!;

type Client = { execute: (q: string | { sql: string; args: unknown[] }) => Promise<{ rows: Record<string, unknown>[] }>; close: () => void };
async function openLocal(): Promise<Client> {
  const { createClient } = await import("@libsql/client");
  return createClient({ url: dbUrl }) as unknown as Client;
}
async function readExisting(c: Client): Promise<Partial<CanonicalRoleRecord>[] | null> {
  const t = await c.execute("select name from sqlite_master where type='table' and name='ops_canonical_roles'");
  if (!t.rows.length) return null;
  const rs = await c.execute("select * from ops_canonical_roles order by canonical_role_id");
  return rs.rows.map((r) => {
    const o: Record<string, unknown> = { ...r };
    if (typeof o.aliases === "string") o.aliases = JSON.parse(o.aliases);
    delete o.created_at;
    delete o.updated_at;
    return o as Partial<CanonicalRoleRecord>;
  });
}

let existing: Partial<CanonicalRoleRecord>[] = [];
let client: Client | null = null;
let schemaPresent: boolean | null = null;
if (target === "local") {
  client = await openLocal();
  const rows = await readExisting(client);
  schemaPresent = rows !== null;
  existing = rows ?? [];
}

const plan: ImportPlan = buildImportPlan({
  text,
  kind,
  source_file,
  source_hash,
  target: target === "local" ? `local (${dbUrl})` : target === "none" ? undefined : `${target} (not opened)`,
  existing,
});
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(plan, null, 2) + "\n");

const s = plan.proposed_writes.summary;
console.log(`[workbook-import] ${plan.import_status}`);
console.log(`source ${plan.source_file}  sha256 ${plan.source_hash}  format ${plan.schema_version ?? "unknown"}`);
console.log(
  `canonical roles ${plan.canonical_roles.total} (exact ${plan.canonical_roles.exact} · rename ${plan.canonical_roles.renamed} · partial ${plan.canonical_roles.partial} · new ${plan.canonical_roles.new})  entity ${plan.entity_id}`,
);
console.log(
  `existing roles: preserved ${plan.existing_roles.preserved.length} · excluded ${plan.existing_roles.excluded.length} · external ${plan.existing_roles.external.length} · separate_domain ${plan.existing_roles.separate_domain.length} · unresolved ${plan.existing_roles.unresolved.length}`,
);
console.log(`headcount: canonical baseline ${plan.headcount.canonical_baseline_total} · After Dark v1 ${plan.headcount.existing_template_total} → vNext preview ${plan.headcount.proposed_template_total} · assignments created 0`);
console.log(`supervisor changes ${plan.supervisor_changes.length}: ${plan.supervisor_changes.map((c) => `${c.role_key} ${c.from}→${c.to}`).join(", ") || "none"}`);
console.log(`credential gaps ${plan.credential_mappings.filter((c) => c.status !== "mapped").length} · training gaps ${plan.training_mappings.filter((t) => t.status !== "mapped").length}`);
console.log(`warnings ${plan.warnings.length} · errors ${plan.errors.length}`);
for (const e of plan.errors) console.log(`ERROR ${e.code}${e.row ? ` row ${e.row}` : ""}${e.canonical_role_id ? ` ${e.canonical_role_id}` : ""}: ${e.message}`);
console.log(`proposed writes (informational): insert ${s.insert} · update ${s.update} · unchanged ${s.unchanged} · conflict ${s.conflict}${schemaPresent === false ? " (ops_canonical_roles missing — run migration 0002 on the rehearsal copy first)" : ""}`);
const shownOut = relative(process.cwd(), out).startsWith("..") ? out : relative(process.cwd(), out);
console.log(`plan ${shownOut}  plan_hash ${plan.plan_hash}`);

if (!plan.ok) {
  client?.close();
  console.log("RESULT: not valid — nothing written");
  process.exit(1);
}
if (!apply) {
  client?.close();
  console.log("RESULT: valid — DRY RUN, nothing written. Import pending approval (docs/STAFFING_IMPORT_RUNBOOK_V2.md).");
  process.exit(0);
}

// ── LOCAL REHEARSAL APPLY ───────────────────────────────────────────────────
const confirm = opt("confirm-source-hash");
if (confirm !== plan.source_hash) die(`--confirm-source-hash must equal the reviewed source hash ${plan.source_hash}`);
if (!schemaPresent) die("ops_canonical_roles does not exist on this database — apply migration 0002 to the rehearsal copy first");
const records = recordsForApply({ text, kind, source_file, source_hash });
const write = new Set(plan.proposed_writes.operations.filter((o) => o.op === "insert" || o.op === "update").map((o) => o.canonical_role_id));
const COLS = Object.keys(records[0]!) as (keyof CanonicalRoleRecord)[];
const nowMs = Date.now();
const stmts = records
  .filter((r) => write.has(r.canonical_role_id))
  .map((r) => ({
    sql:
      `insert into ops_canonical_roles (${COLS.join(", ")}, created_at, updated_at) values (${COLS.map(() => "?").join(", ")}, ?, ?) ` +
      `on conflict(canonical_role_id) do update set ${COLS.filter((c) => c !== "canonical_role_id")
        .map((c) => `${c} = excluded.${c}`)
        .join(", ")}, updated_at = excluded.updated_at`,
    args: [...COLS.map((c) => (c === "aliases" ? JSON.stringify(r[c]) : (r[c] as unknown))), nowMs, nowMs],
  }));
const c2 = client as unknown as { batch: (s: { sql: string; args: unknown[] }[], mode: string) => Promise<unknown> };
if (stmts.length) await c2.batch(stmts, "write");
const after = await readExisting(client!);
client!.close();
console.log(`[workbook-import] LOCAL REHEARSAL APPLY to ${dbUrl}: wrote ${stmts.length} ops_canonical_roles rows (insert ${s.insert}, update ${s.update}, unchanged ${s.unchanged}); table now holds ${after?.length ?? 0}`);
console.log("RESULT: local rehearsal applied. Production import remains NOT AUTHORIZED.");

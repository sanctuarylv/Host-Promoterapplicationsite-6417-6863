#!/usr/bin/env bash
# App / schema compatibility matrix for migration 0002, on DISPOSABLE copies of local files.
#
#   bash packages/web/tests/migration/compat.sh /path/to/legacy-v1-snapshot.db [previous-ref]
#
#   $1  a legacy snapshot (before any v2 migration), e.g. sanctuary-testdb/legacy-v1-snapshot.db
#   $2  the previous application build (default ea93869 — last commit before 0002 was introduced)
#
# The previous build is checked out into a throwaway git worktree under /tmp (node_modules is
# symlinked; the dependency set is identical — verified by `git diff <ref> HEAD -- bun.lock`).
# Never reads the root .env: every bun / drizzle-kit call gets an explicit file: URL.
#
#   C1  previous build WRITES on the post-0002 schema: its own backfill-v2 + seed-planning run
#       against a copy migrated 0000–0002 by the current build
#   C2  previous build READS every table it knows on the post-0002 schema
#   C3  current build reads every table on that DB; rows written by the previous build carry the
#       0002 defaults (enabled = 1, required = 0, canonical_role_id / entity_id / updated_at null)
#   C4  previous build's `drizzle-kit migrate` on the post-0002 DB is a no-op (schema + data
#       fingerprint unchanged, journal unchanged) — it does not try to undo or redo 0002
#   C5  current build's importer on that DB, then the previous build still reads every table
#   C6  control: previous build reads every table on the pre-0002 schema (its native schema)
#   C7  current build on the pre-0002 schema FAILS (same as recovery R4)
#
# Result → release ordering (docs/RELEASE_PLAN_0002_V4.md): migrate first while the previous
# build is serving, then deploy the current build; roll back the APP first — the previous build
# keeps working on the 0002 schema, so a schema rollback is not required to restore service.
set -euo pipefail
LEGACY="${1:?usage: compat.sh legacy-snapshot.db [previous-ref]}"
OLDREF="${2:-ea93869}"
[ -f "$LEGACY" ] || { echo "not a local file: $LEGACY"; exit 2; }
HERE="$(cd "$(dirname "$0")/../.." && pwd)"   # packages/web
REPO="$(cd "$HERE/../.." && pwd)"
WORK="$(mktemp -d /tmp/crew-compat-XXXX)"
OLD="$WORK/old"
unset TURSO_DATABASE_URL TURSO_AUTH_TOKEN
PASSES=0
pass() { echo "  PASS $*"; PASSES=$((PASSES + 1)); }
fail() { echo "  FAIL $*"; cleanup; exit 1; }
cleanup() { git -C "$REPO" worktree remove --force "$OLD" >/dev/null 2>&1 || true; }
trap cleanup EXIT
on() { DATABASE_URL="file:$1" DATABASE_AUTH_TOKEN=local-file "${@:2}"; }
sha() { sha256sum "$1" | cut -d' ' -f1; }
count() { python3 -c "import sqlite3,sys;c=sqlite3.connect(f'file:{sys.argv[1]}?mode=ro',uri=True);print(c.execute(sys.argv[2]).fetchone()[0])" "$1" "$2"; }
fp() {
  python3 - "$1" <<'PY'
import hashlib, json, sqlite3, sys
c = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True)
h = hashlib.sha256()
for (t,) in c.execute("select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name"):
    cols = [r[1] for r in c.execute(f"pragma table_info(`{t}`)")]
    h.update(json.dumps([t, cols]).encode())
    names = ",".join(f"`{x}`" for x in cols)
    for row in c.execute(f"select {names} from `{t}` order by {names}"):
        h.update(json.dumps(row, default=str).encode())
for (s,) in c.execute("select sql from sqlite_master where type='index' and sql is not null order by name"):
    h.update(s.encode())
print(h.hexdigest())
PY
}

# Probe: select 1 row from EVERY drizzle table exported by a build's schema modules.
probe() { # $1 = packages/web dir of the build, $2 = db file, $3 = label
  cat >"$WORK/probe-$3.ts" <<TS
import { is, getTableName } from "$1/node_modules/drizzle-orm";
import { SQLiteTable } from "$1/node_modules/drizzle-orm/sqlite-core";
import { db } from "$1/src/api/database";
const mods = await Promise.all(["schema", "schema-identity", "schema-recruiting", "schema-ops", "schema-campaigns", "auth-schema"].map((m) => import("$1/src/api/database/" + m).catch(() => ({}))));
const tables = [...new Set(mods.flatMap((m) => Object.values(m)).filter((v) => is(v, SQLiteTable)))] as SQLiteTable[]; // schema.ts re-exports: dedupe by identity
let ok = 0; const bad: string[] = [];
for (const t of tables) {
  try { await db.select().from(t).limit(1); ok++; } catch (e) { bad.push(getTableName(t) + ": " + String((e as Error)?.cause ?? e).slice(0, 90)); }
}
console.log(JSON.stringify({ tables: tables.length, ok, bad }));
TS
  on "$2" bun "$WORK/probe-$3.ts" 2>/dev/null | tail -1
}
probe_ok() { python3 -c "import json,sys;d=json.loads(sys.argv[1]);sys.exit(0 if d['tables']>0 and d['ok']==d['tables'] and not d['bad'] else 1)" "$1"; }

echo "== work dir $WORK"
git -C "$REPO" worktree add --detach "$OLD" "$OLDREF" >/dev/null 2>&1 || fail "worktree $OLDREF"
[ -z "$(git -C "$REPO" diff "$OLDREF" HEAD -- bun.lock package.json packages/web/package.json)" ] && pass "dependency set identical to $OLDREF (node_modules can be shared)" || fail "dependencies differ from $OLDREF; install them in the worktree instead"
ln -s "$REPO/node_modules" "$OLD/node_modules"
ln -s "$HERE/node_modules" "$OLD/packages/web/node_modules"
OW="$OLD/packages/web"
[ ! -f "$OW/drizzle/0002_canonical_staffing_taxonomy.sql" ] && pass "previous build ($OLDREF) has no migration 0002" || fail "$OLDREF already contains 0002"
echo "   previous build $(git -C "$OLD" rev-parse --short HEAD) · current build $(git -C "$REPO" rev-parse --short HEAD)"

# ── post-0002 DB, previous build writing
A="$WORK/post0002.db"; cp "$LEGACY" "$A"
(cd "$HERE" && on "$A" bunx drizzle-kit migrate >"$WORK/a-migrate.log" 2>&1) || { cat "$WORK/a-migrate.log"; fail "current migrate"; }
[ "$(count "$A" "select count(*) from sqlite_master where name='ops_canonical_roles'")" = 1 ] && pass "copy migrated 0000–0002 by the current build" || fail "0002 not applied"
echo "== C1 previous build writes on the post-0002 schema"
(cd "$OW" && on "$A" bun scripts/backfill-v2.ts >"$WORK/c1-backfill.log" 2>&1) || { tail "$WORK/c1-backfill.log"; fail "previous backfill-v2 on post-0002"; }
(cd "$OW" && on "$A" bun scripts/seed-planning.ts >"$WORK/c1-seed.log" 2>&1) || { tail "$WORK/c1-seed.log"; fail "previous seed-planning on post-0002"; }
TR="$(count "$A" "select count(*) from ops_template_roles")"
[ "$TR" -gt 0 ] && pass "previous build's backfill-v2 + seed-planning succeeded; it wrote $TR template roles" || fail "no template roles written"
echo "== C2 previous build reads every table it knows"
R="$(probe "$OW" "$A" old-post)"; echo "   $R"
probe_ok "$R" && pass "previous build: every table readable on the post-0002 schema" || fail "previous build cannot read post-0002 schema"
echo "== C3 current build reads rows written by the previous build"
R="$(probe "$HERE" "$A" new-post)"; echo "   $R"
probe_ok "$R" && pass "current build: every table readable (incl. rows written by the previous build)" || fail "current build read failure"
DEF="$(count "$A" "select count(*) from ops_template_roles where enabled = 1 and required = 0 and canonical_role_id is null")"
[ "$DEF" = "$TR" ] && pass "all $TR rows written by the previous build carry the 0002 defaults (enabled 1, required 0, canonical_role_id null)" || fail "defaults: $DEF of $TR"
[ "$(count "$A" "select count(*) from ops_templates where entity_id is not null or updated_at is not null")" = 0 ] && pass "ops_templates rows written by the previous build: entity_id / updated_at null" || fail "unexpected template values"
echo "== C4 previous build's migrate on the post-0002 DB"
J0="$(count "$A" "select count(*) from __drizzle_migrations")"; F0="$(fp "$A")"
(cd "$OW" && on "$A" bunx drizzle-kit migrate >"$WORK/c4-migrate.log" 2>&1) || { cat "$WORK/c4-migrate.log"; fail "previous migrate errored"; }
[ "$(fp "$A")" = "$F0" ] && [ "$(count "$A" "select count(*) from __drizzle_migrations")" = "$J0" ] && pass "previous build's drizzle-kit migrate is a no-op ($J0 journal rows; fingerprint unchanged)" || fail "previous migrate changed the DB"
echo "== C5 current importer, then previous build reads again"
CSV="data/staffing/sanctuary_lv_group_36_role_canonical_v1.csv"
HASH="$(cd "$HERE" && sha "$CSV")"
PLANHASH="8c22363803999b763305dc8961dcc6b7226271c15c28829ce14aff842cfcd701"
(cd "$HERE" && on "$A" bun scripts/workbook-import.ts --file "$CSV" --apply --target local --confirm-source-hash="$HASH" --confirm-plan-hash="$PLANHASH" --out "$WORK/c5-plan.json" >"$WORK/c5-import.log" 2>&1) || { tail "$WORK/c5-import.log"; fail "import"; }
[ "$(count "$A" "select count(*) from ops_canonical_roles")" = 36 ] && pass "current importer wrote 36 canonical roles" || fail "import count"
R="$(probe "$OW" "$A" old-imported)"; echo "   $R"
probe_ok "$R" && pass "previous build still reads every table with canonical rows present" || fail "previous build broke after import"
echo "== C6 control: previous build on the pre-0002 schema"
B="$WORK/pre0002.db"; cp "$LEGACY" "$B"
(cd "$OW" && on "$B" bunx drizzle-kit migrate >"$WORK/c6-migrate.log" 2>&1) || { cat "$WORK/c6-migrate.log"; fail "previous migrate 0000–0001"; }
[ "$(count "$B" "select count(*) from sqlite_master where name='ops_canonical_roles'")" = 0 ] && pass "copy migrated 0000–0001 only by the previous build" || fail "unexpected 0002 objects"
R="$(probe "$OW" "$B" old-pre)"; echo "   $R"
probe_ok "$R" && pass "previous build: every table readable on its native (pre-0002) schema" || fail "control failed"
echo "== C7 current build on the pre-0002 schema (expected to FAIL)"
R="$(probe "$HERE" "$B" new-pre)"; echo "   $R"
python3 -c "import json,sys;d=json.loads(sys.argv[1]);sys.exit(0 if any(b.startswith(('ops_templates','ops_template_roles','ops_canonical_roles')) for b in d['bad']) else 1)" "$R" && pass "current build cannot read 0002 tables/columns on the pre-0002 schema → deploy the current build only AFTER 0002" || fail "expected current build to fail on pre-0002"

echo "== source untouched: $(sha "$LEGACY")  $LEGACY"
echo "PASS compatibility matrix: $PASSES checks ($WORK)"
echo "  previous build × post-0002 schema: READ + WRITE OK · current build × pre-0002 schema: FAILS"
echo "UNVERIFIED (not rehearsable locally): the same matrix on Turso; the HTTP surface of the previous build"
echo "  (run E2E against a previous-build dev server — see docs/RELEASE_PLAN_0002_V4.md §5)."

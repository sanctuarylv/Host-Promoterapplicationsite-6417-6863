#!/usr/bin/env bash
# Recovery-procedure rehearsal on DISPOSABLE copies of local database files.
#
#   bash packages/web/tests/migration/recovery.sh /path/to/legacy-v1-snapshot.db /path/to/pre-0002.db
#
#   $1  a legacy snapshot (before any v2 migration)       e.g. sanctuary-testdb/legacy-v1-snapshot.db
#   $2  a database at migrations 0000–0001 (before 0002)  e.g. sanctuary-testdb/crew-test.db
#
# Both sources are copied into a temp dir under /tmp and are never opened for writing.
# Never reads the root .env: every bun / drizzle-kit call gets an explicit file: URL.
#
# Procedures rehearsed (docs/PRODUCTION_APPROVAL_PACKAGE_V3.md §7):
#   R1  File-level backup → migrate 0000–0002 + seed + import → restore from backup;
#       restored bytes must hash-match the backup taken before the migration.
#   R2  Import rollback: delete ONLY the importer's rows (ops_canonical_roles with the
#       reviewed source_hash); every other table's content must be byte-identical.
#   R3  Schema rollback of 0002 (DROP TABLE / DROP INDEX / ALTER TABLE … DROP COLUMN +
#       removal of the 0002 row in __drizzle_migrations); schema and data must equal
#       the pre-0002 state, and re-running migrate must re-apply 0002 cleanly.
#   R4  App compatibility after a schema-only rollback: the CURRENT code reading
#       ops_templates against the rolled-back schema — expected to FAIL (code rollback
#       is required together with schema rollback).
#
# VERIFIED here: SQLite 3.46 local files only. NOT VERIFIED (see §7): Turso / libSQL
# point-in-time restore or branching, DROP COLUMN on Turso, drizzle journal row removal
# on Turso, and running the previous application build against a rolled-back schema.
set -euo pipefail
LEGACY="${1:?usage: recovery.sh legacy-snapshot.db pre-0002.db}"
PRE="${2:?usage: recovery.sh legacy-snapshot.db pre-0002.db}"
for f in "$LEGACY" "$PRE"; do [ -f "$f" ] || { echo "not a local file: $f"; exit 2; }; done
HERE="$(cd "$(dirname "$0")/../.." && pwd)"   # packages/web
WORK="$(mktemp -d /tmp/crew-recovery-XXXX)"
cd "$HERE"
unset TURSO_DATABASE_URL TURSO_AUTH_TOKEN
CSV="data/staffing/sanctuary_lv_group_36_role_canonical_v1.csv"
HASH="$(sha256sum "$CSV" | cut -d' ' -f1)"
PLANHASH="8c22363803999b763305dc8961dcc6b7226271c15c28829ce14aff842cfcd701"   # Phase 2 reviewed baseline
M0002_HASH="$(sha256sum drizzle/0002_canonical_staffing_taxonomy.sql | cut -d' ' -f1)"
PASSES=0
pass() { echo "  PASS $*"; PASSES=$((PASSES + 1)); }
fail() { echo "  FAIL $*"; exit 1; }
sha() { sha256sum "$1" | cut -d' ' -f1; }
on() { DATABASE_URL="file:$1" DATABASE_AUTH_TOKEN=local-file "${@:2}"; }

# Schema + per-table content fingerprint. $3 = comma list of tables to exclude.
fp() {
  python3 - "$1" "$2" "${3:-}" <<'PY'
import hashlib, json, sqlite3, sys
db, out, excl = sys.argv[1], sys.argv[2], set(filter(None, sys.argv[3].split(",")))
c = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
tables = [r[0] for r in c.execute("select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name")]
res = {"tables": {}, "indexes": {}, "integrity": c.execute("pragma integrity_check").fetchone()[0]}
for t in tables:
    if t in excl:
        continue
    cols = [(r[1], r[2], r[3], r[4]) for r in c.execute(f"pragma table_info(`{t}`)")]
    names = ",".join(f"`{x[0]}`" for x in cols)
    h = hashlib.sha256()
    n = 0
    for row in c.execute(f"select {names} from `{t}` order by {names}"):
        h.update(json.dumps(row, default=str).encode()); n += 1
    res["tables"][t] = {"cols": cols, "rows": n, "sha": h.hexdigest()}
for name, tbl, s in c.execute("select name, tbl_name, sql from sqlite_master where type='index' and sql is not null order by name"):
    if tbl not in excl:
        res["indexes"][name] = s
json.dump(res, open(out, "w"), default=str, indent=0)
PY
}
same() { python3 -c "import json,sys;a,b=json.load(open(sys.argv[1])),json.load(open(sys.argv[2]));sys.exit(0 if a==b else 1)" "$1" "$2"; }
diffp() { python3 - "$1" "$2" <<'PY'
import json, sys
a, b = json.load(open(sys.argv[1])), json.load(open(sys.argv[2]))
for k in ("tables", "indexes"):
    for t in sorted(set(a[k]) | set(b[k])):
        if a[k].get(t) != b[k].get(t):
            print(f"    differs: {k}.{t}")
PY
}
count() { python3 -c "import sqlite3,sys;c=sqlite3.connect(f'file:{sys.argv[1]}?mode=ro',uri=True);print(c.execute(sys.argv[2]).fetchone()[0])" "$1" "$2"; }

echo "== work dir $WORK"
echo "   reviewed source sha256 $HASH"
echo "   0002 migration sha256  $M0002_HASH"

# ─────────────────────────────────────────────────────────────── R1 file backup / restore
echo "== R1 file-level backup and restore (legacy snapshot → 0000–0002 → restore)"
R1="$WORK/r1.db"; cp "$LEGACY" "$R1"
BACKUP="$WORK/r1.backup.db"; cp "$R1" "$BACKUP"
B_SHA="$(sha "$BACKUP")"; echo "   backup sha256 $B_SHA"
[ "$B_SHA" = "$(sha "$LEGACY")" ] && pass "backup is byte-identical to the source snapshot" || fail "backup differs from source"
on "$R1" bunx drizzle-kit migrate >"$WORK/r1-migrate.log" 2>&1 || { cat "$WORK/r1-migrate.log"; fail "migrate"; }
on "$R1" bun scripts/backfill-v2.ts >"$WORK/r1-backfill.log" 2>&1 || { tail "$WORK/r1-backfill.log"; fail "backfill"; }
on "$R1" bun scripts/seed-planning.ts >"$WORK/r1-seed.log" 2>&1 || { tail "$WORK/r1-seed.log"; fail "seed"; }
on "$R1" bun scripts/workbook-import.ts --file "$CSV" --apply --target local --confirm-source-hash="$HASH" --confirm-plan-hash="$PLANHASH" --out "$WORK/r1-plan.json" >"$WORK/r1-import.log" 2>&1 || { tail "$WORK/r1-import.log"; fail "import"; }
[ "$(count "$R1" "select count(*) from ops_canonical_roles")" = 36 ] && pass "migrated + imported copy has 36 canonical roles" || fail "import did not land"
[ "$(sha "$R1")" != "$B_SHA" ] && pass "migrated copy differs from the backup (the change is real)" || fail "migration changed nothing"
cp "$BACKUP" "$R1"
[ "$(sha "$R1")" = "$B_SHA" ] && pass "restored file sha256 equals the pre-migration backup" || fail "restore hash mismatch"
[ "$(count "$R1" "pragma integrity_check")" = ok ] && pass "restored file passes pragma integrity_check" || fail "integrity_check"
[ "$(count "$R1" "select count(*) from sqlite_master where name='ops_canonical_roles'")" = 0 ] && pass "restored file has no ops_canonical_roles table" || fail "restore left 0002 objects"

# ─────────────────────────────────────────────────────────────── R2 import rollback
echo "== R2 import rollback (pre-0002 copy → migrate → import → delete importer rows only)"
R2="$WORK/r2.db"; cp "$PRE" "$R2"
on "$R2" bunx drizzle-kit migrate >"$WORK/r2-migrate.log" 2>&1 || { cat "$WORK/r2-migrate.log"; fail "migrate"; }
[ "$(count "$R2" "select count(*) from ops_canonical_roles")" = 0 ] && pass "0002 applied; ops_canonical_roles empty before import" || fail "unexpected rows"
fp "$R2" "$WORK/r2-before.json" ops_canonical_roles
on "$R2" bun scripts/workbook-import.ts --file "$CSV" --apply --target local --confirm-source-hash="$HASH" --confirm-plan-hash="$PLANHASH" --out "$WORK/r2-plan.json" >"$WORK/r2-import.log" 2>&1 || { tail "$WORK/r2-import.log"; fail "import"; }
[ "$(count "$R2" "select count(*) from ops_canonical_roles where source_hash='$HASH'")" = 36 ] && pass "import wrote 36 rows carrying the reviewed source_hash" || fail "import count"
fp "$R2" "$WORK/r2-imported.json" ops_canonical_roles
same "$WORK/r2-before.json" "$WORK/r2-imported.json" && pass "import touched no other table" || { diffp "$WORK/r2-before.json" "$WORK/r2-imported.json"; fail "import touched other tables"; }
# The rollback statement — scoped to the reviewed import only.
python3 - "$R2" "$HASH" <<'PY'
import sqlite3, sys
c = sqlite3.connect(sys.argv[1])
n = c.execute("delete from ops_canonical_roles where source_hash = ? and source_system is not null", (sys.argv[2],)).rowcount
c.commit(); print(f"   deleted {n} importer rows")
PY
[ "$(count "$R2" "select count(*) from ops_canonical_roles")" = 0 ] && pass "ops_canonical_roles back to 0 rows" || fail "rows left"
fp "$R2" "$WORK/r2-after.json" ops_canonical_roles
same "$WORK/r2-before.json" "$WORK/r2-after.json" && pass "every other table byte-identical to before the import" || { diffp "$WORK/r2-before.json" "$WORK/r2-after.json"; fail "rollback changed other tables"; }
on "$R2" bun scripts/workbook-import.ts --file "$CSV" --dry-run --target local --out "$WORK/r2-replan.json" >/dev/null 2>&1
python3 -c "import json,sys;p=json.load(open(sys.argv[1]));sys.exit(0 if p['plan_hash'] and p['proposed_writes']['applied'] is False else 1)" "$WORK/r2-replan.json" && pass "dry run after rollback plans a fresh import (nothing applied)" || fail "re-plan"

# ─────────────────────────────────────────────────────────────── R3 schema rollback of 0002
echo "== R3 schema rollback of 0002 (pre-0002 copy → migrate → import → rollback import + schema)"
R3="$WORK/r3.db"; cp "$PRE" "$R3"
fp "$R3" "$WORK/r3-pre.json"
JOURNAL_PRE="$(count "$R3" "select count(*) from __drizzle_migrations")"
on "$R3" bunx drizzle-kit migrate >"$WORK/r3-migrate.log" 2>&1 || { cat "$WORK/r3-migrate.log"; fail "migrate"; }
fp "$R3" "$WORK/r3-post0002.json" __drizzle_migrations,ops_canonical_roles
[ "$(count "$R3" "select count(*) from __drizzle_migrations where hash='$M0002_HASH'")" = 1 ] && pass "0002 recorded in __drizzle_migrations" || fail "journal"
on "$R3" bun scripts/workbook-import.ts --file "$CSV" --apply --target local --confirm-source-hash="$HASH" --confirm-plan-hash="$PLANHASH" --out "$WORK/r3-plan.json" >"$WORK/r3-import.log" 2>&1 || { tail "$WORK/r3-import.log"; fail "import"; }
python3 - "$R3" "$HASH" "$M0002_HASH" <<'PY'
import sqlite3, sys
c = sqlite3.connect(sys.argv[1])
c.execute("pragma foreign_keys = off")
c.execute("begin")
c.execute("delete from ops_canonical_roles where source_hash = ?", (sys.argv[2],))
for s in [
    "DROP INDEX IF EXISTS `ops_canonical_roles_role_key_uq`",
    "DROP TABLE `ops_canonical_roles`",
    "ALTER TABLE `ops_template_roles` DROP COLUMN `canonical_role_id`",
    "ALTER TABLE `ops_template_roles` DROP COLUMN `enabled`",
    "ALTER TABLE `ops_template_roles` DROP COLUMN `required`",
    "ALTER TABLE `ops_templates` DROP COLUMN `entity_id`",
    "ALTER TABLE `ops_templates` DROP COLUMN `updated_at`",
]:
    c.execute(s); print(f"   {s}")
n = c.execute("delete from __drizzle_migrations where hash = ?", (sys.argv[3],)).rowcount
print(f"   delete from __drizzle_migrations where hash = <0002 sha256>  ({n} row)")
c.execute("commit")
assert c.execute("pragma foreign_key_check").fetchall() == []
PY
fp "$R3" "$WORK/r3-rolledback.json"
same "$WORK/r3-pre.json" "$WORK/r3-rolledback.json" && pass "schema (columns + indexes) and every table's content equal the pre-0002 copy" || { diffp "$WORK/r3-pre.json" "$WORK/r3-rolledback.json"; fail "schema rollback differs"; }
[ "$(count "$R3" "select count(*) from __drizzle_migrations")" = "$JOURNAL_PRE" ] && pass "journal back to $JOURNAL_PRE rows" || fail "journal rows"
[ "$(count "$R3" "pragma integrity_check")" = ok ] && pass "rolled-back file passes pragma integrity_check" || fail "integrity_check"
on "$R3" bunx drizzle-kit migrate >"$WORK/r3-remigrate.log" 2>&1 || { cat "$WORK/r3-remigrate.log"; fail "re-migrate"; }
fp "$R3" "$WORK/r3-reapplied.json" __drizzle_migrations,ops_canonical_roles
same "$WORK/r3-post0002.json" "$WORK/r3-reapplied.json" && pass "re-running migrate re-applies 0002 to the identical schema" || { diffp "$WORK/r3-post0002.json" "$WORK/r3-reapplied.json"; fail "re-apply differs"; }

# ─────────────────────────────────────────────────────────────── R4 app compatibility
echo "== R4 current application code against a schema-only rollback (expected to fail)"
R4="$WORK/r4.db"; cp "$PRE" "$R4"   # pre-0002 schema == rolled-back schema (proved in R3)
cat >"$WORK/r4-probe.ts" <<TS
import { db } from "$HERE/src/api/database";
import { opsTemplates } from "$HERE/src/api/database/schema-ops";
try { await db.select().from(opsTemplates).limit(1); console.log("SELECT_OK"); }
catch (e) { console.log("SELECT_FAILED", String((e as Error)?.cause ?? e).slice(0, 160)); }
TS
OUT="$(on "$R4" bun "$WORK/r4-probe.ts" 2>&1 | grep -E 'SELECT_(OK|FAILED)' || true)"
echo "   $OUT"
case "$OUT" in
  SELECT_FAILED*) pass "current code cannot read ops_templates on the pre-0002 schema → schema rollback REQUIRES rolling the app back to a pre-0002 build" ;;
  *) fail "expected the current code to fail on the pre-0002 schema (got: $OUT)" ;;
esac
[ "$(sha "$PRE")" = "$(sha "$R4")" ] && pass "probe did not write to the copy" || echo "  note: probe changed the copy's bytes"

echo "== source files untouched"
echo "   $(sha "$LEGACY")  $LEGACY"
echo "   $(sha "$PRE")  $PRE"
echo "PASS recovery rehearsal: $PASSES checks ($WORK)"
echo "UNVERIFIED (not rehearsable locally): Turso/libSQL point-in-time restore or branch restore; DROP COLUMN on"
echo "  Turso; __drizzle_migrations row removal on Turso; previous app build against the rolled-back schema."

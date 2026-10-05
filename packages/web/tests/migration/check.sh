#!/usr/bin/env bash
# Migration / backfill / planning-seed rehearsal on a DISPOSABLE copy of a database file.
#
#   bash packages/web/tests/migration/check.sh /path/to/legacy-snapshot.db
#
# Copies the snapshot to a temp dir (the source is never opened for writing), then:
#   1. drizzle-kit migrate (twice — the second run must be a no-op)
#   2. backfill-v2 --dry-run, apply, re-apply (second apply must change nothing)
#   3. seed-planning apply twice (second run must change nothing)
#   4. compares legacy application rows (id, email, created_at, utm_*, referral code,
#      consent version/timestamp) before vs after — they must be preserved.
# Refuses to run if the snapshot path is not a local file. Never reads the root .env.
set -euo pipefail
SRC="${1:?usage: check.sh /path/to/snapshot.db}"
[ -f "$SRC" ] || { echo "not a local file: $SRC"; exit 2; }
HERE="$(cd "$(dirname "$0")/../.." && pwd)"   # packages/web
WORK="$(mktemp -d /tmp/crew-migcheck-XXXX)"
DB="$WORK/rehearsal.db"
cp "$SRC" "$DB"
export DATABASE_URL="file:$DB" DATABASE_AUTH_TOKEN=local-file
cd "$HERE"

snap() {
  python3 - "$DB" "$1" <<'PY'
import sqlite3, sys, json
c = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True)
cols = [r[1] for r in c.execute("pragma table_info(crew_applications)")]
keep = [k for k in ["id","email","created_at","utm_source","utm_medium","utm_campaign","utm_content","utm_term","referral_code_used","consent_version","required_consent_at","consent_at"] if k in cols]
rows = [dict(zip(keep, r)) for r in c.execute(f"select {','.join(keep)} from crew_applications order by id")]
tables = c.execute("select count(*) from sqlite_master where type='table'").fetchone()[0]
counts = {t: c.execute(f"select count(*) from {t}").fetchone()[0] for t in ["crew_applications","crew_people","crew_outbox","crew_audit","ops_events","ops_templates"] if t in [r[0] for r in c.execute("select name from sqlite_master where type='table'")]}
json.dump({"keep": keep, "rows": rows, "tables": tables, "counts": counts}, open(sys.argv[2], "w"), default=str)
print(f"  tables={tables} counts={counts}")
PY
}
fail() { echo "FAIL: $*"; exit 1; }

echo "== before"; snap "$WORK/before.json"
echo "== migrate #1"; bunx drizzle-kit migrate >"$WORK/migrate1.log" 2>&1 || { cat "$WORK/migrate1.log"; fail "migrate"; }
snap "$WORK/m1.json"
echo "== migrate #2 (must be a no-op)"; bunx drizzle-kit migrate >"$WORK/migrate2.log" 2>&1 || { cat "$WORK/migrate2.log"; fail "migrate 2"; }
snap "$WORK/m2.json"
cmp -s <(python3 -c "import json;d=json.load(open('$WORK/m1.json'));print(d['tables'],d['counts'])") <(python3 -c "import json;d=json.load(open('$WORK/m2.json'));print(d['tables'],d['counts'])") || fail "second migrate changed the DB"
echo "== backfill dry-run"; bun scripts/backfill-v2.ts --dry-run | tail -5
snap "$WORK/dry.json"
cmp -s <(python3 -c "import json;print(json.load(open('$WORK/m2.json'))['counts'])") <(python3 -c "import json;print(json.load(open('$WORK/dry.json'))['counts'])") || fail "dry-run wrote"
echo "== backfill apply"; bun scripts/backfill-v2.ts | tail -5; snap "$WORK/b1.json"
echo "== backfill re-apply (must change nothing)"; bun scripts/backfill-v2.ts | tail -3; snap "$WORK/b2.json"
cmp -s <(python3 -c "import json;print(json.load(open('$WORK/b1.json'))['counts'])") <(python3 -c "import json;print(json.load(open('$WORK/b2.json'))['counts'])") || fail "backfill not idempotent"
echo "== seed-planning #1"; bun scripts/seed-planning.ts | tail -5; snap "$WORK/s1.json"
echo "== seed-planning #2 (must change nothing)"; bun scripts/seed-planning.ts | tail -3; snap "$WORK/s2.json"
cmp -s <(python3 -c "import json;print(json.load(open('$WORK/s1.json'))['counts'])") <(python3 -c "import json;print(json.load(open('$WORK/s2.json'))['counts'])") || fail "seed not idempotent"
python3 - "$WORK/before.json" "$WORK/s2.json" <<'PY' || exit 1
import json, sys
a, b = json.load(open(sys.argv[1])), json.load(open(sys.argv[2]))
before = {r["id"]: r for r in a["rows"]}
after = {r["id"]: r for r in b["rows"]}
missing = [i for i in before if i not in after]
changed = [(i, k) for i in before if i in after for k in a["keep"] if k in after[i] and before[i][k] != after[i][k]]
print(f"  legacy rows before={len(before)} preserved={len(before) - len(missing)} changed_fields={len(changed)}")
if missing or changed:
    print("FAIL: legacy data not preserved", missing[:5], changed[:5]); sys.exit(1)
PY
echo "PASS migration rehearsal ($WORK)"

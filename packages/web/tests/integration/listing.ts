/**
 * Applicant listing suite — keyset pagination, filters and population totals.
 * In-process, real auth + oRPC, FRESH disposable DB.
 *
 *   cd packages/web && env -u DATABASE_URL -u DATABASE_AUTH_TOKEN bun tests/integration/listing.ts
 *
 * 12 applications are submitted through the public procedure inside the same
 * second, so the cursor's id tie-break is exercised (created_at is stored in
 * whole seconds).
 */
const H = await import("./harness");
const { client, rpc, signUp, bootstrapAdmin, outcome, cleanup } = H;
const P = await import("./pipeline");
const { recorder } = await import("../e2e/helpers");

const { check, report } = recorder();

try {
  const adminAcct = await signUp("admin");
  await bootstrapAdmin(adminAcct.userId);
  const admin = client(adminAcct.token);
  const recAcct = await signUp("recruiter");
  const plainAcct = await signUp("plain");
  await admin.staff.grant({ email: recAcct.email, role: "recruiter", eventId: null, departmentKey: null });
  const recruiter = client(recAcct.token);

  // 8 hosts + 4 promoters
  const roles = [...Array(8).fill("host"), ...Array(4).fill("promoter")] as ("host" | "promoter")[];
  // Sequential on purpose: a local libSQL *file* DB has no busy timeout, so
  // parallel distinct-email submits can hit SQLITE_BUSY (fail-safe 500 with a
  // "please try again" message; nothing partial is stored). See RUNBOOK_V2.md.
  const tag = Date.now().toString(36);
  const submitted = [];
  for (const [i, r] of roles.entries()) submitted.push(await rpc("crew/submit", P.applicationPayload(`list.${i}.${tag}@example.com`, r)));
  check("12 submissions accepted", submitted.filter((s) => s.status === 200).length, 12);

  // ---------------------------------------------------------------- access
  check("anonymous list -> UNAUTHORIZED", await outcome(client().recruiting.list({ limit: 5 })), "UNAUTHORIZED");
  check("non-staff list -> FORBIDDEN", await outcome(client(plainAcct.token).recruiting.list({ limit: 5 })), "FORBIDDEN");
  check("limit > 200 -> BAD_REQUEST", await outcome(recruiter.recruiting.list({ limit: 201 })), "BAD_REQUEST");
  check("limit 0 -> BAD_REQUEST", await outcome(recruiter.recruiting.list({ limit: 0 })), "BAD_REQUEST");

  // ---------------------------------------------------------------- full walk
  const seen: string[] = [];
  const matching = new Set<number>();
  let cursor: string | null = null;
  let pages = 0;
  do {
    const page = await recruiter.recruiting.list({ limit: 5, cursor });
    pages++;
    for (const r of page.rows) seen.push(String((r as { id: string }).id));
    matching.add(page.totals.matching);
    check(`page ${pages} size <= limit`, page.rows.length <= 5, true);
    cursor = page.nextCursor;
  } while (cursor && pages < 10);
  check("walk takes 3 pages for 12 rows at limit 5", pages, 3);
  check("walk returns every row", seen.length, 12);
  check("walk has no duplicates (same-second id tie-break)", new Set(seen).size, 12);
  check("totals.matching identical on every page", [...matching].join(","), "12");
  const last = await recruiter.recruiting.list({ limit: 12 });
  check("exact-fit page has no nextCursor", last.nextCursor, "null");
  check("ordering is stable between walk and single page", last.rows.map((r) => (r as { id: string }).id).join(",") === seen.join(","), true);

  // ---------------------------------------------------------------- filters + totals
  const promo = await recruiter.recruiting.list({ limit: 2, role: ["promoter"] });
  check("role filter: matching counts the whole filtered population", promo.totals.matching, 4);
  check("role filter: population counts everything", promo.totals.population, 12);
  check("role filter: page holds only promoters", promo.rows.every((r) => (r as { role_interest: string }).role_interest === "promoter"), true);
  check("role filter: byRole only promoter", JSON.stringify(promo.totals.byRole), JSON.stringify({ promoter: 4 }));
  let pCursor = promo.nextCursor;
  let pSeen = promo.rows.length;
  while (pCursor) {
    const p = await recruiter.recruiting.list({ limit: 2, role: ["promoter"], cursor: pCursor });
    pSeen += p.rows.length;
    pCursor = p.nextCursor;
  }
  check("filtered walk returns exactly the filtered set", pSeen, 4);
  const all = await recruiter.recruiting.list({ limit: 1 });
  check("unfiltered byStatus sums to population", Object.values(all.totals.byStatus).reduce((a, b) => a + b, 0), 12);
  const none = await recruiter.recruiting.list({ limit: 5, q: "zz-no-such-person" });
  check("search with no matches -> 0 rows, null cursor", `${none.rows.length}|${none.nextCursor}`, "0|null");
  const plain = await recruiter.recruiting.list({ limit: 50, q: "hana" });
  check("name search matches the 8 host fixtures", plain.totals.matching, 8);
  const wild = await recruiter.recruiting.list({ limit: 50, q: "hana%fixture" });
  check("LIKE wildcards in search are stripped, not interpreted", wild.totals.matching, 0);
  check("over-long search -> BAD_REQUEST", await outcome(recruiter.recruiting.list({ limit: 5, q: "x".repeat(81) })), "BAD_REQUEST");
  const garbage = await recruiter.recruiting.list({ limit: 5, cursor: "not-a-cursor" });
  check("undecodable cursor falls back to first page (no error, no leak)", garbage.rows.length, 5);
} finally {
  report("applicant listing integration");
  cleanup();
}

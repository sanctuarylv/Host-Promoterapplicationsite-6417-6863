/**
 * Cutover safety suite — in-process, real auth + oRPC, FRESH disposable DB,
 * two STRICT local mocks of the PROPOSED Command Center contract.
 *
 *   cd packages/web && env -u DATABASE_URL -u DATABASE_AUTH_TOKEN bun tests/integration/cutover.ts
 *
 * What a pass means: this build can never hand canonical ownership to Command
 * Center. Cutover is refused, a stored cutover setting is ignored, and a round
 * trip only counts when its receipt was issued by the endpoint configured now.
 * It does NOT mean a real Command Center exists — none has been provided.
 */
const H = await import("./harness");
const { client, db, S, signUp, bootstrapAdmin, outcome, rpc, cleanup } = H;
const P = await import("./pipeline");
const { eq, and } = await import("drizzle-orm");
const { recorder } = await import("../e2e/helpers");
const { startStrictMock } = await import("./strict-cc-mock");
const { CANONICAL_ADAPTER, endpointFingerprint, getIntegrationState } = await import("../../src/api/crew/integration");
const { setSetting } = await import("../../src/api/shared/settings");
const { PROPOSED_CONTRACT_ID } = await import("../../src/api/crew/command-center");

const { check, report } = recorder();
const API_KEY = "test-only-not-a-secret";
const SIGNING = "test-only-signing";
const mockA = startStrictMock({ apiKey: API_KEY, signingSecret: SIGNING, contractId: PROPOSED_CONTRACT_ID });
const mockB = startStrictMock({ apiKey: API_KEY, signingSecret: SIGNING, contractId: PROPOSED_CONTRACT_ID });

// Config is read per call, so switching to forward mode after the harness loads is safe.
Object.assign(process.env, {
  CREW_SUBMISSION_MODE: "forward",
  COMMAND_CENTER_API_BASE_URL: mockA.url,
  COMMAND_CENTER_APPLICATIONS_PATH: "/proposed/crew/applications",
  COMMAND_CENTER_STATUS_PATH: "/proposed/crew/applications/{id}/status-events",
  COMMAND_CENTER_API_KEY: API_KEY,
  COMMAND_CENTER_SIGNING_SECRET: SIGNING,
  COMMAND_CENTER_TIMEOUT_MS: "1500",
});

async function submitAndSync(label: string) {
  const email = `cutover.${label}.${Date.now().toString(36)}@example.com`;
  const sub = await rpc("crew/submit", P.applicationPayload(email, "host"));
  if (sub.status !== 200) throw new Error(`submit -> ${sub.status} ${sub.message}`);
  const [app] = await db.select({ id: S.crewApplications.id }).from(S.crewApplications).where(eq(S.crewApplications.email_normalized, email));
  const [row] = await db
    .select()
    .from(S.crewOutbox)
    .where(and(eq(S.crewOutbox.aggregate_id, app!.id), eq(S.crewOutbox.operation, "application.create")));
  return row!;
}

try {
  const adminAcct = await signUp("admin");
  await bootstrapAdmin(adminAcct.userId);
  const admin = client(adminAcct.token);
  const recruiterAcct = await signUp("recruiter");
  await admin.staff.grant({ email: recruiterAcct.email, role: "recruiter", eventId: null, departmentKey: null });
  const recruiter = client(recruiterAcct.token);

  check("adapter is marked not implemented in this build", CANONICAL_ADAPTER.implemented, false);

  // ---- a receipt issued by the configured endpoint (mock A) ------------------
  const r1 = await submitAndSync("a");
  check("submit synced inline to mock A", `${r1.status}|${Boolean(r1.receipt_id)}`, "synced|true");
  const [syncedAudit] = await db
    .select({ data: S.crewAudit.data })
    .from(S.crewAudit)
    .where(and(eq(S.crewAudit.entity_id, r1.id), eq(S.crewAudit.action, "outbox.synced")));
  check("synced audit binds receipt to issuing endpoint", syncedAudit?.data?.endpoint, endpointFingerprint());

  check("recruiter cannot record a round trip", await outcome(recruiter.integration.recordRoundTrip({ outboxId: r1.id, environment: "local mock" })), "FORBIDDEN");
  check("admin records round trip for a receipt from THIS endpoint", await outcome(admin.integration.recordRoundTrip({ outboxId: r1.id, environment: "local mock" })), "OK");

  let st = await getIntegrationState();
  check("round trip recorded → still pending (adapter absent)", `${st.mode}|${Boolean(st.roundTrip)}`, "pending|true");
  check("pending reason is the adapter reason", st.reason, CANONICAL_ADAPTER.reason);
  check("cutover not available", `${st.cutoverAvailable}|${st.cutoverBlockedReason === CANONICAL_ADAPTER.reason}`, "false|true");

  // ---- cutover refused before any other check -------------------------------
  const rec = await admin.integration.reconcile();
  const cut = admin.integration.recordCutover({ fingerprint: rec.fingerprint, acknowledgeQuarantine: rec.quarantine, confirm: "CUTOVER" });
  let msg = "";
  check("recordCutover with a valid fingerprint → PRECONDITION_FAILED", await outcome(cut.catch((e) => ((msg = e.message), Promise.reject(e)))), "PRECONDITION_FAILED");
  check("refusal carries the adapter reason", msg, CANONICAL_ADAPTER.reason);
  const cutAudit = await db.select().from(S.crewAudit).where(eq(S.crewAudit.action, "integration.cutover_recorded"));
  check("no cutover audit row written", cutAudit.length, 0);

  // ---- a stored cutover setting is ignored ----------------------------------
  await setSetting("cc_cutover", { at: new Date().toISOString(), by: "it", reconciliationId: rec.fingerprint, acknowledgedCount: 0 }, "it");
  st = await getIntegrationState();
  check("stored cc_cutover is ignored (cutover null)", st.cutover, null);
  check("stored cc_cutover cannot make it connected", st.mode, "pending");
  const viaApi = (await admin.integration.state()) as { mode: string; cutover: unknown };
  check("API state agrees (pending, no cutover)", `${viaApi.mode}|${viaApi.cutover}`, "pending|null");

  // ---- receipts are bound to the endpoint that issued them ------------------
  process.env.COMMAND_CENTER_API_BASE_URL = mockB.url;
  st = await getIntegrationState();
  check("repointing to mock B invalidates mock-A round trip", `${st.mode}|${st.staleRoundTrip}`, "pending|true");
  check(
    "mock-A receipt cannot be recorded as a round trip for mock B",
    await outcome(admin.integration.recordRoundTrip({ outboxId: r1.id, environment: "mock B" })),
    "PRECONDITION_FAILED",
  );
  const r2 = await submitAndSync("b");
  check("submit synced to mock B", r2.status, "synced");
  check("mock-B receipt records for mock B", await outcome(admin.integration.recordRoundTrip({ outboxId: r2.id, environment: "mock B" })), "OK");

  // A row hand-edited to look synced has no issuing-endpoint evidence.
  const r3 = await submitAndSync("c");
  await db.delete(S.crewAudit).where(and(eq(S.crewAudit.entity_id, r3.id), eq(S.crewAudit.action, "outbox.synced")));
  check("synced row without endpoint evidence is refused", await outcome(admin.integration.recordRoundTrip({ outboxId: r3.id, environment: "mock B" })), "PRECONDITION_FAILED");
  // A receipt id swapped in after sync does not match the audited one.
  await db.update(S.crewOutbox).set({ receipt_id: "rcpt_forged" }).where(eq(S.crewOutbox.id, r2.id));
  check("receipt id not matching the audited receipt is refused", await outcome(admin.integration.recordRoundTrip({ outboxId: r2.id, environment: "mock B" })), "PRECONDITION_FAILED");

  st = await getIntegrationState();
  check("end state: still pending, never connected", st.mode, "pending");
} catch (e) {
  check("SUITE ERROR", String((e as Error)?.stack ?? e), "no error");
} finally {
  mockA.stop();
  mockB.stop();
  report("cutover safety integration");
  cleanup();
  process.exit(process.exitCode ?? 0);
}

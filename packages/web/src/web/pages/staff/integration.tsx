import { useState } from "react";
import { Btn, Empty, ErrorNote, Loading, PageTitle, Panel, SelectField, Stat, Tag, TextField, fmtDate, humanize } from "../../components/console/ui";
import { usePageMeta } from "../../hooks/use-page-meta";
import { useDrainNow, useIntegrationAudit, useIntegrationState, useReadiness, useOutbox, useReconcile, useRecordCutover, useRecordRoundTrip, useRetryOutbox } from "../../queries/integration";

const STATUSES = ["held", "pending", "processing", "synced", "failed", "dead"] as const;
type OutboxStatus = (typeof STATUSES)[number];

function Outbox() {
  const [status, setStatus] = useState<OutboxStatus | "">("");
  const [cursors, setCursors] = useState<string[]>([]);
  const cursor = cursors[cursors.length - 1];
  const q = useOutbox({ status: status || undefined, cursor, limit: 25 });
  const retry = useRetryOutbox();
  const rt = useRecordRoundTrip();
  const [retrying, setRetrying] = useState<{ id: string; reason: string } | null>(null);
  const [env, setEnv] = useState("");
  return (
    <Panel id="outbox" title="Outbox" eyebrow="Changes queued for Command Center. Held rows are not sent.">
      <div className="flex flex-wrap items-end gap-3">
        <SelectField
          label="Status"
          options={[["", "All"], ...STATUSES.map((s) => [s, humanize(s)] as [string, string])]}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as OutboxStatus | "");
            setCursors([]);
          }}
        />
        <TextField label="Environment label (for round-trip records)" placeholder="e.g. cc-staging" value={env} onChange={(e) => setEnv(e.target.value)} />
      </div>
      {q.isPending ? (
        <Loading />
      ) : q.error || !q.data ? (
        <ErrorNote error={q.error} />
      ) : q.data.rows.length === 0 ? (
        <Empty>No outbox rows match.</Empty>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="cx-table min-w-[820px]">
            <caption className="sr-only">Outbox entries</caption>
            <thead>
              <tr>
                <th scope="col">Operation</th>
                <th scope="col">Record</th>
                <th scope="col">Status</th>
                <th scope="col">Attempts</th>
                <th scope="col">Last error</th>
                <th scope="col">Created</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {q.data.rows.map((r) => (
                <tr key={r.id}>
                  <td className="font-mono text-xs">
                    {r.operation} v{r.opVersion}
                  </td>
                  <td className="font-mono text-xs">
                    {r.aggregateType}:{r.aggregateId.slice(0, 8)}
                  </td>
                  <td>
                    <Tag tone={r.status === "synced" ? "solid" : r.status === "dead" || r.status === "failed" ? "warn" : "muted"}>{r.status}</Tag>
                  </td>
                  <td className="tabular-nums">
                    {r.attempts}/{r.maxAttempts}
                  </td>
                  <td className="max-w-60 text-xs">{r.lastError ? `${r.lastErrorClass ?? ""} ${r.lastError}` : "—"}</td>
                  <td className="text-xs">{fmtDate(r.createdAt)}</td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {(r.status === "failed" || r.status === "dead") && (
                        <Btn size="sm" variant="ghost" onClick={() => setRetrying({ id: r.id, reason: "" })}>
                          Retry
                        </Btn>
                      )}
                      {r.status === "synced" && r.receiptId && r.canonicalId && (
                        <Btn size="sm" variant="ghost" disabled={env.trim().length < 2} busy={rt.isPending} onClick={() => rt.mutate({ outboxId: r.id, environment: env.trim() })}>
                          Record round trip
                        </Btn>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <Btn size="sm" disabled={!cursors.length} onClick={() => setCursors(cursors.slice(0, -1))}>
          Newer
        </Btn>
        <Btn size="sm" disabled={!q.data?.nextCursor} onClick={() => q.data?.nextCursor && setCursors([...cursors, q.data.nextCursor])}>
          Older
        </Btn>
      </div>
      {retrying && (
        <form
          className="mt-3 flex flex-wrap items-end gap-2 border border-white/15 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            retry.mutate(retrying, { onSuccess: () => setRetrying(null) });
          }}
        >
          <TextField className="min-w-60 flex-1" label="Reason for manual retry" required minLength={3} value={retrying.reason} onChange={(e) => setRetrying({ ...retrying, reason: e.target.value })} />
          <Btn type="submit" variant="solid" busy={retry.isPending}>
            Queue retry
          </Btn>
          <Btn variant="ghost" onClick={() => setRetrying(null)}>
            Cancel
          </Btn>
        </form>
      )}
      <ErrorNote error={retry.error ?? rt.error} className="mt-2" />
    </Panel>
  );
}

function Reconcile({ quarantineDefault, cutoverBlocked }: { quarantineDefault?: number; cutoverBlocked: string | null }) {
  const rec = useReconcile();
  const cut = useRecordCutover();
  const [ack, setAck] = useState("");
  const [confirm, setConfirm] = useState("");
  const r = rec.data;
  return (
    <Panel id="reconcile" title="Reconciliation & cutover" eyebrow="Dry run only — nothing is migrated or sent">
      <Btn busy={rec.isPending} onClick={() => rec.mutate({})}>
        Run reconciliation dry run
      </Btn>
      <ErrorNote error={rec.error} className="mt-2" />
      {r && (
        <div className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Local applications" value={r.total} />
            <Stat label="Would transfer" value={r.transfer} hint={`of ${r.total}`} />
            <Stat label="Quarantine" value={r.quarantine} hint={`of ${r.total} — need human review`} />
            <Stat label="Already canonical" value={r.alreadyCanonical} hint={`of ${r.total}`} />
          </div>
          <p className="text-sm text-white/75">Canonical comparison: {r.canonicalComparison}</p>
          <p className="break-all font-mono text-xs text-white/65">Fingerprint {r.fingerprint}</p>
          <details>
            <summary className="min-h-11 cursor-pointer py-2 text-sm">Items ({r.items.length})</summary>
            <ul className="mt-2 max-h-80 space-y-1 overflow-y-auto text-xs"
              // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable region must be keyboard-focusable (axe scrollable-region-focusable, WCAG 2.1.1)
              tabIndex={0}
              aria-label="Reconciliation preview — scroll vertically">
              {r.items.map((i) => (
                <li key={i.id} className="border border-white/10 px-3 py-1.5">
                  <Tag tone={i.action === "quarantine" ? "warn" : "muted"}>{i.action}</Tag> <span className="font-mono">{i.id.slice(0, 8)}</span> · {humanize(i.localStatus)}
                  {i.legacyStatus ? ` (legacy ${i.legacyStatus})` : ""} · outbox {i.outbox}
                  {i.conflicts.length > 0 && <span className="block text-white/65">{i.conflicts.map(humanize).join(", ")}</span>}
                </li>
              ))}
            </ul>
          </details>
          {cutoverBlocked ? (
            <output className="block border-t border-white/10 pt-4 text-sm text-amber-200/90">
              {cutoverBlocked}. The dry run above is still useful for review; nothing can be cut over yet.
            </output>
          ) : (
          <form
            className="grid gap-3 border-t border-white/10 pt-4 sm:grid-cols-3 sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              if (confirm === "CUTOVER") cut.mutate({ fingerprint: r.fingerprint, acknowledgeQuarantine: Number(ack), confirm: "CUTOVER" });
            }}
          >
            <TextField label={`Acknowledge quarantined count (${r.quarantine})`} required inputMode="numeric" value={ack} placeholder={String(quarantineDefault ?? "")} onChange={(e) => setAck(e.target.value)} />
            <TextField label='Type "CUTOVER" to confirm' required autoComplete="off" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            <Btn type="submit" variant="solid" disabled={confirm !== "CUTOVER"} busy={cut.isPending}>
              Record cutover boundary
            </Btn>
            <p className="text-xs text-white/60 sm:col-span-3">Requires a verified round trip from a real Command Center acknowledgement. It records a boundary only; no data is moved.</p>
            <ErrorNote error={cut.error} className="sm:col-span-3" />
          </form>
          )}
        </div>
      )}
    </Panel>
  );
}

function Audit() {
  const q = useIntegrationAudit();
  return (
    <Panel id="audit" title="Audit log" eyebrow="Latest 50 entries">
      {q.isPending ? (
        <Loading />
      ) : q.error || !q.data ? (
        <ErrorNote error={q.error} />
      ) : q.data.length === 0 ? (
        <Empty>No audit entries.</Empty>
      ) : (
        <ul className="max-h-[28rem] space-y-1 overflow-y-auto text-xs"
          // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable region must be keyboard-focusable (axe scrollable-region-focusable, WCAG 2.1.1)
          tabIndex={0}
          aria-label="Audit entries — scroll vertically">
          {q.data.map((a) => (
            <li key={a.id} className="border border-white/10 px-3 py-1.5">
              <span className="text-white/65">{fmtDate(a.created_at)}</span> · <span className="font-medium">{a.action}</span> · {a.entity_type}:{a.entity_id.slice(0, 8)} · {a.actor_label}
              {a.from_value || a.to_value ? ` · ${a.from_value ?? "—"} → ${a.to_value ?? "—"}` : ""}
              {a.note && <span className="block text-white/65">{a.note}</span>}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

const READINESS_LABEL = {
  pass: "Pass",
  blocked_user: "Blocked — user input required",
  blocked_external: "Blocked — external system",
  not_started: "Not started",
} as const;

function Readiness() {
  const q = useReadiness();
  return (
    <Panel id="readiness" title="Production readiness" eyebrow="Configuration presence only — no secret values or IP addresses are shown">
      {q.isPending ? (
        <Loading />
      ) : q.error || !q.data ? (
        <ErrorNote error={q.error} />
      ) : (
        <>
          <p className="text-sm text-white/75">
            Canonical domain: <span className="font-mono">{q.data.canonicalOrigin}</span> · Trusted auth origins: <span className="font-mono text-xs">{q.data.trustedOrigins.join(", ")}</span>
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="cx-table min-w-[720px]" data-testid="readiness-table">
              <caption className="sr-only">Production readiness checks</caption>
              <thead>
                <tr>
                  <th scope="col">Check</th>
                  <th scope="col">State</th>
                  <th scope="col">Detail</th>
                </tr>
              </thead>
              <tbody>
                {q.data.checks.map((c) => (
                  <tr key={c.key} data-check={c.key} data-state={c.state}>
                    <td>{c.label}</td>
                    <td>
                      <Tag tone={c.state === "pass" ? "solid" : c.state === "not_started" ? "muted" : "warn"}>{READINESS_LABEL[c.state]}</Tag>
                    </td>
                    <td className="text-xs text-white/75">{c.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Panel>
  );
}

export default function IntegrationPage() {
  usePageMeta("Integration · Staff", { noindex: true });
  const q = useIntegrationState();
  const drain = useDrainNow();
  if (q.isPending) return <Loading />;
  if (q.error || !q.data) return <ErrorNote error={q.error} />;
  const s = q.data;
  const count = (st: string) => s.outbox.byStatus.filter((b) => b.status === st).reduce((n, b) => n + b.n, 0);
  return (
    <div className="space-y-6">
      <PageTitle eyebrow="Command Center" title="Integration" />
      <p className="max-w-3xl text-sm text-white/75">
        Command Center owns canonical hiring, assignment and booking decisions. This app is an intake store and outbox. The mode above is derived from evidence (configuration, a verified round trip and a recorded cutover) and cannot be set by hand. Contract: {s.contract}.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Submission mode" value={humanize(s.submissionMode)} hint={s.configured.forward ? "Forwarding configured" : "Forwarding not configured"} />
        <Stat label="Referral validation" value={humanize(s.referralMode)} hint={s.configured.referralLookup ? "Lookup configured" : "Lookup not configured"} />
        <Stat label="Round trip" value={s.roundTrip ? "Verified" : "Not verified"} hint={s.roundTrip ? `${s.roundTrip.environment} · ${fmtDate(s.roundTrip.at)}` : "Needs a real Command Center acknowledgement"} />
        <Stat label="Cutover" value={s.cutover ? "Recorded" : "Not recorded"} hint={s.cutover ? fmtDate(s.cutover.at) : undefined} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {STATUSES.map((st) => (
          <Stat key={st} label={humanize(st)} value={count(st)} />
        ))}
      </div>
      <p className="text-sm text-white/75">Applications without a canonical Command Center id: {s.outbox.applicationsWithoutCanonicalId}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Btn busy={drain.isPending} onClick={() => drain.mutate({})}>
          Send due entries now
        </Btn>
        {drain.data && <output className="text-sm">Processed {drain.data.processed}.</output>}
        <span className="text-xs text-white/60">Only works in forward mode with a complete configuration. Otherwise nothing is sent.</span>
      </div>
      <ErrorNote error={drain.error} />
      <Readiness />
      <Outbox />
      <Reconcile cutoverBlocked={s.cutoverBlockedReason} />
      <Audit />
    </div>
  );
}

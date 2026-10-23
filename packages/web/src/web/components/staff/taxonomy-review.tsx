import type { ReactNode } from "react";
import type { Integrity } from "../../../api/ops/staffing/integrity";
import type { TaxonomyReview } from "../../../api/ops/staffing/review";
import { Panel, Stat, Tag, humanize } from "../console/ui";

/**
 * Phase 3 operational review panels for /staff/taxonomy. Display only: there
 * are no inputs, checkboxes or buttons. Human sign-off is recorded outside the
 * application (docs/PRODUCTION_APPROVAL_PACKAGE_V3.md).
 */

export function Table({ caption, head, children, testId, min = 720 }: { caption: string; head: string[]; children: ReactNode; testId: string; min?: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="cx-table" style={{ minWidth: min }} data-testid={testId}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

const mono = (s: string | null | undefined) => (s ? <span className="font-mono text-xs">{s}</span> : <span className="text-white/60">—</span>);
const statusTone = (s: string) => (s === "mapped" || s === "pass" ? "solid" : s === "unresolved" || s === "fail" ? "warn" : s === "not_available" ? "muted" : "default");
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

function Groups({ label, groups }: { label: string; groups: { key: string; roles: number; seats: number }[] }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-white/60">{label}</p>
      <ul className="mt-1 flex flex-wrap gap-2 text-xs">
        {groups.map((g) => (
          <li key={g.key}>
            <Tag tone="muted">
              {humanize(g.key)}: {g.roles} roles · {g.seats} seats
            </Tag>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RoleReviewPanel({ review }: { review: TaxonomyReview["role_review"] }) {
  const t = review.totals;
  return (
    <Panel id="role-review" title={`Role review — ${t.roles} roles · ${t.seats} baseline seats`} eyebrow="Every canonical role, its seats, mapping, reporting line and open review items">
      <div className="grid gap-3 sm:grid-cols-3" data-testid="role-review-totals">
        <Stat label="Canonical roles" value={t.roles} hint={`Plan: ${t.plan_roles}`} />
        <Stat label="Baseline seats" value={t.seats} hint={`Plan: ${t.plan_seats} · planning baseline, not assignments`} />
        <Stat label="Rows reconcile to plan" value={t.balances ? "Yes" : "No"} />
      </div>
      <div className="mt-3 space-y-2">
        <Groups label="By headcount model" groups={review.by_model} />
        <Groups label="By match" groups={review.by_match} />
        <Groups label="By department" groups={review.by_department} />
      </div>
      <div className="mt-3">
        <Table
          caption="Canonical role review"
          testId="role-review"
          min={1280}
          head={["#", "Canonical ID", "Role", "Department", "Model", "Seats", "v1 seats", "Match", "Reports to", "Credential", "Training", "vNext", "Review items"]}
        >
          {review.rows.map((r) => (
            <tr key={r.canonical_role_id} data-role={r.role_key} data-seats={r.baseline_headcount}>
              <td>{r.seq}</td>
              <td className="font-mono text-xs">{r.canonical_role_id}</td>
              <td>
                {r.display_name}
                <div className="font-mono text-xs text-white/60">{r.role_key}</div>
              </td>
              <td className="text-xs">{humanize(r.department_key)}</td>
              <td className="text-xs">{humanize(r.headcount_model)}</td>
              <td>{r.baseline_headcount}</td>
              <td>{r.v1_count ?? "—"}</td>
              <td>
                <Tag tone={r.match === "new" ? "default" : "muted"}>{r.match}</Tag>
              </td>
              <td>
                {mono(r.reports_to_resolved)}
                {r.supervisor_change && <div className="text-xs text-white/60">was {r.supervisor_change.from ?? "none"}</div>}
              </td>
              <td>
                <Tag tone={statusTone(r.credential_status)}>{r.credential_status}</Tag>
              </td>
              <td>
                <Tag tone={statusTone(r.training_status)}>{r.training_status}</Tag>
              </td>
              <td className="text-xs">
                {r.vnext_change ? humanize(r.vnext_change) : "—"}
                {r.vnext_count !== null && ` · ${r.vnext_count}`}
              </td>
              <td className="text-xs text-white/75">{r.flags.join(" · ") || "—"}</td>
            </tr>
          ))}
        </Table>
      </div>
    </Panel>
  );
}

export function RunnerDecisionPanel({ d }: { d: TaxonomyReview["runner_decision"] }) {
  return (
    <Panel id="runner-decision" title="Decision required: Runner" eyebrow="Unresolved — documented human decision required. The system does not infer a classification.">
      <div data-testid="runner-decision" data-classification={d.classification} data-decision={d.decision ?? "none"} className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Tag tone="warn">{humanize(d.classification)}</Tag>
          <Tag tone="warn">{humanize(d.status)}</Tag>
          <span className="text-sm">
            Decision recorded: <strong data-testid="runner-decision-value">None</strong>
          </span>
        </div>
        <p className="text-sm">{d.question}</p>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-white/60">After Dark v1</dt>
            <dd>
              {d.current.v1_title} · {d.current.v1_count ?? "unknown"} seats · reports to {mono(d.current.v1_supervisor)} · zones {mono(d.current.v1_zones.join(", "))} · workforce{" "}
              {humanize(d.current.v1_workforce)}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-white/60">vNext preview</dt>
            <dd>
              {humanize(d.current.vnext_change)} · {d.current.vnext_count ?? "—"} seats
            </dd>
          </div>
          {d.related_canonical && (
            <div className="sm:col-span-2">
              <dt className="text-xs uppercase tracking-wide text-white/60">Related canonical role (not a mapping)</dt>
              <dd>
                {d.related_canonical.display_name} ({d.related_canonical.canonical_role_id}) · baseline {d.related_canonical.baseline_headcount} · relation{" "}
                <span className="font-mono text-xs">{d.related_canonical.relation}</span>
              </dd>
            </div>
          )}
          <div className="sm:col-span-2">
            <dt className="text-xs uppercase tracking-wide text-white/60">Decision owner</dt>
            <dd>{d.decision_owner}</dd>
          </div>
        </dl>
        <div>
          <p className="text-xs uppercase tracking-wide text-white/60">Options on record (fixed reference order, not a ranking; none preferred)</p>
          <ol className="mt-2 space-y-2 text-sm" data-testid="runner-options">
            {d.options.map((o, i) => (
              <li key={o.key} data-option={o.key} className="border border-white/20 px-3 py-2">
                <p className="font-semibold">
                  {String.fromCharCode(65 + i)}. {o.label}
                </p>
                <p className="text-white/80">{o.effect}</p>
                <p className="mt-1 text-xs text-white/60">Requires: {o.requires.join(" · ")}</p>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-white/60">Preserved until a decision is documented</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-white/80">
            {d.preserved.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
        <p className="text-sm font-semibold">{d.note}</p>
      </div>
    </Panel>
  );
}

function TokenList({ tokens }: { tokens: { token: string; kind: string; zones: string[] }[] }) {
  return (
    <ul className="flex flex-wrap gap-1">
      {tokens.map((t) => (
        <li key={t.token}>
          <Tag tone={t.kind === "zone" ? "solid" : t.kind === "descriptor" ? "muted" : "warn"}>
            {t.token} · {t.kind}
          </Tag>
        </li>
      ))}
    </ul>
  );
}

export function CredentialReviewPanel({ review }: { review: TaxonomyReview["credential_review"] }) {
  const c = review.counts;
  return (
    <Panel
      id="credential-review"
      title={`Credential reconciliation review (${review.rows.length})`}
      eyebrow={`Mapped ${c.mapped} · partial ${c.partial} · unresolved ${c.unresolved}. Proposals only — no credential, zone or permission is granted.`}
    >
      <Table caption="Credential reconciliation review" testId="credential-review" min={1180} head={["Canonical ID", "Role", "Status", "Source credential text", "Tokens", "Proposed zones", "v1 zones", "Decision needed", "Granted"]}>
        {review.rows.map((r) => (
          <tr key={r.canonical_role_id} data-role={r.role_key} data-status={r.status}>
            <td className="font-mono text-xs">{r.canonical_role_id}</td>
            <td>
              {r.display_name}
              <div className="font-mono text-xs text-white/60">{r.role_key}</div>
            </td>
            <td>
              <Tag tone={statusTone(r.status)}>{r.status}</Tag>
            </td>
            <td className="text-xs">{r.source_text}</td>
            <td>
              <TokenList tokens={r.tokens} />
            </td>
            <td className="font-mono text-xs">{r.proposed_zones.join(", ") || "none"}</td>
            <td className="font-mono text-xs">{r.v1_zones === null ? "new role" : r.v1_zones.join(", ") || "none"}</td>
            <td className="text-xs text-white/80">
              <ul className="space-y-1">
                {r.decision_needed.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </td>
            <td>No</td>
          </tr>
        ))}
      </Table>
    </Panel>
  );
}

export function TrainingReviewPanel({ review }: { review: TaxonomyReview["training_review"] }) {
  const c = review.counts;
  return (
    <Panel
      id="training-review"
      title={`Training reconciliation review (${review.rows.length})`}
      eyebrow={`Mapped ${c.mapped} · partial ${c.partial} · unresolved ${c.unresolved}. Existing modules: ${review.known_modules.join(", ")}. No training record is created or completed.`}
    >
      <Table caption="Training reconciliation review" testId="training-review" min={1180} head={["Canonical ID", "Role", "Status", "Source requirements", "Matched (phrase → module)", "Unresolved phrases", "v1 modules", "Decision needed", "Completion created"]}>
        {review.rows.map((r) => (
          <tr key={r.canonical_role_id} data-role={r.role_key} data-status={r.status}>
            <td className="font-mono text-xs">{r.canonical_role_id}</td>
            <td>
              {r.display_name}
              <div className="font-mono text-xs text-white/60">{r.role_key}</div>
            </td>
            <td>
              <Tag tone={statusTone(r.status)}>{r.status}</Tag>
            </td>
            <td className="text-xs">{r.source_text}</td>
            <td className="text-xs">
              {r.matched.length ? (
                <ul>
                  {r.matched.map((m) => (
                    <li key={m.phrase}>
                      {m.phrase} → <span className="font-mono">{m.module_key}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                "none"
              )}
            </td>
            <td className="text-xs text-white/80">{r.unresolved_phrases.join("; ")}</td>
            <td className="font-mono text-xs">{r.v1_modules === null ? "new role" : r.v1_modules.join(", ") || "none"}</td>
            <td className="text-xs text-white/80">{r.decision_needed}</td>
            <td>No</td>
          </tr>
        ))}
      </Table>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer">Unresolved requirement index ({review.unresolved_phrase_index.length} distinct phrases)</summary>
        <ul className="mt-2 grid gap-1 text-xs sm:grid-cols-2" data-testid="training-phrase-index">
          {review.unresolved_phrase_index.map((p) => (
            <li key={p.phrase}>
              <strong>{p.phrase}</strong> — {p.roles.length} role{p.roles.length === 1 ? "" : "s"}: <span className="font-mono text-white/70">{p.roles.join(", ")}</span>
            </li>
          ))}
        </ul>
      </details>
    </Panel>
  );
}

export function TemplateComparisonPanel({ cmp }: { cmp: NonNullable<TaxonomyReview["template_comparison"]> }) {
  return (
    <Panel id="template-comparison" title={`After Dark v1 vs vNext — ${cmp.totals.v1} → ${cmp.totals.vnext} seats`} eyebrow={`PREVIEW ONLY — ${cmp.v1_label} stays active. ${cmp.vnext_label}.`}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="comparison-totals">
        <Stat label="After Dark v1 seats" value={cmp.totals.v1} />
        <Stat label="vNext proposed seats" value={cmp.totals.vnext} />
        <Stat label="Difference" value={signed(cmp.totals.delta)} hint={cmp.bridge_balances ? "Bridge balances" : "Bridge does NOT balance"} />
        <Stat label="Baseline seats not enabled" value={cmp.not_enabled_seats} hint={`${cmp.not_enabled.length} roles`} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Table caption="Seat bridge from v1 to vNext" testId="comparison-bridge" min={420} head={["Step", "Seats", "Roles"]}>
          {cmp.bridge.map((b) => (
            <tr key={b.key} data-step={b.key}>
              <td>{b.label}</td>
              <td>{b.key === "v1" ? b.seats : signed(b.seats)}</td>
              <td className="text-xs text-white/75">{b.roles.join(", ") || "—"}</td>
            </tr>
          ))}
          <tr data-step="total">
            <td>
              <strong>vNext total</strong>
            </td>
            <td>
              <strong>{cmp.totals.vnext}</strong>
            </td>
            <td className="text-xs text-white/75">{cmp.bridge_balances ? "Balances" : "Does not balance"}</td>
          </tr>
        </Table>
        <Table caption="Seats by workforce" testId="comparison-workforce" min={360} head={["Workforce", "v1", "vNext"]}>
          {cmp.by_workforce.map((w) => (
            <tr key={w.workforce} data-workforce={w.workforce}>
              <td>{humanize(w.workforce)}</td>
              <td>{w.v1}</td>
              <td>{w.vnext}</td>
            </tr>
          ))}
        </Table>
      </div>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-white/75">
        {cmp.notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
      <div className="mt-3">
        <Table caption="Role-by-role template comparison" testId="comparison-rows" min={900} head={["Role", "Canonical ID", "Workforce", "v1", "vNext", "Δ", "Change"]}>
          {cmp.rows.map((r) => (
            <tr key={r.role_key} data-role={r.role_key} data-change={r.change} data-counted={r.counted ? "yes" : "no"}>
              <td>
                {r.title}
                <div className="font-mono text-xs text-white/60">{r.role_key}</div>
              </td>
              <td className="font-mono text-xs">{r.canonical_role_id ?? "—"}</td>
              <td className="text-xs">{humanize(r.workforce)}</td>
              <td>{r.v1_count ?? "—"}</td>
              <td>{r.vnext_count ?? "—"}</td>
              <td>{r.counted ? signed(r.delta) : "not counted"}</td>
              <td>
                <Tag tone={r.change === "new" ? "solid" : r.change === "not_enabled" ? "muted" : r.change === "changed" ? "warn" : "default"}>{humanize(r.change)}</Tag>
              </td>
            </tr>
          ))}
        </Table>
      </div>
    </Panel>
  );
}

export function ApprovalChecklistPanel({ list, integrity }: { list: TaxonomyReview["approval_checklist"]; integrity: Integrity }) {
  return (
    <Panel id="approval-checklist" title="Operational approval checklist" eyebrow="Automated evidence is not authorization. Human authorizations are recorded outside this application.">
      <div data-testid="approval-checklist" data-production-authorized={String(list.production_authorized)} className="space-y-5">
        <div className="border-2 border-white px-4 py-3">
          <p className="font-bold">
            Production authorized: <span data-testid="production-authorized">No</span>
          </p>
          <p className="mt-1 text-sm text-white/80">{list.summary}</p>
        </div>

        <section aria-labelledby="chk-integrity">
          <h3 id="chk-integrity" className="text-sm font-bold uppercase tracking-wide">
            Baseline integrity
          </h3>
          <p className="mt-1 text-xs text-white/70">
            {integrity.baseline.phase} · commit <span className="font-mono">{integrity.baseline.commit.slice(0, 7)}</span> · {integrity.baseline.plan_basis}
          </p>
          <ul className="mt-2 space-y-1 text-xs" data-testid="integrity-checks">
            {integrity.checks.map((c) => (
              <li key={c.key} data-check={c.key} data-match={String(c.match)}>
                <Tag tone={c.match ? "solid" : "warn"}>{c.match ? "match" : "mismatch"}</Tag> {c.label}
                <div className="mt-0.5 break-all font-mono text-white/70">expected {c.expected}</div>
                <div className="break-all font-mono text-white/70">actual&nbsp;&nbsp; {c.actual ?? "none"}</div>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="chk-auto">
          <h3 id="chk-auto" className="text-sm font-bold uppercase tracking-wide">
            A. Automated readiness evidence (computed now, read-only)
          </h3>
          <ul className="mt-2 space-y-2 text-sm" data-testid="checklist-automated">
            {list.automated.map((a) => (
              <li key={a.key} data-check={a.key} data-status={a.status}>
                <Tag tone={statusTone(a.status)}>{humanize(a.status)}</Tag> {a.label}
                <div className="break-all text-xs text-white/65">{a.evidence}</div>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="chk-recorded">
          <h3 id="chk-recorded" className="text-sm font-bold uppercase tracking-wide">
            B. Recorded verification evidence (run offline — not re-run by this page)
          </h3>
          <ul className="mt-2 space-y-1 text-sm" data-testid="checklist-recorded">
            {list.recorded.map((r) => (
              <li key={r.key} data-check={r.key}>
                {r.label} — <span className="font-mono text-xs">{r.command}</span> <span className="text-xs text-white/60">({r.reference})</span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="chk-human">
          <h3 id="chk-human" className="text-sm font-bold uppercase tracking-wide">
            C. Human authorizations (all pending)
          </h3>
          <Table caption="Human authorizations" testId="checklist-human" min={760} head={["Authorization", "Owner", "Scope", "Status"]}>
            {list.human.map((h) => (
              <tr key={h.key} data-check={h.key} data-status={h.status}>
                <td>{h.label}</td>
                <td className="text-xs">{h.owner}</td>
                <td className="text-xs text-white/75">{h.scope}</td>
                <td>
                  <Tag tone="warn">{humanize(h.status)}</Tag>
                </td>
              </tr>
            ))}
          </Table>
          <p className="mt-2 text-xs text-white/70">Sign-off: {list.sign_off_location}</p>
        </section>
      </div>
    </Panel>
  );
}

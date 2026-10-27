import type { ReactNode } from "react";
import type { DecisionRegister } from "../../../api/ops/staffing/decisions";
import type { Integrity } from "../../../api/ops/staffing/integrity";
import type { ResolutionMatrix } from "../../../api/ops/staffing/resolution";
import type { TaxonomyReview } from "../../../api/ops/staffing/review";
import { Panel, Stat, Tag, humanize } from "../console/ui";

/**
 * Phase 3 operational review panels for /staff/taxonomy. Display only: there
 * are no inputs, checkboxes or buttons. Human sign-off is recorded outside the
 * application (docs/PRODUCTION_APPROVAL_PACKAGE_V3.md).
 */

export function Table({ caption, head, children, testId, min = 720 }: { caption: string; head: string[]; children: ReactNode; testId: string; min?: number }) {
  return (
    <div
      className="overflow-x-auto"
      // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable region must be keyboard-focusable (axe scrollable-region-focusable, WCAG 2.1.1)
      tabIndex={0}
      aria-label={`${caption} table — scroll horizontally`}
    >
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

// ── Phase 4: decision register + resolution matrix (display only) ───────────

const zones = (zs: readonly string[] | null) => (zs === null ? <span className="text-white/60">not in v1</span> : zs.length ? <span className="font-mono text-xs">{zs.join(", ")}</span> : <span className="text-white/60">none</span>);
const DOMAIN_LABEL: Record<string, string> = { sanctuary_lv_group: "Sanctuary LV Group", sanctuary_lv_nonprofit: "Sanctuary LV (nonprofit Serve Team)" };
const domainLabel = (d: string) => DOMAIN_LABEL[d] ?? humanize(d);
const deltaTone = (s: string) => (s === "same" ? "muted" : s === "narrows" || s === "expands" || s === "changes" ? "warn" : "default");

export function DecisionRegisterPanel({ reg }: { reg: DecisionRegister }) {
  const c = reg.counts;
  return (
    <Panel id="decision-register" title={`Operational decision register — ${c.total} decisions · ${c.pending} pending`} eyebrow="Every decision is pending. Nothing here records, recommends or applies a decision.">
      <div data-testid="decision-register" data-production-authorized={String(reg.production_authorized)} data-total={c.total} data-pending={c.pending} className="space-y-5">
        <div className="border-2 border-white px-4 py-3">
          <p className="font-bold">
            Decisions recorded: <span data-testid="decisions-decided">{c.decided}</span> · Production authorized: <span>No</span>
          </p>
          <p className="mt-1 text-sm text-white/80">{reg.summary}</p>
          <p className="mt-1 text-xs text-white/70">Recording: {reg.recording}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Decisions" value={c.total} />
          <Stat label="Pending" value={c.pending} />
          <Stat label="Decided" value={c.decided} />
          <Stat label="Domains" value={Object.keys(c.by_domain).length} hint={Object.entries(c.by_domain).map(([d, n]) => `${domainLabel(d)} ${n}`).join(" · ")} />
        </div>
        <ul className="flex flex-wrap gap-2 text-xs" aria-label="Decisions by category">
          {Object.entries(c.by_category).map(([k, n]) => (
            <li key={k}>
              <Tag tone="muted">
                {humanize(k)}: {n}
              </Tag>
            </li>
          ))}
        </ul>

        <section aria-labelledby="reg-gates">
          <h3 id="reg-gates" className="text-sm font-bold uppercase tracking-wide">
            Release gates (all closed)
          </h3>
          <Table caption="Release gates" testId="release-gates" min={760} head={["Gate", "Description", "Blocked by decisions", "Requires authorizations", "Open"]}>
            {reg.gates.map((g) => (
              <tr key={g.key} data-gate={g.key} data-open={String(g.open)}>
                <td className="font-mono text-xs">{g.key}</td>
                <td>{g.label}</td>
                <td>{g.blocked_by}</td>
                <td className="font-mono text-xs">{g.requires_authorizations.join(", ")}</td>
                <td>
                  <Tag tone="warn">No</Tag>
                </td>
              </tr>
            ))}
          </Table>
        </section>

        <section aria-labelledby="reg-auth">
          <h3 id="reg-auth" className="text-sm font-bold uppercase tracking-wide">
            Human authorizations (all pending)
          </h3>
          <Table caption="Authorizations" testId="register-authorizations" min={760} head={["Authorization", "Owner", "Covers", "Status"]}>
            {reg.authorizations.map((a) => (
              <tr key={a.key} data-auth={a.key} data-status={a.status}>
                <td>{a.label}</td>
                <td className="text-xs">{a.owner}</td>
                <td className="text-xs text-white/75">{a.covers.length === 1 ? "1 decision" : `${a.covers.length} decisions`}</td>
                <td>
                  <Tag tone="warn">{humanize(a.status)}</Tag>
                </td>
              </tr>
            ))}
          </Table>
        </section>

        <section aria-labelledby="reg-items">
          <h3 id="reg-items" className="text-sm font-bold uppercase tracking-wide">
            Decisions
          </h3>
          <Table caption="Operational decisions" testId="decision-items" min={1280} head={["ID", "Category", "Domain", "Question", "Options (unranked)", "Owner", "Blocks", "Status", "Decision"]}>
            {reg.items.map((d) => (
              <tr key={d.id} data-decision={d.id} data-status={d.status} data-domain={d.domain}>
                <td className="font-mono text-xs">{d.id}</td>
                <td className="text-xs">{humanize(d.category)}</td>
                <td className="text-xs">{domainLabel(d.domain)}</td>
                <td className="text-xs">
                  {d.question}
                  {d.context.length > 0 && (
                    <ul className="mt-1 list-disc pl-4 text-white/65">
                      {d.context.map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="text-xs">
                  <ul className="space-y-0.5">
                    {d.options.map((o) => (
                      <li key={o.key}>
                        <span className="font-mono">{o.key}</span> — {o.label}
                      </li>
                    ))}
                  </ul>
                </td>
                <td className="text-xs">{d.owner}</td>
                <td className="font-mono text-xs">{d.blocks.join(", ") || "—"}</td>
                <td>
                  <Tag tone="warn">{humanize(d.status)}</Tag>
                </td>
                <td>
                  <span className="text-white/60">none</span>
                </td>
              </tr>
            ))}
          </Table>
        </section>
      </div>
    </Panel>
  );
}

export function ResolutionMatrixPanel({ m }: { m: ResolutionMatrix }) {
  const cc = m.credentials.counts;
  const tc = m.training.counts;
  return (
    <Panel id="resolution-matrix" title="Credential and training resolution matrix" eyebrow="Proposals only — no credential, zone or permission is granted and no training completion is created.">
      <div data-testid="resolution-matrix" data-granted-any={String(m.granted_any)} data-completions={m.completions_created} className="space-y-5">
        <div className="border-2 border-white px-4 py-3">
          <p className="font-bold">
            Credentials granted: <span data-testid="resolution-granted">No</span> · Training completions created: <span data-testid="resolution-completions">{m.completions_created}</span>
          </p>
          <p className="mt-1 text-sm text-white/80">{m.note}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Credential gaps" value={cc.gaps} hint={`with zones ${cc.proposed_with_zones} · no zone ${cc.proposed_no_zone}`} />
          <Stat label="Conditional tokens" value={cc.conditional_tokens} hint="Never auto-granted" />
          <Stat label="Training gaps" value={tc.gaps} hint={`${m.training.phrase_count} phrases`} />
          <Stat label="Proposed new modules" value={m.training.proposed_new_modules.length} hint="None exist yet" />
        </div>

        <section aria-labelledby="res-cred">
          <h3 id="res-cred" className="text-sm font-bold uppercase tracking-wide">
            Credential proposals
          </h3>
          <Table caption="Credential resolution proposals" testId="resolution-credentials" min={1500} head={["Canonical ID", "Role", "Source text", "v1 zones", "Plan zones", "Proposed zones", "Never automatic", "Vs v1", "Confidence", "Open questions", "Granted"]}>
            {m.credentials.rows.map((r) => (
              <tr key={r.canonical_role_id} data-role={r.role_key} data-granted={String(r.granted)} data-status={r.status}>
                <td className="font-mono text-xs">{r.canonical_role_id}</td>
                <td>
                  {r.display_name}
                  <div className="font-mono text-xs text-white/60">{r.role_key}</div>
                </td>
                <td className="text-xs">{r.source_text}</td>
                <td>{zones(r.v1_zones)}</td>
                <td>{zones(r.plan_zones)}</td>
                <td>{zones(r.proposed_zones)}</td>
                <td className="font-mono text-xs">{r.conditional_never_auto.join(", ") || "—"}</td>
                <td>{r.delta_vs_v1 ? <Tag tone={deltaTone(r.delta_vs_v1.summary)}>{humanize(r.delta_vs_v1.summary)}</Tag> : <span className="text-white/60">—</span>}</td>
                <td className="text-xs">{r.confidence}</td>
                <td className="text-xs text-white/75" style={{ minWidth: 280 }}>
                  {r.open_questions.join(" · ") || "—"}
                </td>
                <td>No</td>
              </tr>
            ))}
          </Table>
        </section>

        <section aria-labelledby="res-zone">
          <h3 id="res-zone" className="text-sm font-bold uppercase tracking-wide">
            Zone reconciliation vs After Dark v1
          </h3>
          <Table caption="Zone reconciliation vs v1" testId="zone-reconciliation" min={900} head={["Role", "Canonical ID", "v1 zones", "Plan zones", "Delta", "Added", "Removed"]}>
            {m.credentials.zone_reconciliation.map((z) => (
              <tr key={z.canonical_role_id} data-role={z.role_key} data-delta={z.delta.summary}>
                <td className="font-mono text-xs">{z.role_key}</td>
                <td className="font-mono text-xs">{z.canonical_role_id}</td>
                <td>{zones(z.v1_zones)}</td>
                <td>{zones(z.plan_zones)}</td>
                <td>
                  <Tag tone={deltaTone(z.delta.summary)}>{humanize(z.delta.summary)}</Tag>
                </td>
                <td>{mono(z.delta.added.join(", "))}</td>
                <td>{mono(z.delta.removed.join(", "))}</td>
              </tr>
            ))}
          </Table>
          <ul className="mt-2 space-y-1 text-xs text-white/80" data-testid="security-flags" aria-label="Security flags">
            {m.credentials.security_flags.map((f) => (
              <li key={f}>
                <Tag tone="warn">flag</Tag> {f}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="res-train">
          <h3 id="res-train" className="text-sm font-bold uppercase tracking-wide">
            Training proposals
          </h3>
          <Table caption="Training resolution proposals" testId="resolution-training" min={1200} head={["Canonical ID", "Role", "Plan modules", "Proposed existing", "Proposed new", "External / conditional", "v1 modules dropped", "Completion created"]}>
            {m.training.rows.map((r) => (
              <tr key={r.canonical_role_id} data-role={r.role_key} data-completion={String(r.completion_created)} data-status={r.status}>
                <td className="font-mono text-xs">{r.canonical_role_id}</td>
                <td>
                  {r.display_name}
                  <div className="font-mono text-xs text-white/60">{r.role_key}</div>
                </td>
                <td>{mono(r.plan_modules.join(", "))}</td>
                <td>{mono(r.proposed_existing_modules.join(", "))}</td>
                <td>{mono(r.proposed_new_modules.join(", "))}</td>
                <td className="text-xs">{r.external_requirements.join("; ") || "—"}</td>
                <td>{r.v1_modules_not_in_plan.length ? <Tag tone="warn">{r.v1_modules_not_in_plan.join(", ")}</Tag> : "—"}</td>
                <td>No</td>
              </tr>
            ))}
          </Table>
        </section>

        <section aria-labelledby="res-mods">
          <h3 id="res-mods" className="text-sm font-bold uppercase tracking-wide">
            Proposed new training modules (none exist)
          </h3>
          <Table caption="Proposed new training modules" testId="proposed-modules" min={900} head={["Module key", "Title", "Summary", "Verification", "Roles", "Exists"]}>
            {m.training.proposed_new_modules.map((p) => (
              <tr key={p.key} data-module={p.key} data-exists={String(p.exists)}>
                <td className="font-mono text-xs">{p.key}</td>
                <td>{p.title}</td>
                <td className="text-xs text-white/75">{p.summary}</td>
                <td className="text-xs">{humanize(p.verification)}</td>
                <td className="font-mono text-xs">{p.roles.join(", ")}</td>
                <td>No</td>
              </tr>
            ))}
          </Table>
        </section>
      </div>
    </Panel>
  );
}

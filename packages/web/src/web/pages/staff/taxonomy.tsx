import { Empty, ErrorNote, Loading, PageTitle, Panel, Stat, Tag, humanize } from "../../components/console/ui";
import {
  ApprovalChecklistPanel,
  CredentialReviewPanel,
  RoleReviewPanel,
  RunnerDecisionPanel,
  Table,
  TemplateComparisonPanel,
  TrainingReviewPanel,
} from "../../components/staff/taxonomy-review";
import { usePageMeta } from "../../hooks/use-page-meta";
import { useStaffingTaxonomyPreview } from "../../queries/staffing-taxonomy";

/**
 * Read-only review of the 36-role canonical staffing taxonomy reconciliation.
 * There are no buttons that write: importing is a CLI-only, explicitly
 * approved operation (docs/STAFFING_IMPORT_RUNBOOK_V2.md). Phase 3 adds the
 * operational review panels (role review, runner decision, credential and
 * training reconciliation, v1 vs vNext comparison, approval checklist) —
 * display only (docs/STAFFING_TAXONOMY_REVIEW_V3.md).
 */

const SECTIONS: [string, string][] = [
  ["approval-checklist", "Approval checklist"],
  ["role-review", "Role review"],
  ["runner-decision", "Runner decision"],
  ["credential-review", "Credential review"],
  ["training-review", "Training review"],
  ["template-comparison", "v1 vs vNext"],
  ["summary", "Summary"],
  ["role-changes", "Role changes"],
  ["outside", "Outside the taxonomy"],
];

const sup = (s: string | null) => (s ? <span className="font-mono text-xs">{s}</span> : <span className="text-white/60">none</span>);

export default function TaxonomyPage() {
  usePageMeta("Staffing taxonomy · Staff", { noindex: true });
  const q = useStaffingTaxonomyPreview();
  if (q.isPending) return <Loading />;
  if (q.error || !q.data) return <ErrorNote error={q.error} />;
  const { plan, stage, stage_label, import_status, stored_canonical_roles, review, integrity } = q.data;

  const banner = (
    <output data-testid="import-status" className="block border-2 border-white bg-white/5 px-4 py-3">
      <p className="text-lg font-bold tracking-wide">{import_status}</p>
      <p className="mt-1 text-sm text-white/80">
        Stage: <strong data-stage={stage}>{stage_label}</strong>. This page previews a dry run of the reviewed canonical source. No role, template, event plan, assignment, credential or training record is
        written from here. Production import requires a separately authorized write phase.
      </p>
    </output>
  );

  if (!plan)
    return (
      <div className="space-y-6">
        <PageTitle eyebrow="Staffing" title="36-Role Staffing Taxonomy" />
        {banner}
        <Empty>No canonical staffing source supplied.</Empty>
      </div>
    );

  const cr = plan.canonical_roles;
  const ex = plan.existing_roles;
  const hc = plan.headcount;
  const vn = plan.after_dark_vnext;
  const preserved = cr.roles.filter((r) => r.legacy_role_key);
  const added = cr.roles.filter((r) => r.match === "new");
  const credGaps = plan.credential_mappings.filter((c) => c.gaps.length);
  const trainGaps = plan.training_mappings.filter((t) => t.unresolved.length);
  const name = new Map(cr.roles.map((r) => [r.role_key, r.display_name]));

  return (
    <div className="space-y-6">
      <PageTitle eyebrow="Staffing · Sanctuary LV Group" title="36-Role Staffing Taxonomy" />
      {banner}
      <nav aria-label="Taxonomy review sections" className="text-xs">
        <ul className="flex flex-wrap gap-2">
          {SECTIONS.map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`} className="inline-block border border-white/30 px-2 py-1 hover:border-white">
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      {review && (
        <>
          <ApprovalChecklistPanel list={review.approval_checklist} integrity={integrity} />
          <RoleReviewPanel review={review.role_review} />
          <RunnerDecisionPanel d={review.runner_decision} />
          <CredentialReviewPanel review={review.credential_review} />
          <TrainingReviewPanel review={review.training_review} />
          {review.template_comparison && <TemplateComparisonPanel cmp={review.template_comparison} />}
        </>
      )}

      <Panel id="summary" title="Summary" eyebrow={`Source ${plan.source_file} · sha256 ${plan.source_hash.slice(0, 12)}… · plan ${plan.plan_hash.slice(0, 12)}…`}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="taxonomy-summary">
          <Stat label="Canonical roles" value={cr.total} hint={`Entity ${plan.entity_id} · paid · pending classification`} />
          <Stat label="Baseline seats" value={hc.canonical_baseline_total} hint="Planning baseline — no assignments created" />
          <Stat label="Mapped to existing" value={cr.exact + cr.renamed + cr.partial} hint={`exact ${cr.exact} · rename ${cr.renamed} · partial ${cr.partial}`} />
          <Stat label="New canonical roles" value={cr.new} />
          <Stat label="Existing roles kept outside" value={ex.excluded.length + ex.external.length + ex.separate_domain.length} hint={`excluded ${ex.excluded.length} · external ${ex.external.length} · separate domain ${ex.separate_domain.length}`} />
          <Stat label="Unresolved existing" value={ex.unresolved.length} hint={ex.unresolved.map((u) => u.role_key).join(", ") || undefined} />
          <Stat label="Warnings" value={plan.warnings.length} />
          <Stat label="Errors" value={plan.errors.length} hint={plan.ok ? "Plan validates" : "Plan does not validate"} />
        </div>
        <p className="mt-3 text-sm text-white/75">
          Promoter baseline {hc.promoter_baseline ?? "—"} · Assignments created {hc.assignments_created} · Stored canonical roles on this database:{" "}
          {stored_canonical_roles === null ? "table not present (migration 0002 not applied)" : stored_canonical_roles}. {hc.note}
        </p>
        <ul className="mt-2 flex flex-wrap gap-2 text-xs">
          {Object.entries(hc.by_model).map(([m, v]) => (
            <li key={m}>
              <Tag tone="muted">
                {humanize(m)}: {v.roles} roles · {v.seats} seats
              </Tag>
            </li>
          ))}
        </ul>
        {plan.errors.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm text-red-300" data-testid="taxonomy-errors">
            {plan.errors.map((e, i) => (
              <li key={i}>
                [{e.code}] {e.canonical_role_id ?? ""} {e.message}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel id="role-changes" title="Role changes" eyebrow="Existing role → canonical role. Existing role keys are kept; only titles change.">
        <Table caption="Existing to canonical role changes" testId="role-changes" head={["Canonical ID", "Existing key", "Existing title", "Canonical title", "Match", "Note"]}>
          {preserved.map((r) => (
            <tr key={r.canonical_role_id} data-role={r.role_key}>
              <td className="font-mono text-xs">{r.canonical_role_id}</td>
              <td className="font-mono text-xs">{r.legacy_role_key}</td>
              <td>{ex.preserved.find((p) => p.canonical_role_id === r.canonical_role_id)?.title_before}</td>
              <td>{r.display_name}</td>
              <td>
                <Tag tone={r.match === "exact" ? "solid" : "default"}>{r.match}</Tag>
              </td>
              <td className="text-xs text-white/75">{r.note}</td>
            </tr>
          ))}
        </Table>
      </Panel>

      <Panel id="new-roles" title={`New roles (${added.length})`} eyebrow="Canonical additions with no existing seat">
        <Table caption="New canonical roles" testId="new-roles" head={["Canonical ID", "Role key", "Title", "Department", "Model", "Baseline", "Applicability", "Reports to"]}>
          {added.map((r) => (
            <tr key={r.canonical_role_id} data-role={r.role_key}>
              <td className="font-mono text-xs">{r.canonical_role_id}</td>
              <td className="font-mono text-xs">{r.role_key}</td>
              <td>{r.display_name}</td>
              <td>{humanize(r.department_key)}</td>
              <td>{humanize(r.headcount_model)}</td>
              <td>{r.baseline_headcount}</td>
              <td className="text-xs">{r.event_applicability}</td>
              <td>{sup(r.reports_to_resolved)}</td>
            </tr>
          ))}
        </Table>
      </Panel>

      <Panel id="reporting" title={`Reporting changes (${plan.supervisor_changes.length})`} eyebrow="Supervisor differences between the current After Dark template and the canonical hierarchy">
        <Table caption="Supervisor changes" testId="supervisor-changes" head={["Canonical ID", "Role", "Current supervisor", "Canonical supervisor"]} min={560}>
          {plan.supervisor_changes.map((s) => (
            <tr key={s.canonical_role_id} data-role={s.role_key}>
              <td className="font-mono text-xs">{s.canonical_role_id}</td>
              <td>{s.display_name}</td>
              <td>{sup(s.from)}</td>
              <td>
                {sup(s.to)} {s.to && name.get(s.to) ? <span className="text-xs text-white/60">({name.get(s.to)})</span> : null}
              </td>
            </tr>
          ))}
        </Table>
      </Panel>

      <Panel id="credential-gaps" title={`Credential gaps (${credGaps.length})`} eyebrow="Proposed zones are suggestions only — no credential, zone or permission is granted by this preview">
        <Table caption="Credential gaps" testId="credential-gaps" head={["Canonical ID", "Role", "Source credential text", "Status", "Proposed zones", "Gaps"]}>
          {credGaps.map((c) => (
            <tr key={c.canonical_role_id} data-role={c.role_key}>
              <td className="font-mono text-xs">{c.canonical_role_id}</td>
              <td className="font-mono text-xs">{c.role_key}</td>
              <td className="text-xs">{c.source_text}</td>
              <td>
                <Tag tone={c.status === "unresolved" ? "warn" : "default"}>{c.status}</Tag>
              </td>
              <td className="font-mono text-xs">{c.proposed_zones.join(", ") || "—"}</td>
              <td className="text-xs text-white/75">{c.gaps.join(" · ")}</td>
            </tr>
          ))}
        </Table>
      </Panel>

      <Panel id="training-gaps" title={`Training gaps (${trainGaps.length})`} eyebrow="Unmapped requirements stay unresolved — no training record is created or completed">
        <Table caption="Training gaps" testId="training-gaps" head={["Canonical ID", "Role", "Mapped modules", "Unresolved requirements"]} min={560}>
          {trainGaps.map((t) => (
            <tr key={t.canonical_role_id} data-role={t.role_key}>
              <td className="font-mono text-xs">{t.canonical_role_id}</td>
              <td className="font-mono text-xs">{t.role_key}</td>
              <td className="font-mono text-xs">{t.module_keys.join(", ") || "—"}</td>
              <td className="text-xs text-white/75">{t.unresolved.join("; ")}</td>
            </tr>
          ))}
        </Table>
      </Panel>

      {vn && (
        <Panel
          id="after-dark-vnext"
          title={vn.title}
          eyebrow={`PREVIEW ONLY — After Dark v${vn.based_on_version} stays the active template. ${vn.proposed_version_label}.`}
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="v1 Sanctuary seats" value={vn.totals.v1_sanctuary_seats} />
            <Stat label="Proposed Sanctuary seats" value={vn.totals.proposed_sanctuary_seats} hint={`Group ${vn.totals.proposed_group_seats} + carried forward ${vn.totals.carried_forward_sanctuary_seats}`} />
            <Stat label="Not enabled baseline seats" value={vn.totals.not_enabled_baseline_seats} />
            <Stat label="Venue allowances unchanged" value={vn.totals.venue_allowances_unchanged} />
          </div>
          <p className="mt-3 text-xs text-white/70">
            {Object.entries(vn.counts)
              .map(([k, v]) => `${humanize(k)} ${v}`)
              .join(" · ")}
          </p>
          <div className="mt-3">
            <Table caption="After Dark proposed template vNext" testId="vnext-table" min={1000} head={["Existing role", "Canonical role", "Old count", "Proposed count", "Reporting change", "Status", "Reason"]}>
              {vn.rows.map((r) => (
                <tr key={r.role_key} data-role={r.role_key} data-change={r.change}>
                  <td>{r.existing_title ?? <span className="text-white/60">—</span>}</td>
                  <td>{r.canonical_display_name ? `${r.canonical_display_name} (${r.canonical_role_id})` : <span className="text-white/60">not in taxonomy</span>}</td>
                  <td>{r.old_count ?? "—"}</td>
                  <td>{r.proposed_count ?? "—"}</td>
                  <td>{r.reporting_change ? `${r.old_supervisor ?? "none"} → ${r.proposed_supervisor}` : "—"}</td>
                  <td>
                    <Tag tone={r.change === "new" ? "solid" : r.change === "not_enabled" ? "muted" : r.change === "changed" ? "warn" : "default"}>{humanize(r.change)}</Tag>
                  </td>
                  <td className="text-xs text-white/75">{r.reason}</td>
                </tr>
              ))}
            </Table>
          </div>
        </Panel>
      )}

      <Panel id="outside" title="Existing roles kept outside the Group taxonomy" eyebrow="Venue, provider, nonprofit Serve Team and founder seats are never converted into Group personnel">
        <Table caption="Existing roles outside the taxonomy" testId="outside-roles" head={["Role key", "Disposition", "Domain", "Reason"]} min={560}>
          {(["separate_domain", "external", "excluded", "unresolved"] as const).flatMap((cls) =>
            ex[cls].map((r) => (
              <tr key={r.role_key} data-role={r.role_key}>
                <td className="font-mono text-xs">{r.role_key}</td>
                <td>
                  <Tag tone={cls === "unresolved" ? "warn" : "muted"}>{humanize(cls)}</Tag>
                </td>
                <td className="text-xs">{r.domain}</td>
                <td className="text-xs text-white/75">{r.reason}</td>
              </tr>
            )),
          )}
        </Table>
      </Panel>

      <Panel id="import-status" title="Import status">
        <p className="text-sm">
          <strong>{import_status}</strong> — {plan.proposed_writes.summary.insert} insert · {plan.proposed_writes.summary.update} update · {plan.proposed_writes.summary.unchanged} unchanged would apply only to{" "}
          <span className="font-mono">{plan.proposed_writes.tables_written_on_apply.join(", ")}</span> in a future approved import. Never written: {plan.proposed_writes.never_written.join("; ")}.
        </p>
      </Panel>
    </div>
  );
}

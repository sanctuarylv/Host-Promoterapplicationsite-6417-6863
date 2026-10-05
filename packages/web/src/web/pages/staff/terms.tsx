import { useState } from "react";
import { ROLE_OPTIONS, labelFor } from "../../../api/crew/contract";
import { Btn, Empty, ErrorNote, errorInfo, Loading, PageTitle, Panel, SelectField, Tag, TextArea, TextField, fmtDate, humanize } from "../../components/console/ui";
import { usePageMeta } from "../../hooks/use-page-meta";
import { PAID_ENTITY } from "../../lib/pathways";
import { useStaffDirectory } from "../../queries/recruiting";
import { useApproveTerms, useDraftTerms, useRetireTerms, useTermsList, useTrainingModules } from "../../queries/terms";

const EMPTY = {
  termsKey: "",
  roleKey: "host",
  title: "",
  duties: "",
  compensation: "",
  payBasis: "",
  schedule: "",
  engagementArrangement: "",
  acceptanceRequirements: "",
};

function DraftForm({ prefill, onDone }: { prefill?: typeof EMPTY; onDone: () => void }) {
  const m = useDraftTerms();
  const [v, setV] = useState(prefill ?? EMPTY);
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  const keyOk = /^[a-z0-9-]{3,60}$/.test(v.termsKey);
  const complete = keyOk && Object.values(v).every((x) => x.trim().length > 0);
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (complete) m.mutate(v, { onSuccess: onDone });
      }}
    >
      <TextField label="Terms key" value={v.termsKey} onChange={set("termsKey")} invalid={Boolean(v.termsKey) && !keyOk} hint="Lowercase letters, digits and dashes. Re-using a key creates the next version." />
      <SelectField label="Role" options={ROLE_OPTIONS.map((r) => [r.value, r.label] as const)} value={v.roleKey} onChange={set("roleKey")} />
      <TextField label="Title" value={v.title} onChange={set("title")} className="sm:col-span-2" maxLength={120} />
      <TextArea label="Duties" rows={3} value={v.duties} onChange={set("duties")} className="sm:col-span-2" />
      <TextArea label="Compensation" rows={2} value={v.compensation} onChange={set("compensation")} hint="Entered by an authorized person. The app never fills in amounts." />
      <TextField label="Pay basis" value={v.payBasis} onChange={set("payBasis")} hint="e.g. per shift, hourly — as approved." />
      <TextArea label="Schedule" rows={2} value={v.schedule} onChange={set("schedule")} />
      <TextArea label="Proposed engagement arrangement" rows={2} value={v.engagementArrangement} onChange={set("engagementArrangement")} hint="Recorded for the approver. This app makes no classification or legal determination." />
      <TextArea label="Acceptance requirements" rows={2} value={v.acceptanceRequirements} onChange={set("acceptanceRequirements")} className="sm:col-span-2" />
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <Btn type="submit" variant="solid" disabled={!complete} busy={m.isPending}>
          Save draft
        </Btn>
        <Btn variant="ghost" onClick={onDone}>
          Cancel
        </Btn>
      </div>
      <ErrorNote error={m.error} className="sm:col-span-2" />
    </form>
  );
}

export default function TermsPage() {
  usePageMeta("Terms & offers · Sanctuary LV staff", { noindex: true });
  const list = useTermsList();
  const dir = useStaffDirectory();
  const modules = useTrainingModules();
  const approve = useApproveTerms();
  const retire = useRetireTerms();
  const [drafting, setDrafting] = useState<typeof EMPTY | null>(null);
  const nameOf = (id: string | null) => (id ? (dir.data?.find((s) => s.userId === id)?.name ?? "Staff") : "—");

  if (list.isPending) return <Loading />;
  if (list.error || !list.data) return <ErrorNote error={list.error} />;
  const { rows, canApprove, canDraft, me } = list.data;

  return (
    <>
      <PageTitle eyebrow={PAID_ENTITY} title="Terms & offers">
        {canDraft && !drafting && (
          <Btn variant="solid" onClick={() => setDrafting(EMPTY)}>
            New terms draft
          </Btn>
        )}
      </PageTitle>
      <div className="mb-6 border border-white/12 bg-sx-ink px-4 py-3 text-sm text-white/80">
        <p>
          <strong className="font-medium text-white">Separation of duties.</strong> Terms are drafted by recruiters or approvers and must be approved by a
          compensation approver who did not draft them. Administrators cannot approve terms. Approved versions are immutable; edits create a new version.
        </p>
        <p className="mt-2 text-white/70">
          {canApprove ? "You can approve drafts written by someone else." : "Your role cannot approve terms."} Offers are issued from an applicant's page once they are
          selected.
        </p>
      </div>

      {drafting && (
        <Panel title="New draft" className="mb-6">
          <DraftForm prefill={drafting} onDone={() => setDrafting(null)} />
        </Panel>
      )}
      <ErrorNote error={approve.error ?? retire.error} className="mb-4" />

      {rows.length === 0 ? (
        <Empty>No terms drafted yet. Paid roles stay “future opportunities / candidate interest” until terms are approved.</Empty>
      ) : (
        <div className="space-y-4">
          {rows.map((t) => {
            const own = t.created_by === me;
            return (
              <Panel
                key={t.id}
                title={`${t.title} · v${t.version}`}
                eyebrow={`${t.terms_key} · ${labelFor(ROLE_OPTIONS, t.role_key)} · ${t.operator_entity}`}
                actions={
                  <>
                    <Tag tone={t.status === "approved" ? "solid" : t.status === "draft" ? "warn" : "muted"}>{humanize(t.status)}</Tag>
                    {t.status === "draft" && canApprove && (
                      <Btn size="sm" variant="solid" disabled={own} title={own ? "You drafted this version" : undefined} busy={approve.isPending && approve.variables?.id === t.id} onClick={() => approve.mutate({ id: t.id })}>
                        {own ? "Drafted by you" : "Approve"}
                      </Btn>
                    )}
                    {t.status === "approved" && canApprove && (
                      <Btn size="sm" busy={retire.isPending && retire.variables?.id === t.id} onClick={() => retire.mutate({ id: t.id })}>
                        Retire
                      </Btn>
                    )}
                    {canDraft && t.status !== "draft" && (
                      <Btn
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setDrafting({
                            termsKey: t.terms_key,
                            roleKey: t.role_key,
                            title: t.title,
                            duties: t.duties,
                            compensation: t.compensation,
                            payBasis: t.pay_basis,
                            schedule: t.schedule,
                            engagementArrangement: t.engagement_arrangement,
                            acceptanceRequirements: t.acceptance_requirements,
                          })
                        }
                      >
                        New version
                      </Btn>
                    )}
                  </>
                }
              >
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  {(
                    [
                      ["Duties", t.duties],
                      ["Compensation", t.compensation],
                      ["Pay basis", t.pay_basis],
                      ["Schedule", t.schedule],
                      ["Proposed arrangement", t.engagement_arrangement],
                      ["Acceptance requirements", t.acceptance_requirements],
                    ] as const
                  ).map(([k, v]) => (
                    <div key={k}>
                      <dt className="eyebrow text-white/60">{k}</dt>
                      <dd className="mt-1 whitespace-pre-wrap">{v}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-xs text-white/60">
                  Drafted by {nameOf(t.created_by)} {fmtDate(t.created_at)}
                  {t.approved_by ? ` · Approved by ${nameOf(t.approved_by)} ${fmtDate(t.approved_at)}` : ""}
                  {t.retired_at ? ` · Retired ${fmtDate(t.retired_at)}` : ""}
                </p>
              </Panel>
            );
          })}
        </div>
      )}

      <Panel title="Training modules" eyebrow="Completion is verified per person on the applicant page" className="mt-8">
        {modules.isPending ? (
          <Loading />
        ) : modules.error ? (
          errorInfo(modules.error)?.code === "FORBIDDEN" ? (
            <Empty>Your role does not include training verification.</Empty>
          ) : (
            <ErrorNote error={modules.error} />
          )
        ) : (
          <ul className="space-y-2 text-sm">
            {(modules.data ?? []).map((m) => (
              <li key={m.id} className="border border-white/10 px-3 py-2">
                <span className="font-medium">{m.title}</span> <span className="text-white/60">v{m.version}</span> · {humanize(m.verification)}
                <span className="block text-xs text-white/65">{m.summary}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}

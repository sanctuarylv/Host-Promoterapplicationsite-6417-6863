import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Btn, Empty, ErrorNote, Loading, PageTitle, Panel, Tag, TextArea, TextField, fmtDay, humanize } from "../../components/console/ui";
import { usePageMeta } from "../../hooks/use-page-meta";
import { useCampaigns, useCreateCampaign } from "../../queries/campaigns";

export default function CampaignsPage() {
  usePageMeta("Campaigns · Staff", { noindex: true });
  const q = useCampaigns();
  const create = useCreateCampaign();
  const [, go] = useLocation();
  const [f, setF] = useState({ name: "", concept: "", code: "", startDate: "" });
  return (
    <div className="space-y-6">
      <PageTitle eyebrow="Recruitment planning" title="Campaigns" />
      <p className="max-w-3xl text-sm text-white/75">
        Internal planning only. Nothing here posts, publishes, emails anyone or spends money. Tracked links point at the public application page with UTM parameters.
      </p>
      {q.isPending ? (
        <Loading />
      ) : q.error || !q.data ? (
        <ErrorNote error={q.error} />
      ) : (
        <>
          <Panel id="list" title={`Campaigns (${q.data.rows.length})`}>
            {q.data.rows.length === 0 ? (
              <Empty>No campaigns yet.</Empty>
            ) : (
              <ul className="divide-y divide-white/10">
                {q.data.rows.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div>
                      <Link href={`/staff/campaigns/${c.id}`} className="font-medium underline-offset-4 hover:underline">
                        {c.name}
                      </Link>
                      <p className="text-xs text-white/65">
                        utm_campaign={c.code} · starts {fmtDay(`${c.start_date}T12:00:00`)} · owner {c.owner_label ?? "—"}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {c.is_planning_seed && <Tag tone="warn">Planning seed</Tag>}
                      <Tag tone={c.status === "running" ? "solid" : "default"}>{humanize(c.status)}</Tag>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          {q.data.canWrite && (
            <Panel id="new" title="New campaign">
              <form
                className="grid gap-3 sm:grid-cols-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  create.mutate(f, { onSuccess: (r) => go(`/staff/campaigns/${r.id}`) });
                }}
              >
                <TextField label="Name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
                <TextField
                  label="Code (utm_campaign)"
                  required
                  pattern="[a-z0-9][a-z0-9_\-]*"
                  hint="Lowercase letters, numbers, - or _"
                  value={f.code}
                  onChange={(e) => setF({ ...f, code: e.target.value.toLowerCase() })}
                />
                <TextField label="Start date" type="date" required value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} />
                <TextArea className="sm:col-span-2" label="Concept" required rows={3} value={f.concept} onChange={(e) => setF({ ...f, concept: e.target.value })} />
                <Btn type="submit" variant="solid" busy={create.isPending}>
                  Create campaign
                </Btn>
                <ErrorNote error={create.error} className="sm:col-span-2" />
              </form>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}

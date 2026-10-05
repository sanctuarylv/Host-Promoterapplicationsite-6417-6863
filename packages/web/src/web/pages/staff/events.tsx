import { useState } from "react";
import { Link } from "wouter";
import { Btn, Empty, ErrorNote, Loading, PageTitle, Panel, SelectField, Stat, Tag, TextField, countOrUnknown, errorInfo, fmtDay, humanize } from "../../components/console/ui";
import { usePageMeta } from "../../hooks/use-page-meta";
import {
  useAddOrgLine,
  useCloneVersion,
  useCreateEvent,
  useEvents,
  useOrgChart,
  usePublishVersion,
  useRemoveOrgLine,
  useTemplateVersion,
  useTemplates,
  useUpdateTemplateRole,
} from "../../queries/events";

const WORKFORCE_LABEL: Record<string, string> = {
  paid_group: "Sanctuary LV Group (paid)",
  nonprofit_serve: "Serve Team (volunteer)",
  founder_tbd: "Founder (TBD)",
  venue_provider: "Venue / provider",
  provider: "Provider",
  unclassified: "Unclassified",
};
const WORKFORCE_OPTS = Object.entries(WORKFORCE_LABEL) as [string, string][];

/* ---------------- Org chart ---------------- */
function OrgChart() {
  const q = useOrgChart();
  const add = useAddOrgLine();
  const remove = useRemoveOrgLine();
  const [form, setForm] = useState({ relation: "operational", child: "", parent: "", note: "" });
  if (q.isPending) return <Loading />;
  if (q.error || !q.data) return <ErrorNote error={q.error} />;
  const { units, lines, canManage } = q.data;
  const name = (k: string) => units.find((u) => u.key === k)?.name ?? k;
  const roots = units.filter((u) => !lines.some((l) => l.relation === "operational" && l.child_key === u.key));
  const childrenOf = (k: string) => lines.filter((l) => l.relation === "operational" && l.parent_key === k).map((l) => l.child_key);
  const Node = ({ k, depth }: { k: string; depth: number }) => {
    const extra = lines.filter((l) => l.relation !== "operational" && l.child_key === k);
    return (
      <li className={depth ? "border-l border-white/15 pl-4" : ""}>
        <div className="py-1.5 text-sm">
          <span className="font-medium">{name(k)}</span>
          {extra.map((l) => (
            <span key={l.id} className="ml-2 text-xs text-white/65">
              · {l.relation} line → {name(l.parent_key)}
            </span>
          ))}
        </div>
        {childrenOf(k).length > 0 && (
          <ul className="ml-2">
            {childrenOf(k).map((c) => (
              <Node key={c} k={c} depth={depth + 1} />
            ))}
          </ul>
        )}
      </li>
    );
  };
  const unitOpts = [["", "Choose…"], ...units.map((u) => [u.key, u.name] as const)] as const;
  return (
    <Panel id="org" title="Leadership & reporting" eyebrow="Operational lines shown as a tree; pastoral and coordination lines listed alongside">
      <ul>
        {roots.map((r) => (
          <Node key={r.key} k={r.key} depth={0} />
        ))}
      </ul>
      {canManage && (
        <details className="mt-4 border-t border-white/10 pt-3">
          <summary className="min-h-11 cursor-pointer py-2 text-sm">Edit reporting lines</summary>
          <form
            className="mt-2 grid gap-3 sm:grid-cols-4 sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              if (form.child && form.parent) add.mutate({ relation: form.relation as never, child: form.child, parent: form.parent, note: form.note || undefined });
            }}
          >
            <SelectField label="Relation" options={[["operational", "Operational"], ["pastoral", "Pastoral"], ["coordination", "Coordination"]]} value={form.relation} onChange={(e) => setForm({ ...form, relation: e.target.value })} />
            <SelectField label="Unit" options={unitOpts} value={form.child} onChange={(e) => setForm({ ...form, child: e.target.value })} />
            <SelectField label="Reports to" options={unitOpts} value={form.parent} onChange={(e) => setForm({ ...form, parent: e.target.value })} />
            <Btn type="submit" busy={add.isPending}>
              Add line
            </Btn>
          </form>
          <ul className="mt-3 space-y-1 text-sm">
            {lines.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 border border-white/10 px-3 py-1.5">
                <span>
                  {name(l.child_key)} → {name(l.parent_key)} <span className="text-xs text-white/60">({l.relation})</span>
                </span>
                <Btn size="sm" variant="ghost" onClick={() => remove.mutate({ relation: l.relation as never, child: l.child_key, parent: l.parent_key })}>
                  Remove
                </Btn>
              </li>
            ))}
          </ul>
          <ErrorNote error={add.error ?? remove.error} className="mt-3" />
        </details>
      )}
    </Panel>
  );
}

/* ---------------- Templates ---------------- */
function VersionView({ versionId, canManage }: { versionId: string; canManage: boolean }) {
  const q = useTemplateVersion(versionId);
  const upd = useUpdateTemplateRole();
  const publish = usePublishVersion();
  if (q.isPending) return <Loading />;
  if (q.error || !q.data) return <ErrorNote error={q.error} />;
  const { version: v, roles, totals } = q.data;
  const draft = v.status === "draft";
  const core = totals.byClass.core ?? 0;
  return (
    <div className="mt-4">
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Sanctuary slots" value={totals.sanctuarySlots} hint={totals.unknownSanctuaryRoles ? `+ ${totals.unknownSanctuaryRoles} role(s) with unknown count` : "all counts known"} />
        <Stat label="Core crew" value={core} hint="slot class “core”" />
        <Stat label="Venue / provider (known)" value={totals.venue.known} hint={totals.venue.unknownRoles.length ? `Unknown: ${totals.venue.unknownRoles.map(humanize).join(", ")}` : undefined} />
        <Stat label="Planning guests" value={countOrUnknown(v.planning_guests)} hint={v.planning_guest_range ?? undefined} />
      </div>
      {draft && canManage && (
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <Btn variant="solid" busy={publish.isPending} onClick={() => publish.mutate({ versionId: v.id })}>
            Publish v{v.version}
          </Btn>
          <span className="text-xs text-white/65">Published versions are immutable; events reference a published version.</span>
          <ErrorNote error={publish.error} />
        </div>
      )}
      <ErrorNote error={upd.error} className="mb-3" />
      <div className="overflow-x-auto border border-white/12">
        <table className="cx-table">
          <caption className="sr-only">Roles in template version {v.version}</caption>
          <thead>
            <tr>
              <th scope="col">Role</th>
              <th scope="col">Department</th>
              <th scope="col">Class</th>
              <th scope="col">Workforce</th>
              <th scope="col">Min</th>
              <th scope="col">Recommended</th>
              <th scope="col">Confirmation</th>
            </tr>
          </thead>
          <tbody>
            {roles.map((r) => (
              <tr key={r.id}>
                <th scope="row">
                  {r.title}
                  {r.provider && <span className="block text-xs font-normal text-white/60">{r.provider}</span>}
                </th>
                <td>{humanize(r.department_key)}</td>
                <td>{humanize(r.slot_class)}</td>
                <td>
                  {draft && canManage ? (
                    <select
                      aria-label={`Workforce for ${r.title}`}
                      className="cx-input min-w-44"
                      value={r.workforce}
                      onChange={(e) => upd.mutate({ roleId: r.id, workforce: e.target.value as never })}
                    >
                      {WORKFORCE_OPTS.map(([k, l]) => (
                        <option key={k} value={k}>
                          {l}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Tag tone={r.workforce === "unclassified" ? "warn" : "muted"}>{WORKFORCE_LABEL[r.workforce] ?? r.workforce}</Tag>
                  )}
                </td>
                <td>{countOrUnknown(r.min_count)}</td>
                <td>
                  {draft && canManage ? (
                    <input
                      aria-label={`Recommended count for ${r.title}`}
                      type="number"
                      min={0}
                      className="cx-input w-24"
                      defaultValue={r.recommended_count ?? ""}
                      placeholder="Unknown"
                      onBlur={(e) => {
                        const n = e.target.value === "" ? null : Number(e.target.value);
                        if (n !== r.recommended_count) upd.mutate({ roleId: r.id, recommendedCount: n });
                      }}
                    />
                  ) : (
                    countOrUnknown(r.approved_count ?? r.recommended_count)
                  )}
                </td>
                <td>{humanize(r.confirmation)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Templates({ canManage }: { canManage: boolean }) {
  const q = useTemplates();
  const clone = useCloneVersion();
  const [open, setOpen] = useState<string | null>(null);
  if (q.isPending) return <Loading />;
  if (q.error || !q.data) return <ErrorNote error={q.error} />;
  return (
    <Panel id="templates" title="Staffing templates" eyebrow="Counts are planning assumptions, not hiring commitments">
      {q.data.length === 0 && <Empty>No templates.</Empty>}
      {q.data.map((t) => (
        <div key={t.id} className="mb-4">
          <p className="font-medium">{t.name}</p>
          {t.description && <p className="text-sm text-white/70">{t.description}</p>}
          <ul className="mt-2 space-y-2">
            {t.versions.map((v) => (
              <li key={v.id} className="border border-white/10 px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>
                    v{v.version} <Tag tone={v.status === "published" ? "solid" : "warn"}>{v.status}</Tag>
                    {v.source_note && <span className="ml-2 text-xs text-white/60">{v.source_note}</span>}
                  </span>
                  <span className="flex flex-wrap gap-2">
                    <Btn size="sm" aria-expanded={open === v.id} onClick={() => setOpen((o) => (o === v.id ? null : v.id))}>
                      {open === v.id ? "Hide roles" : "View roles"}
                    </Btn>
                    {canManage && (
                      <Btn size="sm" variant="ghost" busy={clone.isPending && clone.variables?.versionId === v.id} onClick={() => clone.mutate({ versionId: v.id })}>
                        Clone to draft
                      </Btn>
                    )}
                  </span>
                </div>
                {open === v.id && <VersionView versionId={v.id} canManage={canManage} />}
              </li>
            ))}
          </ul>
        </div>
      ))}
      <ErrorNote error={clone.error} />
    </Panel>
  );
}

/* ---------------- Events ---------------- */
function CreateEvent({ onDone }: { onDone: () => void }) {
  const t = useTemplates();
  const m = useCreateEvent();
  const published = (t.data ?? []).flatMap((x) => x.versions.filter((v) => v.status === "published").map((v) => [v.id, `${x.name} v${v.version}`] as const));
  const [f, setF] = useState({ name: "", templateVersionId: "", timezone: "America/Los_Angeles", venue: "" });
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate({ name: f.name.trim(), templateVersionId: f.templateVersionId, timezone: f.timezone, venueName: f.venue.trim() || null }, { onSuccess: onDone });
      }}
    >
      <TextField label="Event name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} minLength={3} required />
      <SelectField label="Template (published)" options={[["", "Choose…"], ...published]} value={f.templateVersionId} onChange={(e) => setF({ ...f, templateVersionId: e.target.value })} />
      <TextField label="Time zone (IANA)" value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })} />
      <TextField label="Venue (optional)" value={f.venue} onChange={(e) => setF({ ...f, venue: e.target.value })} hint="Recorded as unconfirmed until you confirm it on the event." />
      <div className="flex gap-2 sm:col-span-2">
        <Btn type="submit" variant="solid" disabled={f.name.trim().length < 3 || !f.templateVersionId} busy={m.isPending}>
          Create planning event
        </Btn>
        <Btn variant="ghost" onClick={onDone}>
          Cancel
        </Btn>
      </div>
      <ErrorNote error={m.error} className="sm:col-span-2" />
    </form>
  );
}

export default function EventsPage() {
  usePageMeta("Events · Sanctuary LV staff", { noindex: true });
  const ev = useEvents();
  const org = useOrgChart();
  const [creating, setCreating] = useState(false);
  const canManage = Boolean(org.data?.canManage);
  const orgForbidden = errorInfo(org.error)?.code === "FORBIDDEN";
  return (
    <>
      <PageTitle eyebrow="Operations" title="Events & staffing">
        {canManage && !creating && (
          <Btn variant="solid" onClick={() => setCreating(true)}>
            New event
          </Btn>
        )}
      </PageTitle>
      {creating && (
        <Panel title="New planning event" className="mb-6">
          <CreateEvent onDone={() => setCreating(false)} />
        </Panel>
      )}
      <Panel id="events" title="Events" className="mb-6">
        {ev.isPending ? (
          <Loading />
        ) : ev.error ? (
          <ErrorNote error={ev.error} />
        ) : !ev.data?.length ? (
          <Empty>No events you can access.</Empty>
        ) : (
          <ul className="divide-y divide-white/10">
            {ev.data.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <Link href={`/staff/events/${e.id}`} className="font-medium underline-offset-4 hover:underline">
                    {e.name}
                  </Link>
                  <p className="text-xs text-white/65">
                    {e.date_confirmed && e.local_date ? fmtDay(`${e.local_date}T12:00:00`) : "Date not confirmed"} · {e.venue_name ?? "Venue TBD"}
                    {e.venue_name && !e.venue_confirmed ? " (unconfirmed)" : ""} · {e.timezone}
                  </p>
                </div>
                <span className="flex flex-wrap gap-2">
                  {e.is_planning_seed && <Tag tone="warn">Planning seed</Tag>}
                  <Tag tone="muted">{humanize(e.status)}</Tag>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {!orgForbidden && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <OrgChart />
          <Templates canManage={canManage} />
        </div>
      )}
    </>
  );
}

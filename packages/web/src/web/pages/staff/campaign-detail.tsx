import { useState } from "react";
import { Link } from "wouter";
import { Btn, Empty, ErrorNote, Loading, PageTitle, Panel, SelectField, Stat, Tag, TextField, countOrUnknown, fmtDay, humanize, usd } from "../../components/console/ui";
import { usePageMeta } from "../../hooks/use-page-meta";
import { type CampaignDetailInput, useAddLink, useAddTask, useCampaign, useCampaignLinkQr, useSetBudgetLine, useSetGoal, useSetTaskStatus, useUpdateCampaign } from "../../queries/campaigns";

type Detail = NonNullable<ReturnType<typeof useCampaign>["data"]>;

const pct = (num: number, den: number | null) => (den ? `${Math.round((num / den) * 100)}%` : "—");
const toCents = (s: string) => (s.trim() === "" ? null : Math.round(Number(s) * 100));

function Header({ d }: { d: Detail }) {
  const upd = useUpdateCampaign();
  const c = d.campaign;
  return (
    <Panel id="overview" title="Overview" eyebrow={`utm_campaign=${c.code}`}>
      <p className="max-w-3xl text-sm text-white/80">{c.concept}</p>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-white/60">Start</dt>
          <dd>{fmtDay(`${c.start_date}T12:00:00`)}</dd>
        </div>
        <div>
          <dt className="text-white/60">Owner</dt>
          <dd>{c.owner_label ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-white/60">Status</dt>
          <dd>
            <Tag>{humanize(c.status)}</Tag> {c.is_planning_seed && <Tag tone="warn">Planning seed</Tag>}
          </dd>
        </div>
      </dl>
      {d.canWrite && (
        <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-white/10 pt-4">
          <SelectField
            label="Planning status"
            hint="A status label only. Nothing is launched or spent by changing it."
            options={[["planning", "Planning"], ["approved", "Approved"], ["running", "Running"], ["closed", "Closed"]]}
            value={c.status}
            onChange={(e) => upd.mutate({ id: c.id, revision: c.revision, status: e.target.value as "planning" })}
          />
          <ErrorNote error={upd.error} />
        </div>
      )}
    </Panel>
  );
}

export type Scope = { role: string; from: string; to: string };
const ROLE_FILTER: [string, string][] = [
  ["", "All roles"],
  ["host", "Host"],
  ["promoter", "Promoter"],
  ["both", "Both"],
  ["not_sure", "Not sure yet"],
  ["guest_experience_lead", "Guest Experience Lead"],
  ["promoter_manager", "Promoter Manager"],
];

function ScopeBar({ scope, onChange, busy }: { scope: Scope; onChange: (s: Scope) => void; busy: boolean }) {
  const invalid = Boolean(scope.from && scope.to && scope.from > scope.to);
  return (
    <form className="mb-4 flex flex-wrap items-end gap-3 border-b border-white/10 pb-4" onSubmit={(e) => e.preventDefault()} aria-label="Results scope">
      <SelectField label="Role" options={ROLE_FILTER} value={scope.role} onChange={(e) => onChange({ ...scope, role: e.target.value })} />
      <TextField label="Applied from" type="date" value={scope.from} max={scope.to || undefined} onChange={(e) => onChange({ ...scope, from: e.target.value })} />
      <TextField
        label="Applied to"
        type="date"
        value={scope.to}
        min={scope.from || undefined}
        invalid={invalid}
        hint={invalid ? "The end date must be on or after the start date." : "Inclusive, Las Vegas time"}
        onChange={(e) => onChange({ ...scope, to: e.target.value })}
      />
      {(scope.role || scope.from || scope.to) && (
        <Btn type="button" onClick={() => onChange({ role: "", from: "", to: "" })}>
          Clear filters
        </Btn>
      )}
      {busy && <output className="text-xs text-white/60">Updating…</output>}
    </form>
  );
}

const share = (x: { value: number; denominator: number | null }) => `${x.value} (${pct(x.value, x.denominator)})`;

function Metrics({ d, scope, onScope, busy }: { d: Detail; scope: Scope; onScope: (s: Scope) => void; busy: boolean }) {
  const m = d.metrics;
  const den = `of ${m.applications.value} ${m.denominatorLabel}`;
  return (
    <Panel id="metrics" title="Results" eyebrow="Every rate shows its denominator">
      <ScopeBar scope={scope} onChange={onScope} busy={busy} />
      <p className="mb-3 text-sm text-white/75" aria-live="polite">
        Scope: <span className="text-white">{m.scope.label}</span>
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Applications" value={m.applications.value} hint={`of ${m.applications.denominator} ${m.applications.denominatorLabel}`} />
        <Stat label="Unique people" value={m.uniquePeople.value} hint={m.uniquePeople.unlinked ? `${m.uniquePeople.unlinked} application(s) not yet linked to a person` : "Distinct people across these applications"} />
        <Stat label="Reviewed" value={share(m.reviewed)} hint={den} />
        <Stat label="Median time to review" value={m.medianHoursToReview.value === null ? "—" : `${m.medianHoursToReview.value} h`} hint={`${m.medianHoursToReview.note} · n=${m.medianHoursToReview.n}`} />
        <Stat label="Attended interview" value={share(m.interviewAttended)} hint={`${den} · ${m.interviewNoShow.value} no-show`} />
        <Stat label="Qualified" value={share(m.qualified)} hint={`${m.qualified.definition} · ${den}`} />
        <Stat label="Offered" value={share(m.offered)} hint={den} />
        <Stat label="Accepted" value={share(m.accepted)} hint={den} />
        <Stat label="Onboarding or later" value={share(m.onboarding)} hint={den} />
        <Stat label="Training complete" value={share(m.trainingComplete)} hint={`${m.trainingComplete.definition} · ${den}`} />
        <Stat label="Event-ready" value={share(m.eventReady)} hint={den} />
        <Stat label="Clicks / visits" value="Unknown" hint={m.clicks.note} />
        <Stat label="Cost per qualified" value={m.costPerQualified.value === null ? "—" : usd(m.costPerQualified.value)} hint={m.costPerQualified.note} />
        <Stat label="Cost per accepted" value={m.costPerAccepted.value === null ? "—" : usd(m.costPerAccepted.value)} hint={m.costPerAccepted.note} />
        <Stat
          label="Actual spend"
          value={m.spend.state === "complete" ? usd(m.spend.actualCents) : m.spend.state === "partial" ? "Partial" : "Not recorded"}
          hint={m.spend.totalLines ? `${m.spend.recordedLines} of ${m.spend.totalLines} budget lines have an actual` : "No budget lines"}
        />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="eyebrow text-white/60">By role and status</h3>
          {m.byRole.length === 0 ? (
            <Empty>No applications in this scope.</Empty>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {m.byRole.map((r) => (
                <li key={`${r.role}-${r.status}`} className="flex justify-between border border-white/10 px-3 py-1.5">
                  <span>
                    {humanize(r.role)} · {humanize(r.status)}
                  </span>
                  <span className="tabular-nums">{r.n}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="eyebrow text-white/60">By source</h3>
          {m.bySource.length === 0 ? (
            <Empty>No applications in this scope.</Empty>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {m.bySource.map((r) => (
                <li key={`${r.source}-${r.content}`} className="flex justify-between border border-white/10 px-3 py-1.5">
                  <span>
                    {r.source ?? "(none)"}
                    {r.content ? ` · ${r.content}` : ""}
                  </span>
                  <span className="tabular-nums">{r.n}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Panel>
  );
}

function Goals({ d }: { d: Detail }) {
  const set = useSetGoal();
  const blank = { roleKey: "", label: "", target: "", reserve: "0", existing: "", owner: "" };
  const [f, setF] = useState(blank);
  return (
    <Panel id="goals" title="Recruiting goals" eyebrow="Targets are planning inputs, not results">
      {d.goals.length === 0 ? (
        <Empty>No goals set.</Empty>
      ) : (
        <div className="relative overflow-x-auto"
          // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable region must be keyboard-focusable (axe scrollable-region-focusable, WCAG 2.1.1)
          tabIndex={0}
          aria-label="Recruiting goals table — scroll horizontally">
          <table className="cx-table min-w-[520px]">
            <caption className="sr-only">Recruiting goals</caption>
            <thead>
              <tr>
                <th scope="col">Role</th>
                <th scope="col">Target</th>
                <th scope="col">Reserve</th>
                <th scope="col">Already qualified</th>
                <th scope="col">Owner</th>
              </tr>
            </thead>
            <tbody>
              {d.goals.map((g) => (
                <tr key={g.id}>
                  <td>{g.label}</td>
                  <td className="tabular-nums">{g.target}</td>
                  <td className="tabular-nums">{g.reserve}</td>
                  <td className="tabular-nums">{countOrUnknown(g.existing_qualified)}</td>
                  <td>{g.owner_label ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {d.canWrite && (
        <form
          className="mt-4 grid gap-3 border-t border-white/10 pt-4 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            set.mutate(
              {
                campaignId: d.campaign.id,
                roleKey: f.roleKey,
                label: f.label,
                target: Number(f.target) || 0,
                reserve: Number(f.reserve) || 0,
                existingQualified: f.existing.trim() === "" ? null : Number(f.existing),
                ownerLabel: f.owner || null,
              },
              { onSuccess: () => setF(blank) },
            );
          }}
        >
          <TextField label="Role key" required pattern="[a-z0-9][a-z0-9_\-]*" value={f.roleKey} onChange={(e) => setF({ ...f, roleKey: e.target.value.toLowerCase() })} />
          <TextField label="Label" required value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} />
          <TextField label="Owner" value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} />
          <TextField label="Target" required inputMode="numeric" value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} />
          <TextField label="Reserve" inputMode="numeric" value={f.reserve} onChange={(e) => setF({ ...f, reserve: e.target.value })} />
          <TextField label="Already qualified" hint="Empty = Unknown" inputMode="numeric" value={f.existing} onChange={(e) => setF({ ...f, existing: e.target.value })} />
          <Btn type="submit" busy={set.isPending}>
            Save goal
          </Btn>
          <ErrorNote error={set.error} className="sm:col-span-3" />
        </form>
      )}
    </Panel>
  );
}

function Qr({ linkId }: { linkId: string }) {
  const qr = useCampaignLinkQr();
  const src = qr.data ? `data:image/svg+xml;utf8,${encodeURIComponent(qr.data.svg)}` : null;
  return (
    <div>
      {src ? (
        <div className="flex flex-wrap items-end gap-3">
          <img src={src} alt={`QR code for ${qr.data!.url}`} className="size-36 bg-white" />
          <a href={src} download={`qr-${linkId}.svg`} className="text-sm underline underline-offset-4">
            Download SVG
          </a>
        </div>
      ) : (
        <Btn size="sm" variant="ghost" busy={qr.isPending} onClick={() => qr.mutate({ linkId })}>
          Show QR
        </Btn>
      )}
      <ErrorNote error={qr.error} className="mt-2" />
    </div>
  );
}

function Links({ d }: { d: Detail }) {
  const add = useAddLink();
  const blank = { label: "", roleHint: "", source: "", medium: "", content: "" };
  const [f, setF] = useState(blank);
  const [copied, setCopied] = useState<string | null>(null);
  return (
    <Panel id="links" title="Tracked links" eyebrow="UTM links to the public application page">
      {!d.linkBaseConfigured && <p className="mb-3 text-sm">Public site URL is not configured, so link URLs and QR codes cannot be generated yet. [TBD — VERIFIED DATA REQUIRED]</p>}
      {d.links.length === 0 ? (
        <Empty>No links yet.</Empty>
      ) : (
        <ul className="space-y-2">
          {d.links.map((l) => (
            <li key={l.id} className="border border-white/12 px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">
                  {l.label} {l.role_hint && <Tag tone="muted">{l.role_hint}</Tag>}
                </p>
                <p className="text-xs text-white/65">
                  {l.utm_source} / {l.utm_medium}
                  {l.utm_content ? ` / ${l.utm_content}` : ""}
                </p>
              </div>
              {l.url && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <code className="break-all text-xs text-white/80">{l.url}</code>
                  <Btn
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      void navigator.clipboard?.writeText(l.url!).then(() => setCopied(l.id));
                    }}
                  >
                    {copied === l.id ? "Copied" : "Copy"}
                  </Btn>
                </div>
              )}
              {l.url && (
                <div className="mt-2">
                  <Qr linkId={l.id} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {d.canWrite && (
        <form
          className="mt-4 grid gap-3 border-t border-white/10 pt-4 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate(
              { campaignId: d.campaign.id, label: f.label, roleHint: (f.roleHint || null) as "host" | null, source: f.source, medium: f.medium, content: f.content || null },
              { onSuccess: () => setF(blank) },
            );
          }}
        >
          <TextField label="Label" required value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} />
          <SelectField label="Role preselect" options={[["", "None"], ["host", "Host"], ["promoter", "Promoter"], ["both", "Both"]]} value={f.roleHint} onChange={(e) => setF({ ...f, roleHint: e.target.value })} />
          <TextField label="utm_source" required pattern="[a-z0-9][a-z0-9_\-]*" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value.toLowerCase() })} />
          <TextField label="utm_medium" required pattern="[a-z0-9][a-z0-9_\-]*" value={f.medium} onChange={(e) => setF({ ...f, medium: e.target.value.toLowerCase() })} />
          <TextField label="utm_content" pattern="[a-z0-9][a-z0-9_\-]*" value={f.content} onChange={(e) => setF({ ...f, content: e.target.value.toLowerCase() })} />
          <Btn type="submit" busy={add.isPending}>
            Add link
          </Btn>
          <ErrorNote error={add.error} className="sm:col-span-3" />
        </form>
      )}
    </Panel>
  );
}

function Tasks({ d }: { d: Detail }) {
  const add = useAddTask();
  const setStatus = useSetTaskStatus();
  const blank = { kind: "calendar", dayOffset: "", title: "", channel: "", owner: "" };
  const [f, setF] = useState(blank);
  return (
    <Panel id="tasks" title="30-day calendar & assets">
      <div className="grid gap-4 lg:grid-cols-4">
        {d.phases.map((p) => {
          const list = d.tasks.filter((t) => t.phase === p.key);
          return (
            <section key={p.key} aria-labelledby={`ph-${p.key}`}>
              <h3 id={`ph-${p.key}`} className="text-sm font-medium">
                {p.label}
              </h3>
              <p className="text-xs text-white/60">
                {fmtDay(`${p.startsOn}T12:00:00`)} – {fmtDay(`${p.endsOn}T12:00:00`)}
              </p>
              {list.length === 0 ? (
                <p className="mt-2 text-sm text-white/65">Nothing scheduled.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {list.map((t) => (
                    <li key={t.id} className="border border-white/12 px-3 py-2 text-sm">
                      <p className={t.status === "done" ? "text-white/65 line-through" : ""}>
                        Day {t.day_offset} · {t.title}
                      </p>
                      <p className="text-xs text-white/60">
                        {humanize(t.kind)}
                        {t.channel ? ` · ${t.channel}` : ""}
                        {t.owner_label ? ` · ${t.owner_label}` : ""}
                      </p>
                      {d.canWrite && (
                        <SelectField
                          className="mt-2"
                          label="Status"
                          options={[["todo", "To do"], ["in_progress", "In progress"], ["done", "Done"]]}
                          value={t.status}
                          onChange={(e) => setStatus.mutate({ taskId: t.id, status: e.target.value as "todo" })}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
      {d.tasks.some((t) => !t.phase) && (
        <div className="mt-4">
          <h3 className="text-sm font-medium">Unscheduled</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {d.tasks
              .filter((t) => !t.phase)
              .map((t) => (
                <li key={t.id}>
                  {t.title} <span className="text-white/60">({humanize(t.status)})</span>
                  {d.canWrite && (
                    <SelectField
                      className="mt-2"
                      label="Status"
                      options={[["todo", "To do"], ["in_progress", "In progress"], ["done", "Done"]]}
                      value={t.status}
                      onChange={(e) => setStatus.mutate({ taskId: t.id, status: e.target.value as "todo" })}
                    />
                  )}
                </li>
              ))}
          </ul>
        </div>
      )}
      <ErrorNote error={setStatus.error} className="mt-2" />
      {d.canWrite && (
        <form
          className="mt-4 grid gap-3 border-t border-white/10 pt-4 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate(
              { campaignId: d.campaign.id, kind: f.kind as "calendar", dayOffset: f.dayOffset ? Number(f.dayOffset) : null, title: f.title, channel: f.channel || null, ownerLabel: f.owner || null },
              { onSuccess: () => setF(blank) },
            );
          }}
        >
          <TextField label="Title" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <SelectField label="Kind" options={[["calendar", "Calendar item"], ["asset", "Asset"]]} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} />
          <TextField label="Day (1–30)" type="number" min={1} max={30} value={f.dayOffset} onChange={(e) => setF({ ...f, dayOffset: e.target.value })} />
          <TextField label="Channel" value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })} />
          <TextField label="Owner" value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} />
          <Btn type="submit" busy={add.isPending}>
            Add task
          </Btn>
          <ErrorNote error={add.error} className="sm:col-span-3" />
        </form>
      )}
    </Panel>
  );
}

function Budget({ d }: { d: Detail }) {
  const set = useSetBudgetLine();
  const b = d.budget;
  const blank = { category: "", label: "", proposed: "", approved: "", actual: "" };
  const [f, setF] = useState(blank);
  const dollars = (c: number | null) => (c === null ? "" : String(c / 100));
  return (
    <Panel id="budget" title="Budget" eyebrow="Proposed → approved → actual, recorded separately">
      <p className="text-sm text-white/75">{b.note}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Stat label="Proposed" value={usd(b.proposedCents)} />
        <Stat label="Approved" value={usd(b.approvedCents)} />
        <Stat
          label="Actual spend"
          value={usd(b.actualCents)}
          hint={d.metrics.spend.state === "partial" ? `Partial: ${d.metrics.spend.recordedLines} of ${d.metrics.spend.totalLines} lines recorded — not a complete total` : undefined}
        />
      </div>
      {b.lines.length > 0 && (
        <div className="relative mt-3 overflow-x-auto"
          // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable region must be keyboard-focusable (axe scrollable-region-focusable, WCAG 2.1.1)
          tabIndex={0}
          aria-label="Budget table — scroll horizontally">
          <table className="cx-table min-w-[560px]">
            <caption className="sr-only">Budget lines</caption>
            <thead>
              <tr>
                <th scope="col">Line</th>
                <th scope="col">Proposed</th>
                <th scope="col">Approved</th>
                <th scope="col">Actual</th>
                {d.canWrite && (
                  <th scope="col">
                    <span className="sr-only">Edit</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {b.lines.map((l) => (
                <tr key={l.id}>
                  <td>{l.label}</td>
                  <td className="tabular-nums">{usd(l.proposed_cents)}</td>
                  <td className="tabular-nums">{usd(l.approved_cents)}</td>
                  <td className="tabular-nums">{usd(l.actual_cents)}</td>
                  {d.canWrite && (
                    <td>
                      <Btn
                        size="sm"
                        variant="ghost"
                        onClick={() => setF({ category: l.category, label: l.label, proposed: dollars(l.proposed_cents), approved: dollars(l.approved_cents), actual: dollars(l.actual_cents) })}
                      >
                        Edit
                      </Btn>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {d.canWrite && (
        <form
          className="mt-4 grid gap-3 border-t border-white/10 pt-4 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            set.mutate(
              { campaignId: d.campaign.id, category: f.category, label: f.label, proposedCents: toCents(f.proposed) ?? 0, approvedCents: toCents(f.approved), actualCents: toCents(f.actual) },
              { onSuccess: () => setF(blank) },
            );
          }}
        >
          <TextField label="Category key" required pattern="[a-z0-9][a-z0-9_\-]*" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value.toLowerCase() })} />
          <TextField label="Label" required value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} />
          <TextField label="Proposed (USD)" required inputMode="decimal" value={f.proposed} onChange={(e) => setF({ ...f, proposed: e.target.value })} />
          <TextField label="Approved (USD)" hint="Empty = not approved" inputMode="decimal" value={f.approved} onChange={(e) => setF({ ...f, approved: e.target.value })} />
          <TextField label="Actual (USD)" hint="Empty = not recorded (not $0)" inputMode="decimal" value={f.actual} onChange={(e) => setF({ ...f, actual: e.target.value })} />
          <Btn type="submit" busy={set.isPending}>
            Save line
          </Btn>
          <ErrorNote error={set.error} className="sm:col-span-3" />
        </form>
      )}
    </Panel>
  );
}

export default function CampaignDetailPage({ id }: { id: string }) {
  const [scope, setScope] = useState<Scope>({ role: "", from: "", to: "" });
  const [applied, setApplied] = useState<Scope>(scope);
  const onScope = (s: Scope) => {
    setScope(s);
    if (!(s.from && s.to && s.from > s.to)) setApplied(s);
  };
  const q = useCampaign({
    id,
    role: (applied.role || null) as CampaignDetailInput["role"],
    from: applied.from || null,
    to: applied.to || null,
  });
  usePageMeta(q.data ? `${q.data.campaign.name} · Campaigns` : "Campaign · Staff", { noindex: true });
  if (q.isPending) return <Loading />;
  if (q.error || !q.data) return <ErrorNote error={q.error} />;
  const d = q.data;
  return (
    <div className="space-y-6">
      <p>
        <Link href="/staff/campaigns" className="text-sm text-white/75 underline underline-offset-4 hover:text-white">
          ← All campaigns
        </Link>
      </p>
      <PageTitle eyebrow={d.campaign.is_planning_seed ? "Campaign · planning seed, not live results" : "Campaign"} title={d.campaign.name} />
      <Header d={d} />
      <Metrics d={d} scope={scope} onScope={onScope} busy={q.isFetching && !q.isPending} />
      <Goals d={d} />
      <Links d={d} />
      <Tasks d={d} />
      <Budget d={d} />
    </div>
  );
}

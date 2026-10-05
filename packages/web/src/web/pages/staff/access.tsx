import { useState } from "react";
import { Btn, Empty, ErrorNote, Loading, PageTitle, Panel, SelectField, Tag, TextField, fmtDate, humanize } from "../../components/console/ui";
import { usePageMeta } from "../../hooks/use-page-meta";
import { useEvents } from "../../queries/events";
import { useGrantStaff, useRevokeStaff, useStaffList } from "../../queries/integration";

const ROLE_NOTES: Record<string, string> = {
  admin: "Full console. Cannot approve compensation terms.",
  recruiter: "Applicants, interviews, scorecards, offers, campaigns.",
  department_lead: "Own department roster and attendance at an event.",
  event_director: "Events, assignments, credentials, promoters.",
  promotion_lead: "Campaigns and promoter attribution.",
  compensation_approver: "Approves terms drafted by someone else.",
  serve_coordinator: "Nonprofit Serve Team queue.",
};

export default function AccessPage() {
  usePageMeta("Staff access · Staff", { noindex: true });
  const q = useStaffList();
  const events = useEvents();
  const grant = useGrantStaff();
  const revoke = useRevokeStaff();
  const blank = { email: "", role: "recruiter", eventId: "", departmentKey: "" };
  const [f, setF] = useState(blank);
  const [revoking, setRevoking] = useState<{ id: string; reason: string } | null>(null);
  const eventList = events.data ?? [];
  return (
    <div className="space-y-6">
      <PageTitle eyebrow="Administration" title="Staff access" />
      <p className="max-w-3xl text-sm text-white/75">
        Access is granted to existing accounts only (the person must have signed in once). No account is created and no invitation is sent. A signed-in account with no membership sees nothing.
      </p>
      {q.isPending ? (
        <Loading />
      ) : q.error || !q.data ? (
        <ErrorNote error={q.error} />
      ) : (
        <>
          <Panel id="members" title={`Active memberships (${q.data.rows.length})`}>
            {q.data.rows.length === 0 ? (
              <Empty>No memberships.</Empty>
            ) : (
              <ul className="divide-y divide-white/10">
                {q.data.rows.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div>
                      <p className="font-medium">
                        {m.name ?? "—"} <span className="text-sm text-white/65">{m.email}</span>
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/65">
                        <Tag>{humanize(m.role)}</Tag>
                        {m.departmentKey && <span>dept {humanize(m.departmentKey)}</span>}
                        {m.eventId && <span>event {eventList.find((e) => e.id === m.eventId)?.name ?? m.eventId.slice(0, 8)}</span>}
                        <span>granted {fmtDate(m.grantedAt)}</span>
                      </p>
                    </div>
                    <Btn size="sm" variant="ghost" aria-label={`Revoke ${humanize(m.role)} for ${m.email ?? m.name ?? "this account"}`} onClick={() => setRevoking({ id: m.id, reason: "" })}>
                      Revoke
                    </Btn>
                  </li>
                ))}
              </ul>
            )}
            {revoking && (
              <form
                className="mt-3 flex flex-wrap items-end gap-2 border border-white/15 p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  revoke.mutate(revoking, { onSuccess: () => setRevoking(null) });
                }}
              >
                <TextField className="min-w-60 flex-1" label="Reason for revoking" required minLength={3} value={revoking.reason} onChange={(e) => setRevoking({ ...revoking, reason: e.target.value })} />
                <Btn type="submit" variant="solid" busy={revoke.isPending}>
                  Confirm revoke
                </Btn>
                <Btn variant="ghost" onClick={() => setRevoking(null)}>
                  Cancel
                </Btn>
              </form>
            )}
            <ErrorNote error={revoke.error} className="mt-2" />
          </Panel>
          <Panel id="grant" title="Grant access">
            <form
              className="grid gap-3 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                grant.mutate(
                  { email: f.email, role: f.role as "recruiter", eventId: f.eventId || null, departmentKey: f.departmentKey || null },
                  { onSuccess: () => setF(blank) },
                );
              }}
            >
              <TextField label="Account email" type="email" required autoComplete="off" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
              <SelectField
                label="Role"
                hint={ROLE_NOTES[f.role]}
                options={q.data.roles.map((r) => [r, humanize(r)] as [string, string])}
                value={f.role}
                onChange={(e) => setF({ ...f, role: e.target.value, eventId: "", departmentKey: "" })}
              />
              {(f.role === "event_director" || f.role === "department_lead") && (
                <SelectField
                  label="Limit to event"
                  options={[["", "All events"], ...eventList.map((e) => [e.id, e.name] as [string, string])]}
                  value={f.eventId}
                  onChange={(e) => setF({ ...f, eventId: e.target.value })}
                />
              )}
              {f.role === "department_lead" && (
                <TextField
                  label="Department key"
                  hint="Required for department leads, e.g. guest_experience"
                  required
                  value={f.departmentKey}
                  onChange={(e) => setF({ ...f, departmentKey: e.target.value })}
                />
              )}
              <Btn type="submit" variant="solid" busy={grant.isPending}>
                Grant
              </Btn>
              <ErrorNote error={grant.error} className="sm:col-span-2" />
            </form>
          </Panel>
        </>
      )}
    </div>
  );
}

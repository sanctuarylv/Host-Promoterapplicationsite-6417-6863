import { useState } from "react";
import { Link } from "wouter";
import {
  Btn,
  Check,
  Empty,
  ErrorNote,
  Loading,
  PageTitle,
  Panel,
  SelectField,
 
  Stat,
  Tag,
  TextArea,
  TextField,
  countOrUnknown,
  fmtDate,
  fmtDay,
  humanize,
} from "../../components/console/ui";
import { usePageMeta } from "../../hooks/use-page-meta";
import { useAssignable } from "../../queries/recruiting";
import {
  useAddRunOfShow,
  useApproveAssignment,
  useCancelAssignment,
  useEventDetail,
  useProposeAssignment,
  useSaveCloseout,
  useSetEventDate,
  useSetOverride,
  useSetProvider,
} from "../../queries/events";
import {
  useAssignmentAttendance,
  useAssignmentCredentials,
  useCorrectAttendance,
  useCreatePromoterLink,
  useIssueCredential,
  usePromoterAggregates,
  useRecordAttendance,
  useRevokeCredential,
  useRevokePromoterLink,
  useVerifyCredential,
} from "../../queries/credentials";

type Detail = NonNullable<ReturnType<typeof useEventDetail>["data"]>;
type Assignment = Detail["assignments"][number];

const WORKFORCE_SHORT: Record<string, string> = {
  paid_group: "Group (paid)",
  nonprofit_serve: "Serve Team",
  founder_tbd: "Founder TBD",
  venue_provider: "Venue",
  provider: "Provider",
  unclassified: "Unclassified",
};
const AMBIGUITY: [string, string][] = [
  ["reject", "Reject DST-ambiguous times"],
  ["earlier", "Use the earlier instance"],
  ["later", "Use the later instance"],
];
const KINDS = [
  ["check_in", "Check in"],
  ["break_start", "Break start"],
  ["break_end", "Break end"],
  ["check_out", "Check out"],
] as const;
type Kind = (typeof KINDS)[number][0];

const toIso = (local: string) => (local ? new Date(local).toISOString() : "");

/* ---------------- Date & venue ---------------- */
function DatePanel({ d }: { d: Detail }) {
  const ev = d.event;
  const setDate = useSetEventDate();
  const [date, setD] = useState(ev.local_date ?? "");
  const [amb, setAmb] = useState("reject");
  const [venue, setVenue] = useState(ev.venue_confirmed);
  return (
    <Panel id="date" title="Date & venue" eyebrow={ev.timezone}>
      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-white/60">Date</dt>
          <dd className="mt-1 flex items-center gap-2">
            {ev.local_date ? fmtDay(`${ev.local_date}T12:00:00`) : "Not set"} <Tag tone={ev.date_confirmed ? "solid" : "warn"}>{ev.date_confirmed ? "Confirmed" : "Unconfirmed"}</Tag>
          </dd>
        </div>
        <div>
          <dt className="text-white/60">Venue</dt>
          <dd className="mt-1 flex items-center gap-2">
            {ev.venue_name ?? "[TBD — VERIFIED DATA REQUIRED]"} <Tag tone={ev.venue_confirmed ? "solid" : "warn"}>{ev.venue_confirmed ? "Confirmed" : "Unconfirmed"}</Tag>
          </dd>
        </div>
        <div>
          <dt className="text-white/60">Planning guests</dt>
          <dd className="mt-1">{countOrUnknown(ev.planning_guests)}</dd>
        </div>
      </dl>
      {(ev.resolved_milestones ?? []).length > 0 && (
        <ul className="mt-4 grid gap-1 text-sm sm:grid-cols-2">
          {(ev.resolved_milestones ?? []).map((m) => (
            <li key={m.key} className="flex justify-between border border-white/10 px-3 py-1.5">
              <span>{m.label}</span>
              <span className="tabular-nums text-white/80">{m.local}</span>
            </li>
          ))}
        </ul>
      )}
      {d.can.manage && (
        <form
          className="mt-4 grid gap-3 border-t border-white/10 pt-4 sm:grid-cols-4 sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (date) setDate.mutate({ id: ev.id, revision: ev.revision, localDate: date, ambiguity: amb as "reject", venueConfirmed: venue });
          }}
        >
          <TextField label="Confirm local date" type="date" required value={date} onChange={(e) => setD(e.target.value)} />
          <SelectField label="DST handling" options={AMBIGUITY} value={amb} onChange={(e) => setAmb(e.target.value)} />
          <Check label="Venue confirmed" checked={venue} onChange={(e) => setVenue(e.target.checked)} />
          <Btn type="submit" variant="solid" busy={setDate.isPending}>
            Save date
          </Btn>
          <ErrorNote error={setDate.error} className="sm:col-span-4" />
          <p className="text-xs text-white/60 sm:col-span-4">Recorded locally. Nothing is booked or announced by saving a date.</p>
        </form>
      )}
    </Panel>
  );
}

/* ---------------- Coverage ---------------- */
function CoveragePanel({ d }: { d: Detail }) {
  const override = useSetOverride();
  const provider = useSetProvider();
  const [ov, setOv] = useState({ roleKey: "", count: "", reason: "" });
  const [pv, setPv] = useState({ roleKey: "", provider: "", count: "", status: "provisional", note: "" });
  const roleOpts: [string, string][] = [["", "Choose role…"], ...d.coverage.map((c) => [c.roleKey, c.title] as [string, string])];
  const num = (s: string) => (s.trim() === "" ? null : Number(s));
  return (
    <Panel id="coverage" title="Coverage" eyebrow="Unknown counts stay Unknown — never treated as zero">
      <div className="overflow-x-auto">
        <table className="cx-table min-w-[760px]">
          <caption className="sr-only">Role coverage for this event</caption>
          <thead>
            <tr>
              <th scope="col">Role</th>
              <th scope="col">Workforce</th>
              <th scope="col">Planned</th>
              <th scope="col">Provider</th>
              <th scope="col">Sanctuary demand</th>
              <th scope="col">Approved</th>
              <th scope="col">Ready</th>
              <th scope="col">Gap</th>
            </tr>
          </thead>
          <tbody>
            {d.coverage.map((c) => (
              <tr key={c.roleKey}>
                <td>
                  <span className="font-medium">{c.title}</span>
                  <span className="block text-xs text-white/60">{humanize(c.department)}</span>
                </td>
                <td>
                  <Tag tone={c.workforce === "unclassified" ? "warn" : "muted"}>{WORKFORCE_SHORT[c.workforce] ?? c.workforce}</Tag>
                </td>
                <td className="tabular-nums">{countOrUnknown(c.planned)}</td>
                <td className="text-xs">{c.provider ? `${countOrUnknown(c.provider.count)} · ${c.provider.names.join(", ")} (${c.provider.status.join("/")})` : "—"}</td>
                <td className="tabular-nums">{countOrUnknown(c.sanctuaryDemand)}</td>
                <td className="tabular-nums">{c.filled}</td>
                <td className="tabular-nums">{c.ready}</td>
                <td className="tabular-nums">{c.gap === null ? "Unknown" : c.gap ? <strong>{c.gap}</strong> : "0"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {d.overrides.length > 0 && (
        <div className="mt-4">
          <h3 className="eyebrow text-white/60">Event overrides</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {d.overrides.map((o) => (
              <li key={o.id}>
                {o.role_key}: {countOrUnknown(o.count)} — <span className="text-white/65">{o.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {d.can.manage && (
        <div className="mt-4 grid gap-4 border-t border-white/10 pt-4 lg:grid-cols-2">
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (ov.roleKey && ov.reason) override.mutate({ eventId: d.event.id, roleKey: ov.roleKey, count: num(ov.count), reason: ov.reason });
            }}
          >
            <h3 className="text-sm font-medium">Override a count for this event</h3>
            <SelectField label="Role" options={roleOpts} value={ov.roleKey} onChange={(e) => setOv({ ...ov, roleKey: e.target.value })} />
            <TextField label="Count" hint="Leave empty to mark as Unknown." inputMode="numeric" value={ov.count} onChange={(e) => setOv({ ...ov, count: e.target.value })} />
            <TextField label="Reason" required minLength={3} value={ov.reason} onChange={(e) => setOv({ ...ov, reason: e.target.value })} />
            <Btn type="submit" busy={override.isPending}>
              Save override
            </Btn>
            <ErrorNote error={override.error} />
          </form>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (pv.roleKey && pv.provider)
                provider.mutate({ eventId: d.event.id, roleKey: pv.roleKey, provider: pv.provider, count: num(pv.count), status: pv.status as "provisional", note: pv.note || undefined });
            }}
          >
            <h3 className="text-sm font-medium">Venue / provider fulfilment</h3>
            <SelectField label="Role" options={roleOpts} value={pv.roleKey} onChange={(e) => setPv({ ...pv, roleKey: e.target.value })} />
            <TextField label="Provider" required value={pv.provider} onChange={(e) => setPv({ ...pv, provider: e.target.value })} />
            <TextField label="Count" hint="Empty = Unknown (venue to confirm)." inputMode="numeric" value={pv.count} onChange={(e) => setPv({ ...pv, count: e.target.value })} />
            <SelectField label="Status" options={[["provisional", "Provisional"], ["confirmed", "Confirmed"]]} value={pv.status} onChange={(e) => setPv({ ...pv, status: e.target.value })} />
            <Btn type="submit" busy={provider.isPending}>
              Save provider
            </Btn>
            <ErrorNote error={provider.error} />
          </form>
        </div>
      )}
    </Panel>
  );
}

/* ---------------- Credential + attendance for one assignment ---------------- */
function AccessAndTime({ a, canManage }: { a: Assignment; canManage: boolean }) {
  const creds = useAssignmentCredentials(a.id);
  const att = useAssignmentAttendance(a.id);
  const issue = useIssueCredential();
  const revoke = useRevokeCredential();
  const record = useRecordAttendance();
  const correct = useCorrectAttendance();
  const [fix, setFix] = useState<{ entryId: string; reason: string; kind: string; at: string } | null>(null);
  const active = (creds.data ?? []).filter((c) => !c.revokedAt);
  return (
    <div className="mt-3 grid gap-4 border-t border-white/10 pt-3 lg:grid-cols-2">
      <div>
        <h4 className="eyebrow text-white/60">Credential</h4>
        {creds.isPending ? (
          <Loading />
        ) : creds.error ? (
          <ErrorNote error={creds.error} />
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {(creds.data ?? []).length === 0 && <li className="text-white/65">None issued.</li>}
            {(creds.data ?? []).map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 border border-white/10 px-3 py-1.5">
                <span>
                  Issued {fmtDate(c.issuedAt)} · expires {fmtDate(c.expiresAt)}
                  {c.revokedAt && <span className="text-white/65"> · revoked ({humanize(c.reason)})</span>}
                </span>
                {!c.revokedAt && canManage && (
                  <Btn size="sm" variant="ghost" busy={revoke.isPending} onClick={() => revoke.mutate({ credentialId: c.id, reason: "revoked_by_staff" })}>
                    Revoke
                  </Btn>
                )}
              </li>
            ))}
          </ul>
        )}
        {canManage && a.status === "approved" && (
          <Btn size="sm" className="mt-2" busy={issue.isPending} onClick={() => issue.mutate({ assignmentId: a.id, validHours: 24 })}>
            {active.length ? "Rotate credential" : "Issue credential"}
          </Btn>
        )}
        <p className="mt-1 text-xs text-white/60">The credential value is shown only in the worker's portal, never here.</p>
        <ErrorNote error={issue.error ?? revoke.error} className="mt-2" />
      </div>
      <div>
        <h4 className="eyebrow text-white/60">Attendance (append-only)</h4>
        {att.isPending ? (
          <Loading />
        ) : att.error ? (
          <ErrorNote error={att.error} />
        ) : (
          <>
            <p className="mt-1 text-sm">
              Worked: <strong className="tabular-nums">{att.data.minutes}</strong> min
              {att.data.issues.length > 0 && <span className="text-white/75"> · {att.data.issues.join("; ")}</span>}
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              {att.data.log.map((l) => {
                const voided = att.data.log.some((x) => x.kind === "void" && x.corrects_id === l.id);
                return (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 border border-white/10 px-3 py-1.5">
                    <span className={voided ? "text-white/60 line-through" : ""}>
                      {humanize(l.kind)} · {fmtDate(l.at_utc)} <span className="text-xs text-white/60">({humanize(l.source)})</span>
                      {l.reason && <span className="block text-xs text-white/65">{l.reason}</span>}
                    </span>
                    {l.kind !== "void" && !voided && a.status === "approved" && (
                      <Btn size="sm" variant="ghost" onClick={() => setFix({ entryId: l.id, reason: "", kind: "", at: "" })}>
                        Correct
                      </Btn>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
        {a.status === "approved" && (
          <div className="mt-2 flex flex-wrap gap-2">
            {KINDS.map(([k, label]) => (
              <Btn key={k} size="sm" busy={record.isPending && record.variables?.kind === k} onClick={() => record.mutate({ assignmentId: a.id, kind: k as Kind })}>
                {label}
              </Btn>
            ))}
          </div>
        )}
        <ErrorNote error={record.error} className="mt-2" />
        {fix && (
          <form
            className="mt-3 grid gap-2 border border-white/15 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              correct.mutate(
                { entryId: fix.entryId, reason: fix.reason, replacement: fix.kind && fix.at ? { kind: fix.kind as Kind, at: toIso(fix.at) } : null },
                { onSuccess: () => setFix(null) },
              );
            }}
          >
            <p className="text-xs text-white/65">The original entry stays in the log and is marked void. Optionally add a replacement.</p>
            <TextField label="Reason (required)" required minLength={5} value={fix.reason} onChange={(e) => setFix({ ...fix, reason: e.target.value })} />
            <SelectField label="Replacement entry" options={[["", "None — void only"], ...KINDS.map(([k, l]) => [k, l] as [string, string])]} value={fix.kind} onChange={(e) => setFix({ ...fix, kind: e.target.value })} />
            {fix.kind && <TextField label="Replacement time" type="datetime-local" required value={fix.at} onChange={(e) => setFix({ ...fix, at: e.target.value })} />}
            <div className="flex gap-2">
              <Btn type="submit" variant="solid" busy={correct.isPending}>
                Save correction
              </Btn>
              <Btn variant="ghost" onClick={() => setFix(null)}>
                Cancel
              </Btn>
            </div>
            <ErrorNote error={correct.error} />
          </form>
        )}
      </div>
    </div>
  );
}

/* ---------------- Assignments ---------------- */
function AssignmentRow({ a, d }: { a: Assignment; d: Detail }) {
  const approve = useApproveAssignment();
  const cancel = useCancelAssignment();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const role = d.coverage.find((c) => c.roleKey === a.role_key);
  return (
    <li className="border border-white/12 px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">{a.personName}</p>
          <p className="text-sm text-white/75">
            {role?.title ?? a.role_key} · {humanize(a.department_key)}
          </p>
          <p className="text-xs text-white/65">{a.shiftLocal ?? "Shift not set"}{a.shift_confirmed ? " · shift confirmed" : ""}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tag tone={a.status === "approved" ? "solid" : "default"}>{a.status}</Tag>
          <Tag tone={a.readiness.ready ? "solid" : "warn"}>{a.readiness.ready ? "Ready" : "Not ready"}</Tag>
        </div>
      </div>
      {!a.readiness.ready && a.readiness.blockers.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-sm text-white/80">
          {a.readiness.blockers.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {a.status === "proposed" && d.can.approve && (
          <>
            <Btn size="sm" variant="solid" busy={approve.isPending} onClick={() => approve.mutate({ id: a.id, revision: a.revision, confirmShift: Boolean(a.shift_start_utc) })}>
              Approve
            </Btn>
          </>
        )}
        <Btn size="sm" variant="ghost" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "Hide access & time" : "Access & time"}
        </Btn>
        {reason === null && (
          <Btn size="sm" variant="ghost" onClick={() => setReason("")}>
            Cancel assignment
          </Btn>
        )}
      </div>
      {reason !== null && (
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            cancel.mutate({ id: a.id, revision: a.revision, reason }, { onSuccess: () => setReason(null) });
          }}
        >
          <TextField className="min-w-60 flex-1" label="Reason for cancelling" required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} hint="Active credentials for this assignment are revoked." />
          <Btn type="submit" busy={cancel.isPending}>
            Confirm cancel
          </Btn>
          <Btn variant="ghost" onClick={() => setReason(null)}>
            Keep
          </Btn>
        </form>
      )}
      <ErrorNote error={approve.error ?? cancel.error} className="mt-2" />
      {open && <AccessAndTime a={a} canManage={d.can.manage} />}
    </li>
  );
}

function ProposeForm({ d }: { d: Detail }) {
  const people = useAssignable();
  const propose = useProposeAssignment();
  const day = d.event.local_date ?? "";
  const blank = { personId: "", roleKey: "", withShift: false, startDate: day, startTime: "18:00", endDate: day, endTime: "23:30", ambiguity: "reject", supervisor: "" };
  const [f, setF] = useState(blank);
  const clashId = (propose.error as { data?: { clashId?: string } } | null)?.data?.clashId;
  const assignableRoles = d.coverage.filter((c) => c.workforce !== "venue_provider" && c.workforce !== "provider");
  const submit = (concurrentWith?: string) =>
    propose.mutate(
      {
        eventId: d.event.id,
        personId: f.personId,
        roleKey: f.roleKey,
        shift: f.withShift ? { startDate: f.startDate, startTime: f.startTime, endDate: f.endDate, endTime: f.endTime, ambiguity: f.ambiguity as "reject" } : null,
        supervisorPersonId: f.supervisor || null,
        concurrentWith: concurrentWith ?? null,
      },
      { onSuccess: () => setF(blank) },
    );
  const supervisors = d.assignments.filter((a) => a.status === "approved");
  return (
    <form
      className="grid gap-3 border-t border-white/10 pt-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (f.personId && f.roleKey) submit();
      }}
    >
      <h3 className="text-sm font-medium sm:col-span-2">Propose an assignment</h3>
      {people.error ? (
        <ErrorNote error={people.error} className="sm:col-span-2" />
      ) : (
        <SelectField
          label="Person"
          hint="Only people with an accepted Sanctuary LV Group offer are listed."
          options={[["", people.isPending ? "Loading…" : "Choose person…"], ...(people.data ?? []).map((p) => [p.personId, `${p.name} · ${humanize(p.role)}`] as [string, string])]}
          value={f.personId}
          onChange={(e) => setF({ ...f, personId: e.target.value })}
        />
      )}
      <SelectField
        label="Role"
        hint="Unclassified roles are blocked until classified in a new template version."
        options={[["", "Choose role…"], ...assignableRoles.map((c) => [c.roleKey, `${c.title} (${WORKFORCE_SHORT[c.workforce] ?? c.workforce})`] as [string, string])]}
        value={f.roleKey}
        onChange={(e) => setF({ ...f, roleKey: e.target.value })}
      />
      <Check className="sm:col-span-2" label="Set a shift now" checked={f.withShift} onChange={(e) => setF({ ...f, withShift: e.target.checked })} />
      {f.withShift && (
        <>
          <TextField label="Start date" type="date" required value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} />
          <TextField label="Start time" type="time" required value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} />
          <TextField label="End date" type="date" required hint="Use the next date for overnight shifts." value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} />
          <TextField label="End time" type="time" required value={f.endTime} onChange={(e) => setF({ ...f, endTime: e.target.value })} />
          <SelectField label="DST handling" options={AMBIGUITY} value={f.ambiguity} onChange={(e) => setF({ ...f, ambiguity: e.target.value })} />
        </>
      )}
      <SelectField
        label="Supervisor"
        options={[["", "None yet"], ...supervisors.map((a) => [a.person_id, a.personName] as [string, string])]}
        value={f.supervisor}
        onChange={(e) => setF({ ...f, supervisor: e.target.value })}
      />
      <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
        <Btn type="submit" variant="solid" busy={propose.isPending}>
          Propose
        </Btn>
        {clashId && d.can.approve && (
          <Btn onClick={() => submit(clashId)} busy={propose.isPending}>
            Approve as compatible overlap
          </Btn>
        )}
      </div>
      <ErrorNote error={propose.error} className="sm:col-span-2" />
    </form>
  );
}

/* ---------------- Door check ---------------- */
function DoorCheck({ eventId }: { eventId: string }) {
  const verify = useVerifyCredential();
  const [token, setToken] = useState("");
  const [checkIn, setCheckIn] = useState(false);
  const r = verify.data;
  return (
    <Panel id="door" title="Staff credential check" eyebrow="Paste or scan a worker credential">
      <form
        className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (token.trim().length >= 10) verify.mutate({ eventId, token: token.trim(), recordCheckIn: checkIn });
        }}
      >
        <TextField label="Credential" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} />
        <Check label="Record check-in if valid" checked={checkIn} onChange={(e) => setCheckIn(e.target.checked)} />
        <Btn type="submit" busy={verify.isPending}>
          Verify
        </Btn>
      </form>
      {r && (
        <output className="mt-3 block border border-white/30 px-4 py-3 text-sm">
          <Tag tone={r.result === "valid" ? "solid" : "warn"}>{humanize(r.result)}</Tag>
          {r.result === "valid" && (
            <span className="ml-2">
              {r.name} · zones: {r.zones.length ? r.zones.join(", ") : "none listed"}
            </span>
          )}
        </output>
      )}
      <ErrorNote error={verify.error} className="mt-2" />
    </Panel>
  );
}

/* ---------------- Promoters ---------------- */
function PromotersPanel({ d }: { d: Detail }) {
  const agg = usePromoterAggregates(d.event.id, d.can.promoters);
  const create = useCreatePromoterLink();
  const revoke = useRevokePromoterLink();
  const [person, setPerson] = useState("");
  const promoters = d.assignments.filter((a) => a.status === "approved" && a.role_key.startsWith("promoter"));
  return (
    <Panel id="promoters" title="Promoter links & attribution" eyebrow="Aggregates only — no guest identities">
      {agg.isPending ? (
        <Loading />
      ) : agg.error ? (
        <ErrorNote error={agg.error} />
      ) : (
        <>
          <p className="text-xs text-white/65">Source: {agg.data.source}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            <Stat label="Registrations" value={agg.data.totals.registrations} />
            <Stat label="Unique admitted" value={agg.data.totals.uniqueAdmitted} hint={`of ${agg.data.totals.registrations} registrations`} />
            <Stat label="Re-entries" value={agg.data.totals.reentries} hint="Not counted as attendees" />
            <Stat label="Unattributed" value={agg.data.totals.unattributedRegistrations} hint={`of ${agg.data.totals.registrations} registrations`} />
          </div>
          {agg.data.byPromoter.length === 0 ? (
            <Empty>No promoter links for this event yet.</Empty>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="cx-table min-w-[560px]">
                <caption className="sr-only">Registrations and admissions by promoter link</caption>
                <thead>
                  <tr>
                    <th scope="col">Promoter</th>
                    <th scope="col">Code</th>
                    <th scope="col">Registrations</th>
                    <th scope="col">Admitted</th>
                    <th scope="col">Show rate</th>
                    <th scope="col">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {agg.data.byPromoter.map((p) => (
                    <tr key={p.linkId}>
                      <td>{p.promoter}</td>
                      <td className="font-mono text-xs">
                        {p.code} {p.status !== "approved" && <Tag tone="muted">{p.status}</Tag>}
                      </td>
                      <td className="tabular-nums">{p.registrations}</td>
                      <td className="tabular-nums">{p.uniqueAdmitted}</td>
                      <td className="tabular-nums">{p.showRate ? `${p.showRate.num}/${p.showRate.den} (${Math.round((p.showRate.num / p.showRate.den) * 100)}%)` : "No registrations"}</td>
                      <td>
                        {p.status === "approved" && (
                          <Btn size="sm" variant="ghost" busy={revoke.isPending} onClick={() => revoke.mutate({ linkId: p.linkId })}>
                            Revoke
                          </Btn>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      <form
        className="mt-4 flex flex-wrap items-end gap-2 border-t border-white/10 pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (person) create.mutate({ eventId: d.event.id, personId: person }, { onSuccess: () => setPerson("") });
        }}
      >
        <SelectField
          className="min-w-60 flex-1"
          label="Approve a promoter link for"
          hint="Requires an approved Promoter assignment at this event."
          options={[["", promoters.length ? "Choose promoter…" : "No approved promoters yet"], ...promoters.map((a) => [a.person_id, a.personName] as [string, string])]}
          value={person}
          onChange={(e) => setPerson(e.target.value)}
        />
        <Btn type="submit" busy={create.isPending} disabled={!person}>
          Create link
        </Btn>
      </form>
      <ErrorNote error={create.error ?? revoke.error} className="mt-2" />
    </Panel>
  );
}

/* ---------------- Run of show + closeout ---------------- */
function RunOfShow({ d }: { d: Detail }) {
  const add = useAddRunOfShow();
  const blank = { milestoneKey: "", offsetMin: "0", title: "", departmentKey: "", notes: "" };
  const [f, setF] = useState(blank);
  const milestones = d.event.resolved_milestones ?? [];
  return (
    <Panel id="ros" title="Run of show">
      {d.runOfShow.length === 0 ? (
        <Empty>No run-of-show items yet.</Empty>
      ) : (
        <ol className="space-y-1 text-sm">
          {d.runOfShow.map((r) => (
            <li key={r.id} className="border border-white/10 px-3 py-1.5">
              <span className="tabular-nums text-white/65">
                {r.milestone_key ?? "—"} {r.offset_min >= 0 ? "+" : ""}
                {r.offset_min}m
              </span>{" "}
              · <span className="font-medium">{r.title}</span>
              {r.department_key && <span className="text-white/65"> · {humanize(r.department_key)}</span>}
            </li>
          ))}
        </ol>
      )}
      {d.can.manage && (
        <form
          className="mt-4 grid gap-3 border-t border-white/10 pt-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate(
              { eventId: d.event.id, milestoneKey: f.milestoneKey || null, offsetMin: Number(f.offsetMin) || 0, title: f.title, departmentKey: f.departmentKey || null, notes: f.notes || undefined },
              { onSuccess: () => setF(blank) },
            );
          }}
        >
          <TextField label="Title" required minLength={2} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <SelectField label="Relative to milestone" options={[["", "None"], ...milestones.map((m) => [m.key, m.label] as [string, string])]} value={f.milestoneKey} onChange={(e) => setF({ ...f, milestoneKey: e.target.value })} />
          <TextField label="Offset (minutes)" inputMode="numeric" value={f.offsetMin} onChange={(e) => setF({ ...f, offsetMin: e.target.value })} />
          <SelectField label="Department" options={[["", "All"], ...[...new Set(d.coverage.map((c) => c.department))].map((k) => [k, humanize(k)] as [string, string])]} value={f.departmentKey} onChange={(e) => setF({ ...f, departmentKey: e.target.value })} />
          <Btn type="submit" busy={add.isPending}>
            Add item
          </Btn>
          <ErrorNote error={add.error} className="sm:col-span-2" />
        </form>
      )}
    </Panel>
  );
}

function Closeout({ d }: { d: Detail }) {
  const save = useSaveCloseout();
  const c = d.closeout;
  const [f, setF] = useState({
    coverageIssues: c?.coverage_issues ?? "",
    trainingFeedback: c?.training_feedback ?? "",
    guestServiceFeedback: c?.guest_service_feedback ?? "",
    contentHandoff: c?.content_handoff ?? "",
    incidentRefs: c?.incident_refs ?? "",
  });
  const submitted = c?.status === "submitted";
  const fields: [keyof typeof f, string][] = [
    ["coverageIssues", "Coverage issues"],
    ["trainingFeedback", "Training feedback"],
    ["guestServiceFeedback", "Guest service feedback"],
    ["contentHandoff", "Content handoff"],
    ["incidentRefs", "Incident references (IDs only — no details here)"],
  ];
  if (!d.can.manage && !c) return null;
  return (
    <Panel id="closeout" title="Post-event closeout" eyebrow={submitted ? "Submitted — read only" : c ? `Draft · revision ${c.revision}` : "Not started"}>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const submit = (e.nativeEvent as SubmitEvent).submitter?.getAttribute("data-submit") === "1";
          save.mutate({ eventId: d.event.id, revision: c?.revision ?? 0, submit, ...f });
        }}
      >
        {fields.map(([k, label]) => (
          <TextArea key={k} label={label} rows={3} readOnly={submitted || !d.can.manage} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
        ))}
        {!submitted && d.can.manage && (
          <div className="flex flex-wrap gap-2">
            <Btn type="submit" busy={save.isPending}>
              Save draft
            </Btn>
            <Btn type="submit" variant="solid" data-submit="1" busy={save.isPending}>
              Submit closeout
            </Btn>
          </div>
        )}
        <ErrorNote error={save.error} />
      </form>
    </Panel>
  );
}

/* ---------------- Page ---------------- */
export default function EventDetailPage({ id }: { id: string }) {
  const q = useEventDetail(id);
  usePageMeta(q.data ? `${q.data.event.name} · Staff` : "Event · Staff", { noindex: true });
  if (q.isPending) return <Loading />;
  if (q.error || !q.data) return <ErrorNote error={q.error} />;
  const d = q.data;
  const t = d.totals;
  const live = d.assignments;
  return (
    <div className="space-y-6">
      <p className="no-print">
        <Link href="/staff/events" className="text-sm text-white/75 underline underline-offset-4 hover:text-white">
          ← All events
        </Link>
      </p>
      <PageTitle eyebrow={d.event.is_planning_seed ? "Planning seed · not a booked event" : `Event · ${humanize(d.event.status)}`} title={d.event.name}>
        <Link href={`/staff/events/${d.event.id}/call-sheet`} className="inline-flex min-h-11 items-center border border-white/40 px-4 text-[12px] font-medium uppercase tracking-[0.16em] hover:border-white">
          Call sheet
        </Link>
      </PageTitle>
      {d.scope === "departments" && <p className="text-sm text-white/75">You are seeing your departments only: {(d.departments ?? []).map(humanize).join(", ")}.</p>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Sanctuary slots" value={t.sanctuarySlots} hint={t.unknownSanctuaryRoles ? `+ ${t.unknownSanctuaryRoles} role(s) with Unknown count` : "All counts known"} />
        <Stat label="Venue / provider" value={t.venue.known} hint={t.venue.unknownRoles.length ? `${t.venue.unknownRoles.length} role(s) Unknown` : undefined} />
        <Stat label="Approved assignments" value={d.staffing.approvedAssignments} hint={`${d.staffing.namedPeople} named people`} />
        <Stat label="Peak concurrent" value={d.staffing.peakConcurrent} hint={d.staffing.withoutShift ? `${d.staffing.withoutShift} approved without a shift` : "From approved shifts"} />
        <Stat label="Ready" value={`${live.filter((a) => a.readiness.ready).length}/${live.length}`} hint="Assignments passing every readiness check" />
      </div>

      {d.blockers.length > 0 && (
        <Panel id="blockers" title={`Blockers (${d.blockers.length})`}>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {d.blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </Panel>
      )}

      <DatePanel d={d} />
      <CoveragePanel d={d} />

      <Panel id="assignments" title={`Assignments (${live.length})`} eyebrow="Proposed → approved by the event director">
        {live.length === 0 ? (
          <Empty>No assignments yet.</Empty>
        ) : (
          <ul className="space-y-2">
            {live.map((a) => (
              <AssignmentRow key={a.id} a={a} d={d} />
            ))}
          </ul>
        )}
        <div className="mt-4">
          <ProposeForm d={d} />
        </div>
      </Panel>

      <DoorCheck eventId={d.event.id} />
      {d.can.promoters && <PromotersPanel d={d} />}
      <RunOfShow d={d} />
      <Closeout d={d} />
    </div>
  );
}

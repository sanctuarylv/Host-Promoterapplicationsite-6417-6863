import { useState } from "react";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { CONSENT_VERSION, HOST_INTEREST_OPTIONS, ROLE_OPTIONS, TRAVEL_OPTIONS, labelFor } from "../../../api/crew/contract";
import {
  Btn,
  Empty,
  ErrorNote,
  Loading,
  PageTitle,
  Panel,
  SelectField,
  Tag,
  TextArea,
  TextField,
  fmtDate,
  fmtDay,
  humanize,
} from "../../components/console/ui";
import { usePageMeta } from "../../hooks/use-page-meta";
import {
  useApplicant,
  useAssignReviewer,
  useIssueLinkToken,
  useScheduleInterview,
  useStaffDirectory,
  useSubmitScorecard,
  useTransition,
  useUpdateInterview,
} from "../../queries/recruiting";
import { useCancelOffer, useIssueOffer, useTermsList, useTrainingModules, useTrainingRecords, useVerifyTraining } from "../../queries/terms";

type Detail = NonNullable<ReturnType<typeof useApplicant>["data"]>;

/** Targets only a dedicated workflow can set (mirrors crew/pipeline.ts WORKFLOW_ONLY). */
const WORKFLOW_ONLY: Record<string, string> = {
  offer_issued: "Set by issuing an offer from approved terms (Offers panel).",
  accepted: "Only the applicant can accept, from their crew portal.",
  event_ready: "Derived from assignment readiness on an event.",
};
const ALTERNATIVES = ["waitlisted", "declined", "withdrawn"];

const toIso = (local: string) => (local ? new Date(local).toISOString() : null);

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="eyebrow text-white/60">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap break-words text-sm">{children || "—"}</dd>
    </div>
  );
}

/* ---------------- Status ---------------- */
function StatusPanel({ d }: { d: Detail }) {
  const tr = useTransition();
  const [note, setNote] = useState("");
  const write = d.canWrite.recruiting;
  return (
    <Panel id="status" title="Next steps" eyebrow={`Current: ${humanize(d.app.application_status)} · revision ${d.app.revision}`}>
      {d.next.length === 0 ? (
        <Empty>No further transitions from this status.</Empty>
      ) : (
        <ul className="space-y-3">
          {d.next.map((g) => {
            const wf = WORKFLOW_ONLY[g.to];
            const alt = ALTERNATIVES.includes(g.to);
            const allowed = !wf && (g.ok || alt);
            return (
              <li key={g.to} className="border border-white/10 px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium">→ {humanize(g.to)}</span>
                  {write && !wf && (
                    <Btn
                      size="sm"
                      variant={allowed && !alt ? "solid" : "outline"}
                      disabled={!allowed}
                      busy={tr.isPending && tr.variables?.to === g.to}
                      onClick={() => tr.mutate({ id: d.app.id, revision: d.app.revision, to: g.to as never, note: note.trim() || undefined }, { onSuccess: () => setNote("") })}
                    >
                      Move to {humanize(g.to)}
                    </Btn>
                  )}
                </div>
                {wf && <p className="mt-1 text-xs text-white/65">{wf}</p>}
                {!wf && !g.ok && !alt && (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-white/75">
                    {g.missing.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {write && <TextArea label="Note for the timeline (optional)" rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="mt-4" maxLength={2000} />}
      <ErrorNote error={tr.error} className="mt-3" />
    </Panel>
  );
}

/* ---------------- Reviewer ---------------- */
function ReviewerPanel({ d }: { d: Detail }) {
  const dir = useStaffDirectory();
  const m = useAssignReviewer();
  const [rev, setRev] = useState(d.app.reviewer_user_id ?? "");
  const [due, setDue] = useState(d.app.review_due_at ? new Date(d.app.review_due_at).toISOString().slice(0, 10) : "");
  const name = dir.data?.find((s) => s.userId === d.app.reviewer_user_id)?.name;
  return (
    <Panel id="reviewer" title="Reviewer" eyebrow={d.app.reviewer_user_id ? `Assigned: ${name ?? d.app.reviewer_user_id}` : "Unassigned"}>
      {d.canWrite.recruiting ? (
        <form
          className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            m.mutate({ id: d.app.id, revision: d.app.revision, reviewerUserId: rev || null, dueAt: due ? new Date(`${due}T23:59:00`).toISOString() : null });
          }}
        >
          <SelectField label="Reviewer" options={[["", "Unassigned"], ...(dir.data ?? []).map((s) => [s.userId, `${s.name} (${s.roles.map(humanize).join(", ")})`] as const)]} value={rev} onChange={(e) => setRev(e.target.value)} />
          <TextField label="Review due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          <Btn type="submit" busy={m.isPending}>
            Save
          </Btn>
        </form>
      ) : (
        <p className="text-sm text-white/70">Due {d.app.review_due_at ? fmtDay(d.app.review_due_at) : "—"}</p>
      )}
      <ErrorNote error={m.error} className="mt-3" />
    </Panel>
  );
}

/* ---------------- Interviews ---------------- */
function InterviewsPanel({ d }: { d: Detail }) {
  const dir = useStaffDirectory();
  const sched = useScheduleInterview();
  const upd = useUpdateInterview();
  const [kind, setKind] = useState<"screen" | "assessment">("screen");
  const [format, setFormat] = useState<"phone" | "video" | "in_person" | "simulated_assessment">("phone");
  const [when, setWhen] = useState("");
  const [who, setWho] = useState("");
  const [notes, setNotes] = useState("");
  const nameOf = (id: string | null) => (id ? (dir.data?.find((s) => s.userId === id)?.name ?? "Staff") : "Unassigned");
  return (
    <Panel id="interviews" title="Interviews & assessments" eyebrow={`${d.interviews.length} recorded`}>
      {d.interviews.length === 0 ? (
        <Empty>No interviews yet.</Empty>
      ) : (
        <ul className="space-y-2">
          {d.interviews.map((iv) => (
            <li key={iv.id} className="flex flex-wrap items-center justify-between gap-2 border border-white/10 px-3 py-2 text-sm">
              <span>
                <strong className="font-medium">{humanize(iv.kind)}</strong> · {humanize(iv.format)} · {iv.scheduled_at ? fmtDate(iv.scheduled_at) : "time TBD"} · {nameOf(iv.interviewer_user_id)}
                {iv.notes && <span className="block text-xs text-white/65">{iv.notes}</span>}
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <Tag tone={iv.status === "completed" ? "solid" : "default"}>{humanize(iv.status)}</Tag>
                {d.canWrite.recruiting && iv.status === "scheduled" && (
                  <>
                    <Btn size="sm" busy={upd.isPending && upd.variables?.id === iv.id && upd.variables.status === "completed"} onClick={() => upd.mutate({ id: iv.id, revision: iv.revision, status: "completed" })}>
                      Completed
                    </Btn>
                    <Btn size="sm" variant="ghost" onClick={() => upd.mutate({ id: iv.id, revision: iv.revision, status: "no_show" })}>
                      No-show
                    </Btn>
                    <Btn size="sm" variant="ghost" onClick={() => upd.mutate({ id: iv.id, revision: iv.revision, status: "cancelled" })}>
                      Cancel
                    </Btn>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      <ErrorNote error={upd.error} className="mt-3" />
      {d.canWrite.recruiting && (
        <form
          className="mt-5 grid gap-3 border-t border-white/10 pt-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            sched.mutate(
              { applicationId: d.app.id, kind, format, scheduledAt: toIso(when), interviewerUserId: who || null, notes: notes.trim() || undefined },
              { onSuccess: () => setNotes("") },
            );
          }}
        >
          <SelectField label="Type" options={[["screen", "Screening interview"], ["assessment", "Structured assessment"]]} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} />
          <SelectField
            label="Format"
            options={[["phone", "Phone"], ["video", "Video"], ["in_person", "In person"], ["simulated_assessment", "Simulated assessment (role-play)"]]}
            value={format}
            onChange={(e) => setFormat(e.target.value as typeof format)}
          />
          <TextField label="When (your local time)" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} hint="Leave empty if not yet arranged." />
          <SelectField label="Interviewer" options={[["", "Unassigned"], ...(dir.data ?? []).map((s) => [s.userId, s.name] as const)]} value={who} onChange={(e) => setWho(e.target.value)} />
          <TextArea label="Notes (optional)" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="sm:col-span-2" maxLength={2000} />
          <div className="sm:col-span-2">
            <Btn type="submit" busy={sched.isPending}>
              Schedule
            </Btn>
            <p className="mt-2 text-xs text-white/60">This records the plan only. No invitation is sent — contact the applicant through an approved channel.</p>
          </div>
          <ErrorNote error={sched.error} className="sm:col-span-2" />
        </form>
      )}
    </Panel>
  );
}

/* ---------------- Scorecards ---------------- */
function ScorecardForm({ d, rubric }: { d: Detail; rubric: Detail["rubrics"][number] }) {
  const m = useSubmitScorecard();
  const [scores, setScores] = useState<Record<string, number>>({});
  const [evidence, setEvidence] = useState<Record<string, string>>({});
  const [rec, setRec] = useState<"advance" | "hold" | "do_not_advance">("hold");
  const [tried, setTried] = useState(false);
  const missing = rubric.criteria.filter((c) => !scores[c.key] || (evidence[c.key] ?? "").trim().length < 5);
  return (
    <form
      className="mt-4 border border-white/10 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        setTried(true);
        if (missing.length) return;
        m.mutate(
          { applicationId: d.app.id, kind: rubric.kind, scores, evidence, recommendation: rec },
          {
            onSuccess: () => {
              setScores({});
              setEvidence({});
              setTried(false);
            },
          },
        );
      }}
    >
      <p className="text-sm font-medium">
        {rubric.title} <span className="text-xs text-white/60">({rubric.version})</span>
      </p>
      <p className="mt-1 text-xs text-white/70">{rubric.exercise}</p>
      <div className="mt-3 space-y-4">
        {rubric.criteria.map((c) => {
          const bad = tried && missing.includes(c);
          return (
            <fieldset key={c.key} className="border-t border-white/10 pt-3" aria-invalid={bad || undefined}>
              <legend className="text-sm font-medium">{c.label}</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-4">
                {c.anchors.map((a, i) => (
                  <label key={a} className={`flex min-h-11 cursor-pointer items-start gap-2 border px-2 py-2 text-xs ${scores[c.key] === i + 1 ? "border-white bg-white/10" : "border-white/15"}`}>
                    <input
                      type="radio"
                      aria-label={`${c.label}: ${i + 1} — ${a}`}
                      name={`${rubric.kind}-${c.key}`}
                      className="mt-0.5 accent-white"
                      checked={scores[c.key] === i + 1}
                      onChange={() => setScores((s) => ({ ...s, [c.key]: i + 1 }))}
                    />
                    <span>
                      <strong className="block">{i + 1}</strong>
                      {a}
                    </span>
                  </label>
                ))}
              </div>
              <TextField
                label={`Evidence for ${c.label} (required)`}
                className="mt-2"
                value={evidence[c.key] ?? ""}
                invalid={bad}
                onChange={(e) => setEvidence((v) => ({ ...v, [c.key]: e.target.value }))}
                hint="What the candidate said or did. Role-related observations only."
                maxLength={1000}
              />
            </fieldset>
          );
        })}
      </div>
      <SelectField
        label="Recommendation"
        className="mt-4"
        options={[["advance", "Advance"], ["hold", "Hold"], ["do_not_advance", "Do not advance"]]}
        value={rec}
        onChange={(e) => setRec(e.target.value as typeof rec)}
      />
      {tried && missing.length > 0 && (
        <p role="alert" className="mt-3 text-sm">
          Score every criterion and add a supporting note (at least 5 characters): {missing.map((c) => c.label).join(", ")}.
        </p>
      )}
      <Btn type="submit" variant="solid" className="mt-4" busy={m.isPending}>
        Submit scorecard
      </Btn>
      <ErrorNote error={m.error} className="mt-3" />
    </form>
  );
}

function ScorecardsPanel({ d }: { d: Detail }) {
  const dir = useStaffDirectory();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Panel id="scorecards" title="Scorecards" eyebrow={`Required: ${d.rubrics.map((r) => humanize(r.kind)).join(" + ") || "none"}`}>
      {d.scorecards.length === 0 ? (
        <Empty>No scorecards yet.</Empty>
      ) : (
        <ul className="space-y-2">
          {d.scorecards.map((s) => {
            const r = d.rubrics.find((x) => x.kind === s.kind);
            return (
              <li key={s.id} className="border border-white/10 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <strong className="font-medium">{humanize(s.kind)}</strong> · {dir.data?.find((x) => x.userId === s.reviewer_user_id)?.name ?? "Staff"} · {fmtDate(s.created_at)}
                  </span>
                  <Tag tone={s.recommendation === "advance" ? "solid" : "default"}>{humanize(s.recommendation)}</Tag>
                </div>
                <dl className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
                  {Object.entries(s.scores).map(([k, v]) => (
                    <div key={k}>
                      <dt className="inline text-white/65">{r?.criteria.find((c) => c.key === k)?.label ?? k}: </dt>
                      <dd className="inline">
                        {v}/4 — {s.evidence[k]}
                      </dd>
                    </div>
                  ))}
                </dl>
              </li>
            );
          })}
        </ul>
      )}
      {d.canWrite.recruiting && (
        <div className="mt-4 flex flex-wrap gap-2">
          {d.rubrics.map((r) => (
            <Btn key={r.kind} size="sm" aria-expanded={open === r.kind} onClick={() => setOpen((o) => (o === r.kind ? null : r.kind))}>
              {open === r.kind ? "Close" : `New ${humanize(r.kind)} scorecard`}
            </Btn>
          ))}
        </div>
      )}
      {open && d.rubrics.filter((r) => r.kind === open).map((r) => <ScorecardForm key={r.kind} d={d} rubric={r} />)}
    </Panel>
  );
}

/* ---------------- Offers ---------------- */
function OffersPanel({ d }: { d: Detail }) {
  const terms = useTermsList();
  const issue = useIssueOffer();
  const cancel = useCancelOffer();
  const approved = (terms.data?.rows ?? []).filter((t) => t.status === "approved");
  const [termsId, setTermsId] = useState("");
  const [days, setDays] = useState(7);
  const [reason, setReason] = useState("");
  const termsName = (id: string) => {
    const t = terms.data?.rows.find((x) => x.id === id);
    return t ? `${t.title} (${t.terms_key} v${t.version})` : id;
  };
  const staleConsent = d.app.consent_version !== CONSENT_VERSION;
  return (
    <Panel id="offers" title="Offers" eyebrow="Sanctuary LV Group · approved terms only">
      {d.offers.length === 0 ? (
        <Empty>No offers.</Empty>
      ) : (
        <ul className="space-y-2">
          {d.offers.map((o) => (
            <li key={o.id} className="border border-white/10 px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {termsName(o.terms_id)} · issued {fmtDate(o.created_at)} · expires {fmtDate(o.expires_at)}
                </span>
                <Tag tone={o.status === "accepted" ? "solid" : "default"}>{humanize(o.status)}</Tag>
              </div>
              {o.response_note && <p className="mt-1 text-xs text-white/65">{o.response_note}</p>}
              {o.status === "issued" && d.canWrite.recruiting && (
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <TextField label="Cancellation reason" value={reason} onChange={(e) => setReason(e.target.value)} className="min-w-56 flex-1" />
                  <Btn size="sm" disabled={reason.trim().length < 3} busy={cancel.isPending} onClick={() => cancel.mutate({ offerId: o.id, revision: o.revision, reason: reason.trim() }, { onSuccess: () => setReason("") })}>
                    Cancel offer
                  </Btn>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <ErrorNote error={cancel.error} className="mt-3" />
      {d.canWrite.recruiting && d.app.application_status === "selected" && (
        <form
          className="mt-4 grid gap-3 border-t border-white/10 pt-4 sm:grid-cols-[1fr_8rem_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (termsId) issue.mutate({ applicationId: d.app.id, revision: d.app.revision, termsId, expiresInDays: days });
          }}
        >
          <SelectField
            label="Approved terms"
            options={[["", approved.length ? "Choose terms…" : "No approved terms yet"], ...approved.map((t) => [t.id, `${t.title} (${t.terms_key} v${t.version})`] as const)]}
            value={termsId}
            onChange={(e) => setTermsId(e.target.value)}
          />
          <TextField label="Expires in (days)" type="number" min={1} max={30} value={days} onChange={(e) => setDays(Math.max(1, Math.min(30, Number(e.target.value) || 1)))} />
          <Btn type="submit" variant="solid" disabled={!termsId || staleConsent} busy={issue.isPending}>
            Issue offer
          </Btn>
          {staleConsent && <p className="text-xs text-white/75 sm:col-span-3">The applicant must first confirm the current Sanctuary LV Group acknowledgement in their portal.</p>}
          <p className="text-xs text-white/60 sm:col-span-3">Recorded locally; the applicant sees it in their portal. No message is sent and nothing is booked.</p>
          <ErrorNote error={issue.error} className="sm:col-span-3" />
        </form>
      )}
    </Panel>
  );
}

/* ---------------- Person: link + training ---------------- */
function PersonPanel({ d }: { d: Detail }) {
  const link = useIssueLinkToken();
  const personId = d.person?.id ?? null;
  const records = useTrainingRecords(personId);
  const modules = useTrainingModules();
  const verify = useVerifyTraining();
  if (!d.person) return <Panel title="Crew profile">No person record is linked to this application.</Panel>;
  const modName = (id: string) => modules.data?.find((m) => m.id === id)?.title ?? id;
  return (
    <Panel id="person" title="Crew profile" eyebrow={d.person.linked ? `Account linked ${fmtDay(d.person.linkedAt)}` : "No sign-in account linked"}>
      {d.person.phoneShared && <p className="mb-3 text-sm">Phone number is shared with another profile. Profiles are never merged automatically.</p>}
      {d.otherApplications.length > 0 && (
        <div className="mb-4 text-sm">
          <p className="eyebrow text-white/60">Other applications from this person</p>
          <ul className="mt-1 space-y-1">
            {d.otherApplications.map((o) => (
              <li key={o.id}>
                <Link href={`/staff/applicants/${o.id}`} className="underline underline-offset-4">
                  {humanize(o.opportunity_key)}
                </Link>{" "}
                · {humanize(o.status)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {!d.person.linked && d.canWrite.recruiting && (
        <div className="border border-white/10 p-3">
          <p className="text-sm">Issue a one-time link code (valid 72 h). Hand it to the applicant yourself through an approved channel — this app sends nothing.</p>
          {link.data ? (
            <div className="mt-3">
              <p className="eyebrow text-white/60">Shown once — copy it now</p>
              <p className="mt-1 select-all font-mono text-xl tracking-wider">{link.data.token}</p>
              <p className="mt-1 text-xs text-white/65">Expires {fmtDate(link.data.expiresAt)}. Issuing a new code revokes this one.</p>
            </div>
          ) : (
            <Btn size="sm" className="mt-3" busy={link.isPending} onClick={() => link.mutate({ personId: d.person!.id })}>
              Issue link code
            </Btn>
          )}
          <ErrorNote error={link.error} className="mt-3" />
        </div>
      )}
      <div className="mt-4">
        <p className="eyebrow text-white/60">Training</p>
        {records.isPending ? (
          <Loading />
        ) : records.error ? (
          <ErrorNote error={records.error} />
        ) : !records.data?.length ? (
          <Empty>No training recorded.</Empty>
        ) : (
          <ul className="mt-2 space-y-2">
            {records.data.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 border border-white/10 px-3 py-2 text-sm">
                <span>
                  {modName(r.module_id)}
                  <span className="block text-xs text-white/65">
                    {r.completed_at ? `Completed ${fmtDate(r.completed_at)}` : "Not completed"}
                    {r.verified_at ? ` · Verified ${fmtDate(r.verified_at)}` : ""}
                  </span>
                </span>
                {r.completed_at && !r.verified_at && (
                  <Btn size="sm" busy={verify.isPending && verify.variables?.recordId === r.id} onClick={() => verify.mutate({ recordId: r.id })}>
                    Verify
                  </Btn>
                )}
              </li>
            ))}
          </ul>
        )}
        <ErrorNote error={verify.error} className="mt-3" />
      </div>
    </Panel>
  );
}

/* ---------------- Page ---------------- */
export default function ApplicantDetailPage({ id }: { id: string }) {
  const q = useApplicant(id);
  const d = q.data;
  usePageMeta(d ? `${d.app.first_name} ${d.app.last_name} · Applicants` : "Applicant · Sanctuary LV staff", { noindex: true });
  if (q.isPending) return <Loading />;
  if (q.error || !d) return <ErrorNote error={q.error} />;
  const a = d.app;
  const staleConsent = a.consent_version !== CONSENT_VERSION;
  return (
    <>
      <Link href="/staff/applicants" className="no-print mb-4 inline-flex min-h-11 items-center gap-2 text-sm text-white/75 hover:text-white">
        <ArrowLeft aria-hidden className="size-4" /> All applicants
      </Link>
      <PageTitle eyebrow={`${humanize(a.opportunity_key)} · ${humanize(a.pathway)}`} title={`${a.first_name} ${a.last_name}`}>
        <Tag tone="solid">{humanize(a.application_status)}</Tag>
        {a.legacy_status && <Tag tone="muted">legacy: {a.legacy_status}</Tag>}
        {a.status_flags.map((f) => (
          <Tag key={f} tone="warn">
            {humanize(f)}
          </Tag>
        ))}
      </PageTitle>
      {staleConsent && (
        <p className="mb-4 border border-dashed border-white/50 px-4 py-2 text-sm">
          Consent on file is <code>{a.consent_version ?? "none"}</code>. Selection and offers require the current acknowledgement (<code>{CONSENT_VERSION}</code>); the applicant re-confirms in their portal.
        </p>
      )}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Panel id="answers" title="Application" eyebrow={`Received ${fmtDate(a.created_at)} · authority=${a.authority}`}>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field label="Role interest">{labelFor(ROLE_OPTIONS, a.role_interest)}</Field>
              <Field label="Email">{a.email_normalized}</Field>
              <Field label="Phone">{a.phone_normalized}</Field>
              <Field label="Location">{[a.city, a.state].filter(Boolean).join(", ")}</Field>
              <Field label="Travel">{a.travel_range ? labelFor(TRAVEL_OPTIONS, a.travel_range) : ""}</Field>
              <Field label="Evenings / weekends">{`${a.evenings_available ? "Evenings" : "No evenings"} · ${a.weekends_available ? "Weekends" : "No weekends"}`}</Field>
              <Field label="Host interests">{a.host_interests.map((h) => labelFor(HOST_INTEREST_OPTIONS, h)).join(", ")}</Field>
              <Field label="Instagram / TikTok">{[a.instagram, a.tiktok].filter(Boolean).join(" · ")}</Field>
              <Field label="Portfolio">{a.portfolio_url}</Field>
              <Field label="Referral code">{a.referral_code_used ? `${a.referral_code_used} (${a.referral_code_status})` : ""}</Field>
              <div className="sm:col-span-2">
                <Field label="Motivation">{a.motivation}</Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Relevant experience">{a.relevant_experience}</Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Scenario response">{a.scenario_response}</Field>
              </div>
            </dl>
          </Panel>
          <InterviewsPanel d={d} />
          <ScorecardsPanel d={d} />
        </div>
        <div className="space-y-6">
          <StatusPanel d={d} />
          <ReviewerPanel d={d} />
          <OffersPanel d={d} />
          <PersonPanel d={d} />
          <Panel id="timeline" title="Timeline" eyebrow="Append-only audit">
            {d.timeline.length === 0 ? (
              <Empty>No activity recorded.</Empty>
            ) : (
              <ol className="space-y-2">
                {d.timeline.map((t) => (
                  <li key={t.id} className="border-l border-white/20 pl-3 text-sm">
                    <span className="text-white/60">{fmtDate(t.created_at)}</span> · {humanize(t.action)}
                    {t.from_value || t.to_value ? ` ${t.from_value ? humanize(t.from_value) : ""} → ${humanize(t.to_value)}` : ""}
                    <span className="block text-xs text-white/60">{t.actor_label}</span>
                    {t.note && <span className="block text-xs text-white/75">{t.note}</span>}
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}

/**
 * Worker self-service. Shows ONLY the linked person's own records (enforced
 * server-side by workerProc). No coworker contacts, other rates, guest lists
 * or provider contracts are ever returned to this page.
 */
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Link } from "wouter";
import { TopBar } from "../components/console/shell";
import { Btn, Empty, ErrorNote, Loading, Panel, Tag, TextField, fmtDate, fmtDay, humanize } from "../components/console/ui";
import { usePageMeta } from "../hooks/use-page-meta";
import { NONPROFIT_ENTITY, PAID_ENTITY } from "../lib/pathways";
import { useMe, useRedeemLink } from "../queries/session";
import { LegalLinks } from "../components/crew/legal";
import {
  useCompleteTraining,
  useReacknowledge,
  useRespondOffer,
  useWorkerAttendance,
  useWorkerCallSheet,
  useWorkerCredential,
  useWorkerOverview,
} from "../queries/worker";

type Overview = NonNullable<ReturnType<typeof useWorkerOverview>["data"]>;

function LinkProfile() {
  const [code, setCode] = useState("");
  const redeem = useRedeemLink();
  return (
    <Panel title="Link your crew profile" eyebrow="One-time code">
      <p className="max-w-prose text-sm text-white/75">
        Your sign-in account isn't linked to a crew profile yet. Your recruiter gives you a one-time code (it starts with <span className="font-mono">SX-</span>{" "}
        and expires after 72 hours). Accounts are never linked automatically by email.
      </p>
      <form
        className="mt-4 flex max-w-md flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          redeem.mutate({ code: code.trim() });
        }}
      >
        <TextField label="Link code" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" className="flex-1" invalid={Boolean(redeem.error)} />
        <Btn type="submit" variant="solid" busy={redeem.isPending} disabled={code.trim().length < 6}>
          Link profile
        </Btn>
      </form>
      <ErrorNote error={redeem.error} className="mt-4" />
    </Panel>
  );
}

function Applications({ data }: { data: Overview }) {
  const ack = useReacknowledge();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Panel title="My applications" id="apps">
      {data.applications.length === 0 ? (
        <Empty>No applications on this profile.</Empty>
      ) : (
        <ul className="divide-y divide-white/10">
          {data.applications.map((a) => (
            <li key={a.id} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{humanize(a.role)} · {humanize(a.opportunity)}</p>
                  <p className="text-xs text-white/60">Submitted {fmtDay(a.created_at)}</p>
                </div>
                <Tag tone={a.status === "event_ready" ? "solid" : "default"}>{a.label}</Tag>
              </div>
              {a.needsReconsent && (
                <div className="mt-3 border border-dashed border-white/40 p-3 text-sm">
                  <p>
                    Your application was made under an earlier acknowledgement. Paid opportunities are operated by {PAID_ENTITY}; please review and confirm the
                    current acknowledgement before any offer or assignment.
                  </p>
                  {open === a.id ? (
                    <div className="mt-3">
                      <p className="eyebrow text-white/60">Acknowledgement {data.acknowledgement.version}</p>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-white/85">
                        {data.acknowledgement.statements.map((s) => (
                          <li key={s}>{s}</li>
                        ))}
                      </ul>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Btn variant="solid" busy={ack.isPending} onClick={() => ack.mutate({ applicationId: a.id, consentVersion: data.acknowledgement.version as never })}>
                          I confirm
                        </Btn>
                        <Btn variant="ghost" onClick={() => setOpen(null)}>
                          Not now
                        </Btn>
                      </div>
                      <ErrorNote error={ack.error} className="mt-3" />
                    </div>
                  ) : (
                    <Btn className="mt-3" onClick={() => setOpen(a.id)}>
                      Review acknowledgement
                    </Btn>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function Offers({ data }: { data: Overview }) {
  const respond = useRespondOffer();
  const [declining, setDeclining] = useState<string | null>(null);
  const [note, setNote] = useState("");
  return (
    <Panel title="Offers & terms" id="offers">
      {data.offers.length === 0 ? (
        <Empty>No offers. Offers only appear after selection, with approved written terms.</Empty>
      ) : (
        <ul className="space-y-4">
          {data.offers.map((o) => {
            const open = o.status === "issued";
            return (
              <li key={o.id} className="border border-white/12 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{o.terms?.title ?? "Terms unavailable"}</p>
                  <Tag tone={o.status === "accepted" ? "solid" : open ? "default" : "muted"}>{humanize(o.status)}</Tag>
                </div>
                {o.terms && (
                  <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
                    <dt className="text-white/60">Operated by</dt>
                    <dd>{o.terms.operator}</dd>
                    <dt className="text-white/60">Duties</dt>
                    <dd className="whitespace-pre-line">{o.terms.duties}</dd>
                    <dt className="text-white/60">Compensation</dt>
                    <dd className="whitespace-pre-line">{o.terms.compensation}</dd>
                    <dt className="text-white/60">Pay basis</dt>
                    <dd>{o.terms.payBasis}</dd>
                    <dt className="text-white/60">Schedule</dt>
                    <dd className="whitespace-pre-line">{o.terms.schedule}</dd>
                    <dt className="text-white/60">Arrangement</dt>
                    <dd>{o.terms.arrangement}</dd>
                    <dt className="text-white/60">To accept</dt>
                    <dd className="whitespace-pre-line">{o.terms.acceptance}</dd>
                    <dt className="text-white/60">Terms version</dt>
                    <dd>v{o.terms.version}</dd>
                    <dt className="text-white/60">Respond by</dt>
                    <dd>{fmtDate(o.expiresAt)}</dd>
                  </dl>
                )}
                {open && (
                  <div className="mt-4">
                    {declining === o.id ? (
                      <form
                        className="space-y-3"
                        onSubmit={(e) => {
                          e.preventDefault();
                          respond.mutate({ offerId: o.id, revision: o.revision, accept: false, note: note || undefined }, { onSuccess: () => setDeclining(null) });
                        }}
                      >
                        <TextField label="Optional note to your recruiter" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
                        <div className="flex flex-wrap gap-2">
                          <Btn type="submit" busy={respond.isPending}>
                            Confirm decline
                          </Btn>
                          <Btn variant="ghost" onClick={() => setDeclining(null)}>
                            Back
                          </Btn>
                        </div>
                      </form>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <Btn variant="solid" busy={respond.isPending} onClick={() => respond.mutate({ offerId: o.id, revision: o.revision, accept: true })}>
                          Accept these terms
                        </Btn>
                        <Btn onClick={() => setDeclining(o.id)}>Decline</Btn>
                      </div>
                    )}
                    <LegalLinks className="mt-3" keys={["groupDisclosure", "privacy", "retention"]} />
                    <ErrorNote error={respond.error} className="mt-3" />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function Training({ data }: { data: Overview }) {
  const complete = useCompleteTraining();
  return (
    <Panel title="Training" id="training">
      {data.training.length === 0 ? (
        <Empty>No training assigned yet.</Empty>
      ) : (
        <ul className="divide-y divide-white/10">
          {data.training.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="max-w-prose">
                <p className="font-medium">
                  {t.title} {t.required && <span className="text-xs text-white/60">· required</span>}
                </p>
                <p className="text-sm text-white/70">{t.summary}</p>
                {t.verification === "staff_verified" && <p className="text-xs text-white/60">Completion is verified by staff.</p>}
              </div>
              {t.verifiedAt ? (
                <Tag tone="solid">Verified</Tag>
              ) : t.completedAt ? (
                <Tag>{t.verification === "staff_verified" ? "Awaiting verification" : "Complete"}</Tag>
              ) : (
                <Btn busy={complete.isPending && complete.variables?.moduleId === t.id} onClick={() => complete.mutate({ moduleId: t.id })}>
                  Mark complete
                </Btn>
              )}
            </li>
          ))}
        </ul>
      )}
      <ErrorNote error={complete.error} className="mt-3" />
    </Panel>
  );
}

function CredentialQr({ assignmentId }: { assignmentId: string }) {
  const q = useWorkerCredential(assignmentId);
  const [qr, setQr] = useState<string | null>(null);
  const token = q.data?.status === "active" ? q.data.token : null;
  useEffect(() => {
    if (!token) return setQr(null);
    void QRCode.toDataURL(token, { margin: 2, width: 384, color: { dark: "#0A0A0A", light: "#FFFFFF" } }).then(setQr);
  }, [token]);
  if (q.isPending) return <Loading label="Loading credential…" />;
  if (q.error) return <ErrorNote error={q.error} />;
  if (q.data?.status !== "active") return <p className="text-sm text-white/70">No active credential. Credentials are issued only once every readiness condition is met.</p>;
  return (
    <div className="flex flex-wrap items-start gap-4">
      {qr && <img src={qr} alt="Your staff credential QR code" width={192} height={192} className="size-48 bg-white p-2" />}
      <div className="text-sm">
        <p>Valid until {fmtDate(q.data.expiresAt)}</p>
        <p className="mt-1 text-white/70">Zones: {q.data.zones.length ? q.data.zones.map(humanize).join(", ") : "none listed"}</p>
        <p className="mt-2 max-w-xs text-xs text-white/60">Badge zones are for physical access only and never grant app permissions. Venue security has final authority.</p>
      </div>
    </div>
  );
}

function CallSheet({ assignmentId }: { assignmentId: string }) {
  const q = useWorkerCallSheet(assignmentId);
  if (q.isPending) return <Loading label="Loading call sheet…" />;
  if (q.error) return <ErrorNote error={q.error} />;
  const s = q.data;
  return (
    <div className="print-sheet text-sm">
      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[9rem_1fr]">
        <dt className="text-white/60">Event</dt>
        <dd>
          {s.event.name} · {s.event.dateConfirmed ? s.event.localDate : "Date to be confirmed"}
        </dd>
        <dt className="text-white/60">Venue</dt>
        <dd>{s.event.venue}</dd>
        <dt className="text-white/60">Role</dt>
        <dd>{s.role}</dd>
        <dt className="text-white/60">Call → release</dt>
        <dd>
          {s.call} → {s.release} <span className="text-white/60">({s.event.timezone})</span>
        </dd>
        <dt className="text-white/60">Supervisor</dt>
        <dd>{s.supervisor}</dd>
        {s.dress && (
          <>
            <dt className="text-white/60">Dress</dt>
            <dd>{s.dress}</dd>
          </>
        )}
        {s.duties && (
          <>
            <dt className="text-white/60">Duties</dt>
            <dd className="whitespace-pre-line">{s.duties}</dd>
          </>
        )}
      </dl>
      {s.runOfShow.length > 0 && (
        <ol className="mt-3 list-decimal space-y-1 pl-5">
          {s.runOfShow.map((r) => (
            <li key={`${r.title}-${r.offset}`}>
              {r.title} <span className="text-white/60">({r.milestone ?? "start"} {r.offset >= 0 ? "+" : ""}{r.offset} min)</span>
            </li>
          ))}
        </ol>
      )}
      <Btn className="no-print mt-4" onClick={() => window.print()}>
        Print call sheet
      </Btn>
    </div>
  );
}

function Attendance({ assignmentId }: { assignmentId: string }) {
  const q = useWorkerAttendance(assignmentId);
  if (q.isPending) return <Loading label="Loading attendance…" />;
  if (q.error) return <ErrorNote error={q.error} />;
  const voided = new Set(q.data.log.filter((l) => l.kind === "void").map((l) => l.corrects_id));
  return (
    <div className="text-sm">
      {q.data.log.length === 0 ? (
        <p className="text-white/70">No check-ins recorded yet.</p>
      ) : (
        <ul className="space-y-1">
          {q.data.log.map((l) => (
            <li key={l.id} className={voided.has(l.id) ? "text-white/60 line-through" : undefined}>
              {humanize(l.kind)} · {fmtDate(l.at_utc)} {l.kind === "void" && <span className="text-white/60">(correction)</span>}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2">Recorded time: {q.data.minutes} min</p>
      {q.data.issues.length > 0 && <p className="text-white/70">Open items: {q.data.issues.join(", ")}</p>}
      <p className="mt-1 text-xs text-white/60">Attendance is evidence for agreed terms only; it never triggers payment automatically.</p>
    </div>
  );
}

function Assignments({ data }: { data: Overview }) {
  const [view, setView] = useState<Record<string, "sheet" | "credential" | "attendance" | undefined>>({});
  return (
    <Panel title="My event assignments" id="assignments">
      {data.assignments.length === 0 ? (
        <Empty>No event assignments. An assignment appears only after staff approve it — applying or accepting terms does not guarantee one.</Empty>
      ) : (
        <ul className="space-y-4">
          {data.assignments.map((a) => (
            <li key={a.id} className="border border-white/12 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {a.event.name} · {a.role}
                  </p>
                  <p className="text-xs text-white/60">
                    {a.event.dateConfirmed ? a.event.localDate : "Date to be confirmed"} · {a.event.venue ?? "Venue to be confirmed"} · Operated by {PAID_ENTITY}
                  </p>
                  <p className="mt-1 text-sm">
                    Call {a.call ?? "TBD"} → release {a.release ?? "TBD"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Tag tone={a.readiness.ready ? "solid" : "warn"}>{a.readiness.ready ? "Ready" : "Not ready"}</Tag>
                  <Tag tone="muted">{humanize(a.status)}</Tag>
                </div>
              </div>
              {!a.readiness.ready && (
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-white/80">
                  {a.readiness.blockers.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                {a.status === "approved" && (
                  <Btn size="sm" aria-pressed={view[a.id] === "sheet"} onClick={() => setView((v) => ({ ...v, [a.id]: v[a.id] === "sheet" ? undefined : "sheet" }))}>
                    Call sheet
                  </Btn>
                )}
                <Btn size="sm" aria-pressed={view[a.id] === "credential"} onClick={() => setView((v) => ({ ...v, [a.id]: v[a.id] === "credential" ? undefined : "credential" }))}>
                  Credential
                </Btn>
                <Btn size="sm" aria-pressed={view[a.id] === "attendance"} onClick={() => setView((v) => ({ ...v, [a.id]: v[a.id] === "attendance" ? undefined : "attendance" }))}>
                  Attendance
                </Btn>
              </div>
              {view[a.id] && (
                <div className="mt-4 border-t border-white/10 pt-4">
                  {view[a.id] === "sheet" && <CallSheet assignmentId={a.id} />}
                  {view[a.id] === "credential" && <CredentialQr assignmentId={a.id} />}
                  {view[a.id] === "attendance" && <Attendance assignmentId={a.id} />}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export default function PortalPage() {
  usePageMeta("My crew portal — Sanctuary Crew", { noindex: true });
  const me = useMe();
  const linked = Boolean(me.data?.linkedPersonId);
  const ov = useWorkerOverview(linked);
  return (
    <div className="min-h-[100svh] bg-sx-black">
      <TopBar label="Crew portal">
        {me.data?.isStaff && (
          <Link href="/staff" className="hidden min-h-11 items-center px-3 text-[12px] uppercase tracking-[0.16em] text-white/75 hover:text-white sm:inline-flex">
            Staff console
          </Link>
        )}
      </TopBar>
      <main id="main" className="mx-auto max-w-4xl space-y-6 px-4 pb-24 pt-8 sm:px-8">
        <div>
          <p className="eyebrow text-white/60">Sanctuary crew</p>
          <h1 className="heading mt-1 text-4xl">My portal</h1>
          <p className="mt-3 max-w-prose text-sm text-white/70">
            Paid Host and Promoter work is operated by {PAID_ENTITY}. The unpaid Volunteer / Serve Team is run separately by {NONPROFIT_ENTITY} through{" "}
            <Link href="/serve" className="underline underline-offset-4">
              its own pathway
            </Link>
            .
          </p>
        </div>
        {me.isPending ? (
          <Loading />
        ) : me.error ? (
          <ErrorNote error={me.error} />
        ) : !linked ? (
          <LinkProfile />
        ) : ov.isPending ? (
          <Loading />
        ) : ov.error ? (
          <ErrorNote error={ov.error} />
        ) : (
          <>
            <Applications data={ov.data} />
            <Offers data={ov.data} />
            <Training data={ov.data} />
            <Assignments data={ov.data} />
          </>
        )}
      </main>
    </div>
  );
}

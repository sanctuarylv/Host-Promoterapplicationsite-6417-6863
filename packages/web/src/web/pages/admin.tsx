import { Fragment, useState } from "react";
import { Download, Loader2, LogOut, RefreshCw } from "lucide-react";
import { Link } from "wouter";
import {
  AVAILABILITY_OPTIONS,
  HOST_INTEREST_OPTIONS,
  INVITE_RANGE_OPTIONS,
  NETWORK_OPTIONS,
  PIPELINE_STATUSES,
  REFERRAL_SOURCE_OPTIONS,
  ROLE_OPTIONS,
  TRAVEL_OPTIONS,
  labelFor,
} from "../../api/crew/contract";
import { Wordmark } from "../components/crew/chrome";
import { usePageMeta } from "../hooks/use-page-meta";
import { ADMIN_KEY_STORAGE, getAdminKey } from "../lib/api";
import { downloadCsv, toCsv } from "../lib/csv";
import { fetchAllLegacyRows, useAdminApplications, useVerifyAdmin, type LegacyListInput } from "../queries/crew-admin";
import { cn } from "../lib/utils";

type Row = NonNullable<ReturnType<typeof useAdminApplications>["data"]>["rows"][number];

const sourceOf = (r: Row) =>
  r.utm_source ? `${r.utm_source}${r.utm_medium ? ` / ${r.utm_medium}` : ""}` : labelFor(REFERRAL_SOURCE_OPTIONS, r.referral_source);

/* ---------------- CSV ---------------- */
const CSV_COLS: [string, (r: Row) => unknown][] = [
  ["id", (r) => r.id],
  ["person_id", (r) => r.person_id],
  ["opportunity_key", (r) => r.opportunity_key],
  ["created_at", (r) => r.created_at],
  ["first_name", (r) => r.first_name],
  ["last_name", (r) => r.last_name],
  ["email", (r) => r.email],
  ["phone", (r) => r.phone],
  ["city", (r) => r.city],
  ["state", (r) => r.state],
  ["role_interest", (r) => r.role_interest],
  ["instagram", (r) => r.instagram],
  ["tiktok", (r) => r.tiktok],
  ["other_social", (r) => r.other_social],
  ["network_types", (r) => r.network_types.map((n) => labelFor(NETWORK_OPTIONS, n))],
  ["availability", (r) => labelFor(AVAILABILITY_OPTIONS, r.availability)],
  ["evenings_available", (r) => r.evenings_available],
  ["weekends_available", (r) => r.weekends_available],
  ["travel_range", (r) => (r.travel_range ? labelFor(TRAVEL_OPTIONS, r.travel_range) : "")],
  ["promoter_invite_range", (r) => labelFor(INVITE_RANGE_OPTIONS, r.promoter_invite_range)],
  ["promoter_experience", (r) => r.promoter_experience],
  ["promoter_experience_notes", (r) => r.promoter_experience_notes],
  ["host_interests", (r) => r.host_interests.map((h) => labelFor(HOST_INTEREST_OPTIONS, h))],
  ["motivation", (r) => r.motivation],
  ["relevant_experience", (r) => r.relevant_experience],
  ["scenario_response", (r) => r.scenario_response],
  ["portfolio_url", (r) => r.portfolio_url],
  ["referral_source", (r) => labelFor(REFERRAL_SOURCE_OPTIONS, r.referral_source)],
  ["referral_code_used", (r) => r.referral_code_used],
  ["referral_code_status", (r) => r.referral_code_status],
  ["campaign", (r) => r.campaign],
  ["event_id", (r) => r.event_id],
  ["qr_campaign", (r) => r.qr_campaign],
  ["utm_source", (r) => r.utm_source],
  ["utm_medium", (r) => r.utm_medium],
  ["utm_campaign", (r) => r.utm_campaign],
  ["utm_content", (r) => r.utm_content],
  ["referring_url", (r) => r.referring_url],
  ["entry_point", (r) => r.entry_point],
  ["landing_path", (r) => r.landing_path],
  ["application_status", (r) => r.application_status],
  ["legacy_status", (r) => r.legacy_status],
  ["status_flags", (r) => r.status_flags],
  ["consent_version", (r) => r.consent_version],
  ["marketing_consent", (r) => r.marketing_consent],
  ["sync_status", (r) => r.sync_status],
  ["authority", (r) => r.authority],
  ["duplicate_attempts", (r) => r.duplicate_attempts],
];

/* ---------------- Gate ---------------- */
function Gate({ onOk, notice }: { onOk: () => void; notice: string | null }) {
  const [key, setKey] = useState("");
  const verify = useVerifyAdmin();
  const [err, setErr] = useState<string | null>(notice);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    sessionStorage.setItem(ADMIN_KEY_STORAGE, key.trim());
    try {
      await verify.mutateAsync({});
      onOk();
    } catch (e2) {
      sessionStorage.removeItem(ADMIN_KEY_STORAGE);
      setErr((e2 as Error).message || "Access denied.");
    }
  };
  return (
    <main id="main" className="flex min-h-[100svh] items-center justify-center bg-sx-black px-5">
      <form onSubmit={submit} className="w-full max-w-sm space-y-8">
        <Wordmark />
        <h1 className="heading text-4xl">Applicant view</h1>
        <p className="text-sm text-white/60">
          Read-only legacy access. Staff with their own account should use the{" "}
          <Link href="/staff" className="text-white underline underline-offset-4">
            staff console
          </Link>
          .
        </p>
        <div>
          <label htmlFor="admin-key" id="admin-key-label" className="eyebrow text-white/60">
            Access key
          </label>
          <input
            id="admin-key"
            aria-labelledby="admin-key-label"
            type="password"
            autoComplete="current-password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            className="field-input"
            aria-invalid={err ? true : undefined}
            aria-describedby={err ? "admin-err" : undefined}
          />
          {err && (
            <p id="admin-err" role="alert" className="mt-2 text-sm font-medium">
              {err}
            </p>
          )}
        </div>
        <button
          type="submit"
          disabled={!key || verify.isPending}
          className="inline-flex min-h-14 w-full items-center justify-center gap-3 bg-white text-[12px] font-medium uppercase tracking-[0.2em] text-sx-black disabled:opacity-50"
        >
          {verify.isPending && <Loader2 aria-hidden className="size-4 animate-spin" />}
          Enter
        </button>
      </form>
    </main>
  );
}

/* ---------------- Read-only legacy view ---------------- */
type Filter = Omit<LegacyListInput, "cursor" | "limit">;
const PAGE = 50;

export default function AdminPage() {
  usePageMeta("Applicants (read-only) — Sanctuary Crew", { noindex: true });
  const [authed, setAuthed] = useState(Boolean(getAdminKey()));
  const [filter, setFilter] = useState<Filter>({});
  const [term, setTerm] = useState("");
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const cursor = cursors[cursors.length - 1] ?? null;
  const q = useAdminApplications({ ...filter, cursor, limit: PAGE }, authed);
  const [open, setOpen] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  const apply = (next: Filter) => {
    setFilter(next);
    setCursors([null]);
  };

  if (!authed || (q.error && ["UNAUTHORIZED", "FORBIDDEN"].includes((q.error as { code?: string }).code ?? ""))) {
    return (
      <Gate
        notice={q.error ? (q.error as Error).message : null}
        onOk={() => {
          setAuthed(true);
          void q.refetch();
        }}
      />
    );
  }

  const rows = q.data?.rows ?? [];
  const totals = q.data?.totals;
  const funnel = q.data?.funnel ?? {};
  const integ = q.data?.integration;
  const pageNo = cursors.length;

  const doExport = async () => {
    setExporting("Preparing export…");
    try {
      const all = await fetchAllLegacyRows(filter);
      downloadCsv(`sanctuary-crew-applications-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(all, CSV_COLS));
      setExporting(`Exported ${all.length} of ${totals?.matching ?? all.length} matching application(s).`);
    } catch (e) {
      setExporting(`Export failed: ${(e as Error).message}`);
    }
  };

  return (
    <main id="main" className="min-h-[100svh] bg-sx-black">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-sx-black/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between gap-4 px-5 sm:px-8">
          <div className="flex items-center gap-4">
            <Wordmark />
            <span className="eyebrow hidden text-white/60 sm:inline">Applicant view · read-only</span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => q.refetch()} aria-label="Refresh" className="inline-flex size-11 items-center justify-center border border-white/20 hover:border-white">
              <RefreshCw aria-hidden className={cn("size-4", q.isFetching && "animate-spin")} strokeWidth={1.5} />
            </button>
            <button
              type="button"
              disabled={!totals?.matching || exporting === "Preparing export…"}
              onClick={doExport}
              className="inline-flex min-h-11 items-center gap-2 bg-white px-4 text-[11px] font-medium uppercase tracking-[0.2em] text-sx-black disabled:opacity-40"
            >
              <Download aria-hidden className="size-4" strokeWidth={1.5} /> <span className="sr-only sm:not-sr-only">Export</span> CSV
            </button>
            <button
              type="button"
              aria-label="Sign out"
              onClick={() => {
                sessionStorage.removeItem(ADMIN_KEY_STORAGE);
                setAuthed(false);
              }}
              className="inline-flex size-11 items-center justify-center border border-white/20 hover:border-white"
            >
              <LogOut aria-hidden className="size-4" strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] px-5 py-8 sm:px-8">
        <div className="mb-6 border border-white/15 p-4 text-sm text-white/70">
          This shared-key view is read-only. Reviews, status changes and retries happen in the{" "}
          <Link href="/staff" className="text-white underline underline-offset-4">
            staff console
          </Link>{" "}
          with your own account. All records here are <strong className="font-medium text-white">Saved locally — Command Center connection pending</strong>.
        </div>

        <section aria-label="Summary" className="grid grid-cols-2 gap-px bg-white/10 md:grid-cols-4 lg:grid-cols-8">
          {[
            ["All applications", totals?.population ?? "—"],
            ["Matching filter", totals?.matching ?? "—"],
            ["Page views", funnel.crew_page_view ?? 0],
            ["Started", funnel.application_started ?? 0],
            ["Submitted (events)", funnel.application_submitted ?? 0],
            ["Abandoned", funnel.application_abandoned ?? 0],
            ["Referral visits", funnel.referral_visit ?? 0],
            ["QR visits", funnel.qr_visit ?? 0],
          ].map(([k, v]) => (
            <div key={String(k)} className="bg-sx-black p-4">
              <p className="eyebrow text-[10px] text-white/60">{k}</p>
              <p className="mt-2 text-2xl font-light tabular-nums">{v}</p>
            </div>
          ))}
        </section>
        {integ && (
          <p className="mt-3 text-xs text-white/60">
            Submission mode: <strong className="font-medium text-white/70">{integ.submissionMode}</strong> · Referral validation:{" "}
            <strong className="font-medium text-white/70">{integ.referralMode}</strong> · Command Center:{" "}
            <strong className="font-medium text-white/70">{integ.mode}</strong> <span className="text-white/60">({integ.reason})</span>
          </p>
        )}
        {totals && Object.keys(totals.byStatus).length > 0 && (
          <p className="mt-2 text-xs text-white/60">
            By status (matching):{" "}
            {Object.entries(totals.byStatus)
              .map(([k, n]) => `${k.replace(/_/g, " ")} ${n}`)
              .join(" · ")}
          </p>
        )}

        <form
          className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_14rem_14rem_auto] lg:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            apply({ ...filter, q: term.trim() || undefined });
          }}
        >
          <div>
            <label htmlFor="search" className="eyebrow text-white/60">
              Search
            </label>
            <input id="search" aria-label="Search applicants" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Name, email, phone, city, code" className="field-input" />
          </div>
          <div>
            <label htmlFor="role-filter" className="eyebrow text-white/60">
              Role
            </label>
            <select
              id="role-filter"
              value={filter.role?.[0] ?? "all"}
              onChange={(e) => apply({ ...filter, role: e.target.value === "all" ? undefined : [e.target.value] })}
              className="field-input"
            >
              <option value="all">All roles</option>
              {ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="status-filter" className="eyebrow text-white/60">
              Status
            </label>
            <select
              id="status-filter"
              value={filter.status?.[0] ?? "all"}
              onChange={(e) => apply({ ...filter, status: e.target.value === "all" ? undefined : [e.target.value] })}
              className="field-input"
            >
              <option value="all">All statuses</option>
              {PIPELINE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="min-h-12 border border-white/30 px-5 text-[11px] uppercase tracking-[0.2em] hover:border-white">
            Search
          </button>
        </form>
        {exporting && (
          <output className="mt-3 block text-sm text-white/70">{exporting}</output>
        )}

        {q.isLoading ? (
          <div className="flex items-center gap-3 py-20 text-white/60">
            <Loader2 aria-hidden className="size-5 animate-spin" /> Loading applicants…
          </div>
        ) : q.error ? (
          <p role="alert" className="py-20">
            Couldn't load applicants: {(q.error as Error).message}
          </p>
        ) : rows.length === 0 ? (
          <p className="py-20 text-white/60">{totals?.population ? "No applications match this filter." : "No applications yet."}</p>
        ) : (
          <div className="mt-6 overflow-x-auto border border-white/10">
            <table className="w-full min-w-[900px] text-left text-sm">
              <caption className="sr-only">Crew applications, newest first (read-only)</caption>
              <thead className="border-b border-white/15 bg-sx-ink">
                <tr className="eyebrow text-[10px] text-white/60">
                  {["Applicant", "Role", "Date", "Source", "Campaign / Event", "Referral code", "Status", "Details"].map((h) => (
                    <th key={h} scope="col" className="px-4 py-3 font-medium">
                      {h === "Details" ? <span className="sr-only">{h}</span> : h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Fragment key={r.id}>
                    <tr className="border-b border-white/10 align-top hover:bg-white/[0.03]">
                      <td className="px-4 py-3">
                        <p className="font-medium">
                          {r.first_name} {r.last_name}
                        </p>
                        <p className="text-white/60">{r.email}</p>
                        <p className="text-white/60">{r.phone}</p>
                      </td>
                      <td className="px-4 py-3">{labelFor(ROLE_OPTIONS, r.role_interest)}</td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-white/70">
                        {new Date(r.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                      </td>
                      <td className="px-4 py-3 text-white/70">{sourceOf(r)}</td>
                      <td className="px-4 py-3 text-white/70">
                        {r.campaign ?? r.utm_campaign ?? "—"}
                        {r.event_id && <span className="block text-white/60">Event {r.event_id}</span>}
                      </td>
                      <td className="px-4 py-3">
                        {r.referral_code_used ? (
                          <>
                            <span className="font-medium">{r.referral_code_used}</span>
                            <span className="block text-xs text-white/60">{r.referral_code_status}</span>
                          </>
                        ) : (
                          <span className="text-white/60">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="capitalize">{r.application_status.replace(/_/g, " ")}</span>
                        {r.legacy_status && <span className="block text-xs text-white/60">was “{r.legacy_status}” (v1)</span>}
                        {r.status_flags.length > 0 && <span className="block text-xs text-white/60">{r.status_flags.join(", ").replace(/_/g, " ")}</span>}
                        {r.duplicate_attempts > 0 && <span className="mt-1 block text-xs text-white/60">Re-applied ×{r.duplicate_attempts}</span>}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          aria-expanded={open === r.id}
                          aria-label={`${open === r.id ? "Hide" : "Show"} details for ${r.first_name} ${r.last_name}`}
                          onClick={() => setOpen(open === r.id ? null : r.id)}
                          className="eyebrow min-h-10 text-[10px] text-white/70 underline-offset-4 hover:underline"
                        >
                          {open === r.id ? "Hide" : "Details"}
                        </button>
                      </td>
                    </tr>
                    {open === r.id && (
                      <tr className="border-b border-white/10 bg-sx-ink/60">
                        <td colSpan={8} className="px-4 py-5">
                          <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                            {[
                              ["Opportunity", r.opportunity_key],
                              ["Location", `${r.city}, ${r.state}`],
                              ["Travel", r.travel_range ? labelFor(TRAVEL_OPTIONS, r.travel_range) : "—"],
                              ["Instagram", r.instagram ? `@${r.instagram}` : "—"],
                              ["TikTok", r.tiktok ? `@${r.tiktok}` : "—"],
                              ["Other link", r.other_social ?? "—"],
                              ["Connects via", r.network_types.map((n) => labelFor(NETWORK_OPTIONS, n)).join(", ")],
                              ["Availability", labelFor(AVAILABILITY_OPTIONS, r.availability)],
                              ["Evenings / weekends", `${r.evenings_available ? "Yes" : "No"} / ${r.weekends_available ? "Yes" : "No"}`],
                              ["Could invite", labelFor(INVITE_RANGE_OPTIONS, r.promoter_invite_range) || "—"],
                              ["Promoted before", r.promoter_experience === null ? "—" : r.promoter_experience ? "Yes" : "No"],
                              ["Host areas", r.host_interests.map((h) => labelFor(HOST_INTEREST_OPTIONS, h)).join(", ") || "—"],
                              ["Heard via", labelFor(REFERRAL_SOURCE_OPTIONS, r.referral_source)],
                              ["Entry point", r.entry_point ?? "—"],
                              ["Landing page", r.landing_path ?? "—"],
                              ["Consent version", r.consent_version ?? "—"],
                              ["Marketing consent", r.marketing_consent ? "Yes" : "No"],
                              ["Record authority", `${r.authority} · sync ${r.sync_status}`],
                            ].map(([k, v]) => (
                              <div key={k}>
                                <dt className="eyebrow text-[10px] text-white/60">{k}</dt>
                                <dd className="mt-1 break-words text-white/85">{v}</dd>
                              </div>
                            ))}
                          </dl>
                          {[
                            ["Promoter experience", r.promoter_experience_notes],
                            ["Motivation", r.motivation],
                            ["Relevant experience", r.relevant_experience],
                            ["Scenario response", r.scenario_response],
                          ]
                            .filter(([, v]) => v)
                            .map(([k, v]) => (
                              <div key={k} className="mt-5">
                                <p className="eyebrow text-[10px] text-white/60">{k}</p>
                                <p className="mt-1 max-w-3xl whitespace-pre-wrap text-white/85">{v}</p>
                              </div>
                            ))}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {(pageNo > 1 || q.data?.nextCursor) && (
          <nav aria-label="Pagination" className="mt-4 flex items-center justify-between gap-4 text-sm text-white/70">
            <button
              type="button"
              disabled={pageNo <= 1}
              onClick={() => setCursors((c) => c.slice(0, -1))}
              className="min-h-11 border border-white/20 px-4 disabled:opacity-40"
            >
              Previous
            </button>
            <span>
              Page {pageNo} · showing {rows.length} of {totals?.matching ?? "—"}
            </span>
            <button
              type="button"
              disabled={!q.data?.nextCursor}
              onClick={() => q.data?.nextCursor && setCursors((c) => [...c, q.data.nextCursor])}
              className="min-h-11 border border-white/20 px-4 disabled:opacity-40"
            >
              Next
            </button>
          </nav>
        )}
      </div>
    </main>
  );
}

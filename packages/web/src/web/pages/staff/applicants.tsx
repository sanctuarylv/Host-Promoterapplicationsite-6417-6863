import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Download } from "lucide-react";
import { PIPELINE_STATUSES, ROLE_OPTIONS, labelFor } from "../../../api/crew/contract";
import { Btn, Empty, ErrorNote, Loading, PageTitle, SelectField, Stat, Tag, TextField, fmtDay, humanize } from "../../components/console/ui";
import { usePageMeta } from "../../hooks/use-page-meta";
import { downloadCsv, toCsv } from "../../lib/csv";
import { fetchAllApplicants, useApplicants, type ApplicantListInput } from "../../queries/recruiting";

type Filter = Omit<ApplicantListInput, "cursor" | "limit">;
type Row = NonNullable<ReturnType<typeof useApplicants>["data"]>["rows"][number];

const PAGE = 50;

const CSV_COLS: [string, (r: Row) => unknown][] = [
  ["id", (r) => r.id],
  ["person_id", (r) => r.person_id],
  ["opportunity_key", (r) => r.opportunity_key],
  ["pathway", (r) => r.pathway],
  ["created_at", (r) => r.created_at],
  ["first_name", (r) => r.first_name],
  ["last_name", (r) => r.last_name],
  ["email", (r) => r.email],
  ["phone", (r) => r.phone],
  ["city", (r) => r.city],
  ["state", (r) => r.state],
  ["role_interest", (r) => r.role_interest],
  ["travel_range", (r) => r.travel_range],
  ["availability", (r) => r.availability],
  ["referral_source", (r) => r.referral_source],
  ["referral_code_used", (r) => r.referral_code_used],
  ["referral_code_status", (r) => r.referral_code_status],
  ["campaign", (r) => r.campaign],
  ["utm_source", (r) => r.utm_source],
  ["utm_medium", (r) => r.utm_medium],
  ["utm_campaign", (r) => r.utm_campaign],
  ["utm_content", (r) => r.utm_content],
  ["application_status", (r) => r.application_status],
  ["legacy_status", (r) => r.legacy_status],
  ["status_flags", (r) => r.status_flags],
  ["reviewer_user_id", (r) => r.reviewer_user_id],
  ["review_due_at", (r) => r.review_due_at],
  ["consent_version", (r) => r.consent_version],
  ["marketing_consent", (r) => r.marketing_consent],
  ["sync_status", (r) => r.sync_status],
  ["authority", (r) => r.authority],
];

const STATUS_OPTS = [["", "All statuses"], ...PIPELINE_STATUSES.map((s) => [s, humanize(s)] as const)] as const;
const ROLE_OPTS = [["", "All roles"], ...ROLE_OPTIONS.map((r) => [r.value, r.label] as const)] as const;

export default function ApplicantsPage() {
  usePageMeta("Applicants · Sanctuary LV staff", { noindex: true });
  const [filter, setFilter] = useState<Filter>({ reviewer: "any", referral: "any", sync: "any" });
  const [q, setQ] = useState("");
  const [stack, setStack] = useState<(string | null)[]>([null]);
  const cursor = stack[stack.length - 1] ?? null;
  const input = useMemo(() => ({ ...filter, cursor, limit: PAGE }), [filter, cursor]);
  const list = useApplicants(input);
  const [exporting, setExporting] = useState<string | null>(null);

  const apply = (patch: Partial<Filter>) => {
    setFilter((f) => ({ ...f, ...patch }));
    setStack([null]);
  };

  const exportCsv = async () => {
    setExporting("Exporting…");
    try {
      const rows = await fetchAllApplicants(filter);
      downloadCsv(`sanctuary-applicants-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows, CSV_COLS));
      setExporting(`Exported ${rows.length} row(s) matching the current filter.`);
    } catch (e) {
      setExporting(e instanceof Error ? e.message : "Export failed.");
    }
  };

  const t = list.data?.totals;
  return (
    <>
      <PageTitle eyebrow="Recruiting" title="Applicants">
        <Btn onClick={() => void exportCsv()} busy={exporting === "Exporting…"} disabled={!t?.matching}>
          <Download aria-hidden className="size-4" /> CSV (current filter)
        </Btn>
      </PageTitle>
      {exporting && exporting !== "Exporting…" && <output className="mb-4 block text-sm text-white/75">{exporting}</output>}

      <form
        className="mb-6 grid gap-3 border border-white/12 bg-sx-ink p-4 sm:grid-cols-2 lg:grid-cols-6"
        onSubmit={(e) => {
          e.preventDefault();
          apply({ q: q.trim() || undefined });
        }}
      >
        <TextField label="Search" placeholder="Name, email, phone, city, code" value={q} onChange={(e) => setQ(e.target.value)} className="lg:col-span-2" />
        <SelectField label="Status" options={STATUS_OPTS} value={filter.status?.[0] ?? ""} onChange={(e) => apply({ status: e.target.value ? [e.target.value] : undefined })} />
        <SelectField label="Role interest" options={ROLE_OPTS} value={filter.role?.[0] ?? ""} onChange={(e) => apply({ role: e.target.value ? [e.target.value] : undefined })} />
        <SelectField
          label="Reviewer"
          options={[["any", "Anyone"], ["unassigned", "Unassigned"], ["mine", "Assigned to me"]]}
          value={filter.reviewer ?? "any"}
          onChange={(e) => apply({ reviewer: e.target.value as Filter["reviewer"] })}
        />
        <SelectField
          label="Referral code"
          options={[["any", "Any"], ["valid", "Valid"], ["invalid", "Invalid"], ["unverified", "Unverified"], ["none", "None"]]}
          value={filter.referral ?? "any"}
          onChange={(e) => apply({ referral: e.target.value as Filter["referral"] })}
        />
        <SelectField
          label="Sync"
          options={[["any", "Any"], ["not_configured", "Not configured"], ["pending", "Pending"], ["synced", "Synced"], ["failed", "Failed"]]}
          value={filter.sync ?? "any"}
          onChange={(e) => apply({ sync: e.target.value as Filter["sync"] })}
        />
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" aria-label="Overdue reviews only" className="size-5 accent-white" checked={Boolean(filter.overdue)} onChange={(e) => apply({ overdue: e.target.checked || undefined })} />
          Overdue reviews
        </label>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" aria-label="Flagged only" className="size-5 accent-white" checked={Boolean(filter.flagged)} onChange={(e) => apply({ flagged: e.target.checked || undefined })} />
          Flagged (legacy / shared phone)
        </label>
        <div className="flex items-end gap-2 lg:col-span-2">
          <Btn type="submit" variant="solid">
            Search
          </Btn>
          <Btn
            variant="ghost"
            onClick={() => {
              setQ("");
              setFilter({ reviewer: "any", referral: "any", sync: "any" });
              setStack([null]);
            }}
          >
            Reset
          </Btn>
        </div>
      </form>

      {list.error && <ErrorNote error={list.error} className="mb-4" />}
      {t && (
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Matching filter" value={t.matching} hint={`of ${t.population} total applications`} />
          <Stat label="Submitted" value={t.byStatus.submitted ?? 0} hint={`of ${t.matching} matching`} />
          <Stat label="Selected or later" value={["selected", "offer_issued", "accepted", "onboarding", "event_ready"].reduce((n, s) => n + (t.byStatus[s] ?? 0), 0)} hint={`of ${t.matching} matching`} />
          <Stat label="Waitlisted / closed" value={["waitlisted", "declined", "withdrawn"].reduce((n, s) => n + (t.byStatus[s] ?? 0), 0)} hint={`of ${t.matching} matching`} />
        </div>
      )}

      {list.isPending ? (
        <Loading />
      ) : !list.data?.rows.length ? (
        <Empty>No applications match this filter.</Empty>
      ) : (
        <div className="overflow-x-auto border border-white/12">
          <table className="cx-table">
            <caption className="sr-only">Applications, newest first</caption>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Role interest</th>
                <th scope="col">Status</th>
                <th scope="col">City</th>
                <th scope="col">Source</th>
                <th scope="col">Received</th>
                <th scope="col">Review due</th>
                <th scope="col">Sync</th>
              </tr>
            </thead>
            <tbody>
              {list.data.rows.map((r) => (
                <tr key={r.id}>
                  <th scope="row">
                    <Link href={`/staff/applicants/${r.id}`} className="underline-offset-4 hover:underline">
                      {r.first_name} {r.last_name}
                    </Link>
                    <span className="block text-xs font-normal text-white/60">{r.email}</span>
                  </th>
                  <td>{labelFor(ROLE_OPTIONS, r.role_interest)}</td>
                  <td>
                    <Tag tone={r.status_flags.length ? "warn" : "default"}>{humanize(r.application_status)}</Tag>
                    {r.status_flags.length > 0 && <span className="mt-1 block text-xs text-white/60">{r.status_flags.map(humanize).join(", ")}</span>}
                  </td>
                  <td>{[r.city, r.state].filter(Boolean).join(", ") || "—"}</td>
                  <td>{r.utm_source ?? r.referral_source ?? "—"}</td>
                  <td>{fmtDay(r.created_at)}</td>
                  <td>{r.review_due_at ? fmtDay(r.review_due_at) : "—"}</td>
                  <td>
                    <Tag tone="muted">{humanize(r.sync_status)}</Tag>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <nav aria-label="Pages" className="mt-4 flex items-center justify-between gap-3">
        <Btn disabled={stack.length < 2} onClick={() => setStack((s) => s.slice(0, -1))}>
          Previous
        </Btn>
        <span className="text-sm text-white/65">
          Page {stack.length}
          {t ? ` · ${t.matching} matching` : ""}
        </span>
        <Btn disabled={!list.data?.nextCursor} onClick={() => list.data?.nextCursor && setStack((s) => [...s, list.data.nextCursor])}>
          Next
        </Btn>
      </nav>
    </>
  );
}

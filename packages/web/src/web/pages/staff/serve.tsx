import { useState } from "react";
import { Btn, Empty, ErrorNote, Loading, PageTitle, Panel, SelectField, Stat, Tag, TextField, fmtDate, humanize } from "../../components/console/ui";
import { usePageMeta } from "../../hooks/use-page-meta";
import { NONPROFIT_ENTITY } from "../../lib/pathways";
import { useServeQueue, useSetServeStatus, type ServeStatus } from "../../queries/integration";

const STATUSES: [ServeStatus, string][] = [
  ["received", "Received"],
  ["contacted", "Contacted"],
  ["approved_to_serve", "Approved to serve"],
  ["not_now", "Not now"],
  ["withdrawn", "Withdrawn"],
];

type Row = NonNullable<ReturnType<typeof useServeQueue>["data"]>["rows"][number];

function ServeRow({ r }: { r: Row }) {
  const set = useSetServeStatus();
  const [status, setStatus] = useState<ServeStatus>(r.status as ServeStatus);
  const [note, setNote] = useState("");
  return (
    <li className="border border-white/12 px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">
            {r.first_name} {r.last_name}
          </p>
          <p className="text-xs text-white/65">
            {r.email_normalized}
            {r.phone_normalized ? ` · ${r.phone_normalized}` : ""}
            {r.city ? ` · ${r.city}` : ""}
          </p>
          <p className="mt-1 text-sm">Areas: {r.areas.map(humanize).join(", ")}</p>
          <p className="text-sm text-white/80">Availability: {r.availability}</p>
          {r.notes && <p className="mt-1 text-sm text-white/75">{r.notes}</p>}
          <p className="mt-1 text-xs text-white/60">
            Received {fmtDate(r.created_at)} · consent {r.consent_version}
          </p>
        </div>
        <Tag tone={r.status === "approved_to_serve" ? "solid" : "default"}>{humanize(r.status)}</Tag>
      </div>
      <form
        className="mt-3 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          set.mutate({ id: r.id, revision: r.revision, status, note: note || undefined }, { onSuccess: () => setNote("") });
        }}
      >
        <SelectField label="Status" options={STATUSES} value={status} onChange={(e) => setStatus(e.target.value as ServeStatus)} />
        <TextField className="min-w-48 flex-1" label="Internal note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <Btn type="submit" busy={set.isPending} disabled={status === r.status}>
          Update
        </Btn>
      </form>
      <ErrorNote error={set.error} className="mt-2" />
    </li>
  );
}

export default function ServeQueuePage() {
  usePageMeta("Serve Team · Staff", { noindex: true });
  const [filter, setFilter] = useState<ServeStatus | "">("");
  const q = useServeQueue(filter ? [filter] : undefined);
  return (
    <div className="space-y-6">
      <PageTitle eyebrow={NONPROFIT_ENTITY} title="Serve Team" />
      <p className="max-w-3xl text-sm text-white/75">
        Volunteer interest for the {NONPROFIT_ENTITY} Serve Team. This is unpaid volunteer service and is kept separate from paid Sanctuary LV Group applications. Changing a status here does not send any message.
      </p>
      {q.isPending ? (
        <Loading />
      ) : q.error || !q.data ? (
        <ErrorNote error={q.error} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Total" value={q.data.total} />
            {STATUSES.map(([s, l]) => (
              <Stat key={s} label={l} value={q.data.byStatus.find((b) => b.status === s)?.n ?? 0} hint={`of ${q.data.total}`} />
            ))}
          </div>
          <Panel
            id="queue"
            title={`Queue (${q.data.rows.length})`}
            actions={<SelectField label="Filter" options={[["", "All statuses"], ...STATUSES]} value={filter} onChange={(e) => setFilter(e.target.value as ServeStatus | "")} />}
          >
            {q.data.rows.length === 0 ? (
              <Empty>No Serve Team interest{filter ? " with this status" : ""} yet.</Empty>
            ) : (
              <ul className="space-y-2">
                {q.data.rows.map((r) => (
                  <ServeRow key={`${r.id}-${r.revision}`} r={r} />
                ))}
              </ul>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}

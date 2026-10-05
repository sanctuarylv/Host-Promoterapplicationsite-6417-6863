import { Link } from "wouter";
import { Btn, Empty, ErrorNote, Loading, fmtDay, humanize } from "../../components/console/ui";
import { usePageMeta } from "../../hooks/use-page-meta";
import { useEventCallSheet } from "../../queries/events";

/** Printable call sheet. Approved assignments only; department leads see their departments only. */
export default function CallSheetPage({ id }: { id: string }) {
  const q = useEventCallSheet(id);
  usePageMeta(q.data ? `Call sheet · ${q.data.event.name}` : "Call sheet", { noindex: true });
  if (q.isPending) return <Loading />;
  if (q.error || !q.data) return <ErrorNote error={q.error} />;
  const { event: ev, rows, runOfShow, scope } = q.data;
  const byDept = new Map<string, typeof rows>();
  for (const r of rows) byDept.set(r.department, [...(byDept.get(r.department) ?? []), r]);
  return (
    <div className="print-sheet space-y-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link href={`/staff/events/${ev.id}`} className="text-sm text-white/75 underline underline-offset-4 hover:text-white">
          ← Back to event
        </Link>
        <Btn variant="solid" onClick={() => window.print()}>
          Print call sheet
        </Btn>
      </div>
      <header className="border-b border-white/20 pb-4">
        <p className="eyebrow text-white/60">Call sheet{scope === "departments" ? " · your departments only" : ""}</p>
        <h1 className="heading mt-1 text-3xl">{ev.name}</h1>
        <p className="mt-2 text-sm">
          {ev.localDate ? fmtDay(`${ev.localDate}T12:00:00`) : "Date TBD"} {ev.dateConfirmed ? "" : "(unconfirmed)"} · {ev.venue ?? "Venue TBD"} {ev.venueConfirmed ? "" : "(unconfirmed)"} · {ev.timezone}
        </p>
        {!ev.dateConfirmed && <p className="mt-2 text-sm font-medium">DRAFT — date not confirmed. Do not distribute as final.</p>}
      </header>

      {ev.milestones.length > 0 && (
        <section>
          <h2 className="text-base font-medium">Milestones</h2>
          <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-3">
            {ev.milestones.map((m) => (
              <li key={m.key} className="flex justify-between border border-white/15 px-3 py-1">
                <span>{m.label}</span>
                <span className="tabular-nums">{m.local}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {rows.length === 0 ? (
        <Empty>No approved assignments yet.</Empty>
      ) : (
        [...byDept.entries()].map(([dept, list]) => (
          <section key={dept}>
            <h2 className="text-base font-medium">{humanize(dept)}</h2>
            <div className="mt-2 overflow-x-auto">
              <table className="cx-table min-w-[640px]">
                <caption className="sr-only">{humanize(dept)} call times</caption>
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Role</th>
                    <th scope="col">Call</th>
                    <th scope="col">Release</th>
                    <th scope="col">Supervisor</th>
                    <th scope="col">Zones</th>
                    <th scope="col">Dress</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => (
                    <tr key={r.id}>
                      <td className="font-medium">{r.name}</td>
                      <td>{r.role}</td>
                      <td className="tabular-nums">{r.call}</td>
                      <td className="tabular-nums">{r.release}</td>
                      <td>{r.supervisor}</td>
                      <td className="text-xs">{r.zones.length ? r.zones.join(", ") : "—"}</td>
                      <td className="text-xs">{r.dress ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}

      {runOfShow.length > 0 && (
        <section>
          <h2 className="text-base font-medium">Run of show</h2>
          <ol className="mt-2 space-y-1 text-sm">
            {runOfShow.map((r) => (
              <li key={r.id}>
                <span className="tabular-nums">
                  {r.milestone_key ?? "—"} {r.offset_min >= 0 ? "+" : ""}
                  {r.offset_min}m
                </span>{" "}
                · {r.title}
                {r.department_key ? ` · ${humanize(r.department_key)}` : ""}
              </li>
            ))}
          </ol>
        </section>
      )}
      <p className="text-xs text-white/60">Generated from local staging data (authority=local_staging). Command Center connection pending.</p>
    </div>
  );
}

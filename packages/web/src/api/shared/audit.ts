/** Append-only audit writer. The app never updates or deletes crew_audit rows. */
import { db } from "../database";
import { crewAudit } from "../database/schema";

export type Actor = { userId: string | null; label: string };
export const SYSTEM: Actor = { userId: null, label: "system" };

type Exec = Pick<typeof db, "insert">;

export async function audit(
  exec: Exec,
  actor: Actor,
  e: {
    entityType: string;
    entityId: string;
    action: string;
    from?: string | null;
    to?: string | null;
    revision?: number | null;
    note?: string | null;
    data?: Record<string, unknown> | null;
  },
) {
  await exec.insert(crewAudit).values({
    entity_type: e.entityType,
    entity_id: e.entityId,
    action: e.action,
    actor_user_id: actor.userId,
    actor_label: actor.label,
    from_value: e.from ?? null,
    to_value: e.to ?? null,
    revision: e.revision ?? null,
    note: e.note ? e.note.slice(0, 2000) : null,
    data: e.data ?? null,
  });
}

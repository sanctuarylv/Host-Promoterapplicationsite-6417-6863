/** Reporting lines — stored per relation; cycles are rejected per relation. */
import { and, eq } from "drizzle-orm";
import { db } from "../database";
import { opsReportingLines } from "../database/schema";

export const RELATIONS = ["operational", "pastoral", "coordination"] as const;
export type Relation = (typeof RELATIONS)[number];

/** Would adding child → parent create a cycle in `relation`? (pure, for tests) */
export function createsCycle(edges: { child: string; parent: string }[], child: string, parent: string): boolean {
  if (child === parent) return true;
  const up = new Map<string, string[]>();
  for (const e of edges) up.set(e.child, [...(up.get(e.child) ?? []), e.parent]);
  const seen = new Set<string>();
  const stack = [parent];
  while (stack.length) {
    const n = stack.pop()!;
    if (n === child) return true;
    if (seen.has(n)) continue;
    seen.add(n);
    stack.push(...(up.get(n) ?? []));
  }
  return false;
}

export async function addReportingLine(relation: Relation, child: string, parent: string, id: string, note?: string) {
  const edges = await db.select({ child: opsReportingLines.child_key, parent: opsReportingLines.parent_key }).from(opsReportingLines).where(eq(opsReportingLines.relation, relation));
  if (relation !== "coordination" && createsCycle(edges, child, parent)) return { ok: false as const, error: "cycle" };
  await db.insert(opsReportingLines).values({ id, relation, child_key: child, parent_key: parent, note: note ?? null }).onConflictDoNothing();
  return { ok: true as const };
}

export async function removeReportingLine(relation: Relation, child: string, parent: string) {
  await db.delete(opsReportingLines).where(and(eq(opsReportingLines.relation, relation), eq(opsReportingLines.child_key, child), eq(opsReportingLines.parent_key, parent)));
}

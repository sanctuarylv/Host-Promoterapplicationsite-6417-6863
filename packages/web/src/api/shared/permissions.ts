/**
 * Scoped staff permissions. A Better Auth account grants NOTHING by itself;
 * access comes only from active staff_memberships rows (granted by the CLI
 * script or an existing admin) or from an explicit person link (workers).
 */
import { ORPCError } from "@orpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../database";
import { crewPeople, staffMemberships } from "../database/schema";

export const STAFF_ROLES = [
  "admin",
  "recruiter",
  "department_lead",
  "event_director",
  "promotion_lead",
  "compensation_approver",
  "serve_coordinator",
] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export type Membership = { id: string; role: StaffRole; eventId: string | null; departmentKey: string | null };

export type Principal = {
  userId: string;
  email: string;
  name: string;
  memberships: Membership[];
  personId: string | null;
};

export type Action =
  | "recruiting.read"
  | "recruiting.write"
  | "terms.read"
  | "terms.draft"
  | "terms.approve"
  | "offers.issue"
  | "training.verify"
  | "people.link"
  | "event.read"
  | "event.manage"
  | "roster.read"
  | "roster.write"
  | "assignment.approve"
  | "attendance.record"
  | "hours.read"
  | "promoters.manage"
  | "referrals.read"
  | "campaigns.read"
  | "campaigns.write"
  | "integration.manage"
  | "staff.manage"
  | "serve.manage";

export type Scope = { eventId?: string | null; departmentKey?: string | null };

const GLOBAL: Record<string, StaffRole[]> = {
  "recruiting.read": ["admin", "recruiter"],
  "recruiting.write": ["admin", "recruiter"],
  "terms.read": ["admin", "recruiter", "compensation_approver"],
  "terms.draft": ["admin", "recruiter", "compensation_approver"],
  "terms.approve": ["compensation_approver"], // deliberately NOT admin: separation of duties
  "offers.issue": ["admin", "recruiter"],
  "training.verify": ["admin", "recruiter"],
  "people.link": ["admin", "recruiter"],
  "campaigns.read": ["admin", "recruiter", "promotion_lead"],
  "campaigns.write": ["admin", "recruiter", "promotion_lead"],
  "integration.manage": ["admin"],
  "staff.manage": ["admin"],
  "serve.manage": ["admin", "serve_coordinator"],
};

/** Event-scoped actions: which roles, and whether the department must match. */
const EVENT: Record<string, { roles: StaffRole[]; dept?: StaffRole[] }> = {
  "event.read": { roles: ["admin", "event_director", "department_lead", "promotion_lead", "compensation_approver"] },
  "event.manage": { roles: ["admin", "event_director"] },
  "roster.read": { roles: ["admin", "event_director", "department_lead"], dept: ["department_lead"] },
  "roster.write": { roles: ["admin", "event_director", "department_lead"], dept: ["department_lead"] },
  "assignment.approve": { roles: ["admin", "event_director"] },
  "attendance.record": { roles: ["admin", "event_director", "department_lead"], dept: ["department_lead"] },
  "hours.read": { roles: ["admin", "event_director", "compensation_approver"] },
  "promoters.manage": { roles: ["admin", "event_director", "promotion_lead"] },
  "referrals.read": { roles: ["admin", "event_director", "promotion_lead"] },
  "training.verify": { roles: ["admin", "recruiter", "event_director", "department_lead"] },
};

export function can(p: Principal, action: Action, scope: Scope = {}): boolean {
  const g = GLOBAL[action];
  if (g && p.memberships.some((m) => g.includes(m.role))) return true;
  const e = EVENT[action];
  if (!e) return false;
  return p.memberships.some((m) => {
    if (!e.roles.includes(m.role)) return false;
    if (m.role === "admin") return true;
    if (m.eventId && scope.eventId !== undefined && m.eventId !== scope.eventId) return false;
    if (m.eventId && scope.eventId === undefined) return false; // event-pinned membership needs an event scope
    if (e.dept?.includes(m.role)) {
      if (!m.departmentKey) return false;
      if (scope.departmentKey === undefined) return false;
      if (scope.departmentKey !== null && m.departmentKey !== scope.departmentKey) return false;
      if (scope.departmentKey === null) return false;
    }
    return true;
  });
}

/** Departments a principal may see within an event (null = all departments). */
export function visibleDepartments(p: Principal, action: Action, eventId: string): string[] | null {
  if (can(p, action, { eventId, departmentKey: "__all__" }) && !onlyDeptScoped(p, action, eventId)) return null;
  return p.memberships
    .filter((m) => m.role === "department_lead" && m.departmentKey && (!m.eventId || m.eventId === eventId))
    .map((m) => m.departmentKey!);
}

function onlyDeptScoped(p: Principal, action: Action, eventId: string) {
  const e = EVENT[action];
  if (!e) return true;
  return !p.memberships.some(
    (m) => e.roles.includes(m.role) && !e.dept?.includes(m.role) && (m.role === "admin" || !m.eventId || m.eventId === eventId),
  );
}

/**
 * Whole-event visibility (every department's roster and names). `event.read`
 * lists department_lead so a lead can open the events they work on, but a
 * department lead's VIEW is always narrowed to their own departments — so the
 * department-scoped memberships are excluded when deciding "full".
 */
export function canSeeWholeEvent(p: Principal, eventId: string): boolean {
  return can({ ...p, memberships: p.memberships.filter((m) => m.role !== "department_lead") }, "event.read", { eventId });
}

export function requireCan(p: Principal, action: Action, scope: Scope = {}) {
  if (!can(p, action, scope)) throw new ORPCError("FORBIDDEN", { message: `Not permitted: ${action}` });
}

export async function loadPrincipal(user: { id: string; email: string; name: string }): Promise<Principal> {
  const ms = await db
    .select()
    .from(staffMemberships)
    .where(and(eq(staffMemberships.user_id, user.id), isNull(staffMemberships.revoked_at)));
  const [person] = await db.select({ id: crewPeople.id }).from(crewPeople).where(eq(crewPeople.user_id, user.id)).limit(1);
  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    memberships: ms
      .filter((m) => (STAFF_ROLES as readonly string[]).includes(m.role))
      .map((m) => ({ id: m.id, role: m.role as StaffRole, eventId: m.event_id, departmentKey: m.department_key })),
    personId: person?.id ?? null,
  };
}

export const actorOf = (p: Principal) => ({
  userId: p.userId,
  label: p.memberships.length ? `staff:${p.memberships.map((m) => m.role).join("+")}` : "worker",
});

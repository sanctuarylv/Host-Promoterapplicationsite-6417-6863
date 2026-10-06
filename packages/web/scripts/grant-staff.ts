/**
 * Grant (or list / revoke) a staff membership from the server shell. This is
 * the ONLY bootstrap path for the first admin — there is no public bootstrap.
 * The account must already exist (the person signed in once); no account is
 * created and nothing is emailed.
 *
 *   bun scripts/grant-staff.ts --list
 *   bun scripts/grant-staff.ts --email=a@b.org --role=admin --operator="Your name"
 *   bun scripts/grant-staff.ts --email=a@b.org --role=department_lead --department=guest_experience [--event=<id>] --operator=...
 *   bun scripts/grant-staff.ts --revoke=<membership id> --operator=...
 */
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../src/api/database";
import { crewAudit, staffMemberships, user } from "../src/api/database/schema";
import { STAFF_ROLES, type StaffRole } from "../src/api/shared/permissions";
import { uuid } from "../src/api/shared/ids";
import { arg, assertWritable } from "./guard";

const argv = process.argv.slice(2);
const list = argv.includes("--list");
const target = assertWritable(argv, list);

if (list) {
  const rows = await db
    .select({ id: staffMemberships.id, email: user.email, role: staffMemberships.role, event: staffMemberships.event_id, dept: staffMemberships.department_key, by: staffMemberships.granted_by })
    .from(staffMemberships)
    .leftJoin(user, eq(user.id, staffMemberships.user_id))
    .where(isNull(staffMemberships.revoked_at));
  console.table(rows);
  process.exit(0);
}

const operator = arg(argv, "operator");
if (!operator || operator.length < 2) {
  console.error("--operator=<your name> is required (recorded in the audit log).");
  process.exit(1);
}
const actor = `cli:${operator.slice(0, 60)}`;

const revoke = arg(argv, "revoke");
if (revoke) {
  const res = await db
    .update(staffMemberships)
    .set({ revoked_at: new Date(), revoked_by: actor })
    .where(and(eq(staffMemberships.id, revoke), isNull(staffMemberships.revoked_at)));
  if (res.rowsAffected === 0) {
    console.error("No active membership with that id.");
    process.exit(1);
  }
  await db.insert(crewAudit).values({ entity_type: "staff_membership", entity_id: revoke, action: "staff.revoke", actor_label: actor });
  console.log(`Revoked ${revoke} on ${target.label}.`);
  process.exit(0);
}

const email = arg(argv, "email")?.trim().toLowerCase();
const role = arg(argv, "role") as StaffRole | undefined;
const department = arg(argv, "department") ?? null;
const event = arg(argv, "event") ?? null;
if (!email || !role || !(STAFF_ROLES as readonly string[]).includes(role)) {
  console.error(`--email and --role are required. Roles: ${STAFF_ROLES.join(", ")}`);
  process.exit(1);
}
if (role === "department_lead" && !department) {
  console.error("department_lead needs --department=<key>.");
  process.exit(1);
}
const [u] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
if (!u) {
  console.error("No account with that email. Ask the person to sign in once, then re-run.");
  process.exit(1);
}
const id = uuid();
await db.insert(staffMemberships).values({ id, user_id: u.id, role, event_id: event, department_key: department, granted_by: actor });
await db.insert(crewAudit).values({ entity_type: "staff_membership", entity_id: id, action: "staff.grant", actor_label: actor, to_value: role, data: { userId: u.id, event, department } });
console.log(`Granted ${role}${department ? `/${department}` : ""}${event ? ` @${event}` : ""} → ${id} on ${target.label}.`);

import { ORPCError } from "@orpc/server";
import { base } from "../__core/app";
import { auth } from "../auth";
import { loadPrincipal } from "../shared/permissions";

/** Optional auth — `context.user` is the session user or null. */
export const withUser = base.use(async ({ context, next }) => {
  const session = await auth.api.getSession({ headers: context.headers });
  return next({ context: { user: session?.user ?? null, session: session?.session ?? null } });
});

/** Protected procedures — rejects unauthenticated calls; `context.user` is non-null. */
export const authed = base.use(async ({ context, next }) => {
  const session = await auth.api.getSession({ headers: context.headers });
  if (!session) throw new ORPCError("UNAUTHORIZED");
  return next({ context: { user: session.user, session: session.session } });
});

/** Signed-in user + scoped memberships + explicitly linked person (if any). */
export const principalProc = authed.use(async ({ context, next }) => {
  const principal = await loadPrincipal(context.user);
  return next({ context: { principal } });
});

/** Staff-only: at least one active membership. Specific actions are checked per procedure. */
export const staffProc = principalProc.use(async ({ context, next }) => {
  if (context.principal.memberships.length === 0) throw new ORPCError("FORBIDDEN", { message: "No staff access on this account." });
  return next();
});

/** Worker self-service: the account must be explicitly linked to a person record. */
export const workerProc = principalProc.use(async ({ context, next }) => {
  const personId = context.principal.personId;
  if (!personId) throw new ORPCError("FORBIDDEN", { message: "This account is not linked to a crew profile yet." });
  return next({ context: { personId } });
});

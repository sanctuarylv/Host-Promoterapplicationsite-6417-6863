import type { RouterClient } from "@orpc/server";
import { createApp } from "./__core/app";
import { auth } from "./auth";
import { ping } from "./routes/ping";
import { crew } from "./routes/crew";
import { crewAdmin } from "./routes/crew-admin";
import { recruiting } from "./routes/recruiting";
import { terms, offers, training } from "./routes/terms";
import { org, templates, events, assignments } from "./routes/events";
import { credentials, attendance, promoters } from "./routes/credentials";
import { me, worker } from "./routes/worker";
import { campaigns } from "./routes/campaigns";
import { integration, staff, serveTeam } from "./routes/integration";

export const router = {
  ping,
  crew,
  crewAdmin,
  recruiting,
  terms,
  offers,
  training,
  org,
  templates,
  events,
  assignments,
  credentials,
  attendance,
  promoters,
  me,
  worker,
  campaigns,
  integration,
  staff,
  serveTeam,
};

export type AppRouter = typeof router;
/** Typed client for the router — used by the web and mobile api clients. */
export type AppRouterClient = RouterClient<AppRouter>;

const app = createApp(router);
app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

export default app;

import { lazy, Suspense, type ReactNode } from "react";
import { Redirect, Route, Switch } from "wouter";
import { ConsoleShell, STAFF_NAV } from "../../components/console/shell";
import { Empty, Loading } from "../../components/console/ui";
import { useMe } from "../../queries/session";

const Applicants = lazy(() => import("./applicants"));
const ApplicantDetail = lazy(() => import("./applicant-detail"));
const Terms = lazy(() => import("./terms"));
const Events = lazy(() => import("./events"));
const EventDetail = lazy(() => import("./event-detail"));
const CallSheet = lazy(() => import("./call-sheet"));
const Campaigns = lazy(() => import("./campaigns"));
const CampaignDetail = lazy(() => import("./campaign-detail"));
const Integration = lazy(() => import("./integration"));
const ServeQueue = lazy(() => import("./serve"));
const Access = lazy(() => import("./access"));

/** /staff → first section this account may open (navigation hint only; the server re-checks). */
function FirstSection() {
  const me = useMe();
  if (!me.data) return <Loading />;
  const first = STAFF_NAV.find((n) => me.data.sections[n.key]);
  if (!first) return <Empty>No staff sections are available to this account.</Empty>;
  return <Redirect to={first.href} replace />;
}

type Section = (typeof STAFF_NAV)[number]["key"];

/**
 * Hides sections outside this account's role instead of mounting a page whose
 * calls would all be refused. Navigation hint only — the server still checks
 * every call, so a stale hint can only hide UI, never grant access.
 */
function Gate({ section, children }: { section: Section; children: ReactNode }) {
  const me = useMe();
  if (!me.data) return <Loading />;
  if (!me.data.sections[section]) return <Empty>This section is not part of your staff role. Ask an administrator if you need access.</Empty>;
  return <>{children}</>;
}

export default function StaffRouter() {
  return (
    <ConsoleShell>
      <Suspense fallback={<Loading />}>
        <Switch>
          <Route path="/staff" component={FirstSection} />
          <Route path="/staff/applicants">{() => <Gate section="applicants"><Applicants /></Gate>}</Route>
          <Route path="/staff/applicants/:id">{(p) => <Gate section="applicants"><ApplicantDetail id={p.id} /></Gate>}</Route>
          <Route path="/staff/terms">{() => <Gate section="terms"><Terms /></Gate>}</Route>
          <Route path="/staff/events">{() => <Gate section="events"><Events /></Gate>}</Route>
          <Route path="/staff/events/:id">{(p) => <Gate section="events"><EventDetail id={p.id} /></Gate>}</Route>
          <Route path="/staff/events/:id/call-sheet">{(p) => <Gate section="events"><CallSheet id={p.id} /></Gate>}</Route>
          <Route path="/staff/campaigns">{() => <Gate section="campaigns"><Campaigns /></Gate>}</Route>
          <Route path="/staff/campaigns/:id">{(p) => <Gate section="campaigns"><CampaignDetail id={p.id} /></Gate>}</Route>
          <Route path="/staff/integration">{() => <Gate section="integration"><Integration /></Gate>}</Route>
          <Route path="/staff/serve">{() => <Gate section="serve"><ServeQueue /></Gate>}</Route>
          <Route path="/staff/access">{() => <Gate section="staff"><Access /></Gate>}</Route>
          <Route>
            <Empty>That staff page does not exist.</Empty>
          </Route>
        </Switch>
      </Suspense>
    </ConsoleShell>
  );
}

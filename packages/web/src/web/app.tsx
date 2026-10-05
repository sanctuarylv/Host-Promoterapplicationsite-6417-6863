import { lazy, Suspense } from "react";
import { Redirect, Route, Switch, useParams } from "wouter";
import CrewLanding from "./pages/index";
import NotFound from "./pages/not-found";
import { Provider } from "./components/provider";
import { AgentFeedback, RunableBadge } from "@runablehq/website-runtime";
import { captureAttribution } from "./lib/attribution";
import { track } from "./lib/analytics";
import { ProtectedRoute } from "./components/protected-route";

const Blank = () => <div className="min-h-screen bg-sx-black" />;

const loadApply = () => import("./pages/apply");
const ApplyPage = lazy(loadApply);
const AdminPage = lazy(() => import("./pages/admin"));
const ServePage = lazy(() => import("./pages/serve"));
const SignInPage = lazy(() => import("./pages/sign-in"));
const PortalPage = lazy(() => import("./pages/portal"));
const StaffRouter = lazy(() => import("./pages/staff/router"));

// Warm the application chunk once the landing page is idle, so tapping a CTA is instant.
if (typeof window !== "undefined") {
  const warm = () => void loadApply();
  if ("requestIdleCallback" in window) window.requestIdleCallback(warm, { timeout: 4000 });
  else setTimeout(warm, 2500);
}

// Capture attribution synchronously at boot, BEFORE any route renders or
// redirects, so ?ref= / ?event= / ?campaign= / utm_* / /r/:code are never lost.
const boot = captureAttribution();
if (boot.isReferralVisit)
  track("referral_visit", { ref: boot.attribution.referralCode ?? "", path: window.location.pathname }, { once: boot.attribution.referralCode ?? "ref" });
if (boot.isQrVisit)
  track("qr_visit", { qr: boot.attribution.qrCampaign ?? "", event: boot.attribution.eventId ?? "" }, { once: boot.attribution.qrCampaign ?? "qr" });

/** /r/:code → /crew?ref=CODE (code already captured above). */
function ShortReferral() {
  const { code } = useParams<{ code: string }>();
  const q = new URLSearchParams(window.location.search);
  q.set("ref", code ?? "");
  return <Redirect to={`/crew?${q.toString()}`} replace />;
}

function App() {
  return (
    <Provider>
      <Switch>
        <Route path="/" component={CrewLanding} />
        <Route path="/crew" component={CrewLanding} />
        <Route path="/crew/apply">
          <Suspense fallback={<div className="min-h-screen bg-sx-black" />}>
            <ApplyPage />
          </Suspense>
        </Route>
        <Route path="/serve">
          <Suspense fallback={<div className="min-h-screen bg-sx-black" />}>
            <ServePage />
          </Suspense>
        </Route>
        <Route path="/r/:code" component={ShortReferral} />
        <Route path="/sign-in">
          <Suspense fallback={<Blank />}>
            <SignInPage />
          </Suspense>
        </Route>
        <Route path="/portal">
          <ProtectedRoute>
            <Suspense fallback={<Blank />}>
              <PortalPage />
            </Suspense>
          </ProtectedRoute>
        </Route>
        <Route path="/staff/*?">
          <ProtectedRoute>
            <Suspense fallback={<Blank />}>
              <StaffRouter />
            </Suspense>
          </ProtectedRoute>
        </Route>
        <Route path="/crew/admin">
          <Suspense fallback={<div className="min-h-screen bg-sx-black" />}>
            <AdminPage />
          </Suspense>
        </Route>
        <Route component={NotFound} />
      </Switch>
      {/* Do not remove — off by default, activated by parent iframe via postMessage */}
      {import.meta.env.DEV && <AgentFeedback />}
      {/* "Made with Runable" badge - if user asks to remove the runable badge, remove this code as well as comment */}
      {<RunableBadge />}
    </Provider>
  );
}

export default App;

import type { ReactNode } from "react";
import { Redirect } from "wouter";
import { authClient } from "../lib/auth";
import { Loading } from "./console/ui";

/** Signed-in gate. Authorization (staff scopes, own-only data) is enforced server-side on every call. */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { data: session, isPending, error, refetch } = authClient.useSession();
  if (isPending)
    return (
      <main id="main" className="min-h-[100svh] bg-sx-black px-5 pt-24">
        <Loading label="Checking your session…" />
      </main>
    );
  // A failed session read (rate limit, network, 5xx) is not "signed out": keep the
  // user's place and offer a retry instead of bouncing them to sign-in.
  if (!session && error && error.status !== 401) {
    return (
      <main id="main" className="min-h-[100svh] bg-sx-black px-5 pt-24 text-white">
        <div className="mx-auto max-w-md border border-white/15 p-6" role="alert">
          <p className="text-sm text-white/80">
            {error.status === 429 ? "Too many requests right now." : "We couldn't check your session."} Your sign-in is kept on this device.
          </p>
          <button type="button" onClick={() => refetch()} className="mt-4 min-h-11 border border-white/40 px-4 text-[12px] font-medium uppercase tracking-[0.16em] hover:border-white">
            Try again
          </button>
        </div>
      </main>
    );
  }
  if (!session) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    return <Redirect to={`/sign-in?next=${next}`} replace />;
  }
  return <>{children}</>;
}

import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { LogOut } from "lucide-react";
import { Wordmark } from "../crew/chrome";
import { signOut } from "../../lib/auth";
import { cn } from "../../lib/utils";
import { useMe } from "../../queries/session";
import { ErrorNote, Loading, StagingNote } from "./ui";

type Me = NonNullable<ReturnType<typeof useMe>["data"]>;
type SectionKey = keyof Me["sections"];

export const STAFF_NAV: { key: SectionKey; href: string; label: string }[] = [
  { key: "applicants", href: "/staff/applicants", label: "Applicants" },
  { key: "terms", href: "/staff/terms", label: "Terms & offers" },
  { key: "events", href: "/staff/events", label: "Events" },
  { key: "campaigns", href: "/staff/campaigns", label: "Campaigns" },
  { key: "serve", href: "/staff/serve", label: "Serve Team" },
  { key: "integration", href: "/staff/integration", label: "Integration" },
  { key: "staff", href: "/staff/access", label: "Staff access" },
];

async function doSignOut(navigate: (to: string) => void) {
  await signOut();
  navigate("/sign-in");
}

export function TopBar({ label, children }: { label: string; children?: ReactNode }) {
  const [, navigate] = useLocation();
  const me = useMe();
  return (
    <header className="no-print sticky top-0 z-30 border-b border-white/10 bg-sx-black/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between gap-3 px-4 sm:px-8">
        <div className="flex min-w-0 items-center gap-4">
          <Link href="/" aria-label="Sanctuary LV — public site" className="shrink-0">
            <Wordmark />
          </Link>
          <span className="eyebrow hidden truncate text-white/60 sm:inline">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          {children}
          {me.data && <span className="hidden max-w-[16ch] truncate text-sm text-white/70 md:inline">{me.data.user.name || me.data.user.email}</span>}
          <button
            type="button"
            onClick={() => void doSignOut(navigate)}
            className="inline-flex min-h-11 items-center gap-2 border border-white/30 px-3 text-[12px] uppercase tracking-[0.16em] hover:border-white"
          >
            <LogOut aria-hidden className="size-4" />
            <span className="hidden sm:inline">Sign out</span>
            <span className="sr-only sm:hidden">Sign out</span>
          </button>
        </div>
      </div>
    </header>
  );
}

/** Staff console frame: section nav from me.session().sections (hints only — the server re-checks). */
export function ConsoleShell({ children }: { children: ReactNode }) {
  const me = useMe();
  const [loc] = useLocation();
  if (me.isPending)
    return (
      <div className="min-h-[100svh] bg-sx-black">
        <TopBar label="Staff console" />
        <main id="main" className="mx-auto max-w-[1500px] px-4 sm:px-8">
          <Loading />
        </main>
      </div>
    );
  if (me.error || !me.data)
    return (
      <div className="min-h-[100svh] bg-sx-black">
        <TopBar label="Staff console" />
        <main id="main" className="mx-auto max-w-3xl px-4 py-10 sm:px-8">
          <ErrorNote error={me.error} />
        </main>
      </div>
    );
  if (!me.data.isStaff)
    return (
      <div className="min-h-[100svh] bg-sx-black">
        <TopBar label="Staff console" />
        <main id="main" className="mx-auto max-w-2xl px-4 py-16 sm:px-8">
          <h1 className="heading text-3xl">No staff access</h1>
          <p className="mt-4 text-white/75">
            This account has no staff role. Staff roles are granted individually by an administrator; signing in alone grants nothing.
          </p>
          <Link href="/portal" className="mt-8 inline-flex min-h-11 items-center bg-white px-5 text-[12px] font-medium uppercase tracking-[0.16em] text-sx-black">
            Go to my crew portal
          </Link>
        </main>
      </div>
    );
  const nav = STAFF_NAV.filter((n) => me.data.sections[n.key]);
  return (
    <div className="min-h-[100svh] bg-sx-black">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:bg-white focus:px-4 focus:py-2 focus:text-sx-black">
        Skip to content
      </a>
      <TopBar label="Staff console" />
      <nav aria-label="Staff sections" className="no-print sticky top-16 z-20 border-b border-white/10 bg-sx-black/95 backdrop-blur">
        <ul className="mx-auto flex max-w-[1500px] gap-1 overflow-x-auto px-2 sm:px-6">
          {nav.map((n) => {
            const active = loc.startsWith(n.href);
            return (
              <li key={n.href} className="shrink-0">
                <Link
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-12 items-center border-b-2 px-3 text-[12px] font-medium uppercase tracking-[0.14em]",
                    active ? "border-white text-white" : "border-transparent text-white/65 hover:text-white",
                  )}
                >
                  {n.label}
                </Link>
              </li>
            );
          })}
          <li className="shrink-0">
            <Link href="/portal" className="inline-flex min-h-12 items-center border-b-2 border-transparent px-3 text-[12px] font-medium uppercase tracking-[0.14em] text-white/65 hover:text-white">
              My portal
            </Link>
          </li>
        </ul>
      </nav>
      <main id="main" className="mx-auto max-w-[1500px] px-4 pb-24 pt-6 sm:px-8">
        <div className="no-print mb-6">
          <StagingNote mode={me.data.integration?.mode} reason={me.data.integration?.reason} />
        </div>
        {children}
      </main>
    </div>
  );
}

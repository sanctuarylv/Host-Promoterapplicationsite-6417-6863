import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { cn } from "../../lib/utils";
import { track } from "../../lib/analytics";
import { SOCIAL_LINKS } from "../../lib/site-config";
import { NONPROFIT_ENTITY, PAID_ENTITY } from "../../lib/pathways";
import { LegalLinks } from "./legal";

export type RoleChoice = "host" | "promoter" | "both";

export const applyHref = (role?: RoleChoice, entry?: string) => {
  const p = new URLSearchParams();
  if (role) p.set("role", role);
  if (entry) p.set("entry", entry);
  const q = p.toString();
  return `/crew/apply${q ? `?${q}` : ""}`;
};

/**
 * Wordmark slot. The official SANCTUARY wordmark must not be retyped
 * (Brand Bible: the cross in the T is the signature). Drop the supplied
 * SVG at /public/images/brand/wordmark-white.svg and set USE_LOGO_FILE.
 * Until then a plain text label is shown.
 */
const USE_LOGO_FILE = false;
export function Wordmark({ className }: { className?: string }) {
  if (USE_LOGO_FILE)
    return <img src="/images/brand/wordmark-white.svg" alt="Sanctuary LV" className={cn("h-4 w-auto", className)} />;
  return (
    <span className={cn("text-[13px] font-medium uppercase tracking-[0.32em]", className)}>
      Sanctuary <span className="text-white/60">LV</span>
    </span>
  );
}

export function Grain() {
  return <div aria-hidden className="grain" />;
}

type CtaProps = {
  href: string;
  children: React.ReactNode;
  variant?: "solid" | "outline" | "ghost" | "solid-dark";
  crewRole?: RoleChoice;
  entry: string;
  className?: string;
};

/** Primary CTA. Tracks role_selected on click when a role is attached. */
export function Cta({ href, children, variant = "solid", crewRole, entry, className }: CtaProps) {
  return (
    <Link
      href={href}
      onClick={() => crewRole && track("role_selected", { role: crewRole, entry })}
      className={cn(
        "group inline-flex min-h-14 items-center justify-between gap-6 px-6 text-[12px] font-medium uppercase tracking-[0.2em] transition-[background-color,color,border-color] duration-300 ease-[var(--ease-cine)] sm:min-h-16 sm:px-7",
        variant === "solid" && "bg-white text-sx-black hover:bg-sx-gray",
        variant === "solid-dark" && "bg-sx-black text-white hover:bg-sx-ink",
        variant === "outline" && "border border-white/40 text-white hover:border-white hover:bg-white hover:text-sx-black",
        variant === "ghost" && "min-h-12 px-0 text-white/80 underline-offset-8 hover:text-white hover:underline sm:min-h-12 sm:px-0",
        className,
      )}
    >
      <span>{children}</span>
      <ArrowRight
        aria-hidden
        className="size-4 shrink-0 transition-transform duration-300 ease-[var(--ease-cine)] group-hover:translate-x-1"
        strokeWidth={1.5}
      />
    </Link>
  );
}

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 40);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-[background-color,backdrop-filter,border-color] duration-500",
        scrolled ? "border-b border-white/10 bg-sx-black/80 backdrop-blur-md" : "border-b border-transparent",
      )}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:bg-white focus:px-4 focus:py-2 focus:text-sx-black"
      >
        Skip to content
      </a>
      <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between px-5 sm:px-8 lg:px-12">
        <Link href="/crew" aria-label="Sanctuary LV — Host + Promoter Team home">
          <Wordmark />
        </Link>
        <nav aria-label="Primary" className="flex items-center gap-6">
          <a href="#roles" className="eyebrow hidden text-white/70 hover:text-white md:inline">
            Roles
          </a>
          <a href="#path" className="eyebrow hidden text-white/70 hover:text-white md:inline">
            The Path
          </a>
          <Link href="/serve" className="eyebrow hidden text-white/70 hover:text-white md:inline">
            Serve Team
          </Link>
          <Link
            href={applyHref(undefined, "header")}
            className="eyebrow inline-flex min-h-11 items-center border border-white/40 px-4 text-white transition-colors hover:bg-white hover:text-sx-black"
          >
            Apply
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function FollowLinks({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const anyLive = SOCIAL_LINKS.some((s) => s.url);
  return (
    <div>
      <ul className="flex flex-wrap gap-x-8 gap-y-3">
        {SOCIAL_LINKS.map((s) =>
          s.url ? (
            <li key={s.key}>
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "eyebrow inline-flex min-h-11 items-center gap-2 hover:underline underline-offset-8",
                  tone === "dark" ? "text-white" : "text-sx-black",
                )}
              >
                {s.label}
                <ArrowUpRight aria-hidden className="size-3.5" strokeWidth={1.5} />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </li>
          ) : (
            <li key={s.key}>
              <span
                className={cn(
                  "eyebrow inline-flex min-h-11 items-center gap-2",
                  tone === "dark" ? "text-white/60" : "text-sx-black/65",
                )}
              >
                {s.label}
                <span className="sr-only">— official link coming soon</span>
              </span>
            </li>
          ),
        )}
      </ul>
      {!anyLive && (
        <p className={cn("mt-2 text-xs", tone === "dark" ? "text-white/60" : "text-sx-black/65")}>
          Official Sanctuary LV channels will be linked here.
        </p>
      )}
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-sx-black">
      <div className="mx-auto grid max-w-[1600px] gap-12 px-5 py-16 sm:px-8 md:grid-cols-[1.2fr_1fr] lg:px-12 lg:py-20">
        <div>
          <Wordmark />
          <p className="mt-6 max-w-sm text-[15px] leading-relaxed text-white/60">A new kind of sanctuary for Las Vegas.</p>
        </div>
        <div className="space-y-6">
          <p className="eyebrow text-white/60">Follow Sanctuary LV</p>
          <FollowLinks />
        </div>
      </div>
      <div className="mx-auto flex max-w-[1600px] flex-col gap-3 border-t border-white/10 px-5 py-6 text-xs text-white/60 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12">
        <div className="space-y-1">
          <p>© {new Date().getFullYear()} Sanctuary LV · Las Vegas, Nevada</p>
          <p data-testid="operator-note">
            Paid Host, Promoter and event-crew opportunities: {PAID_ENTITY}. Volunteer / Serve Team: {NONPROFIT_ENTITY}.
          </p>
        </div>
        <LegalLinks keys={["privacy", "terms", "retention"]} />
      </div>
    </footer>
  );
}

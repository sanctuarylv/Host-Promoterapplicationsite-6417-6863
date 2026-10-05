import { EVENT_CONTENT, OPPORTUNITY_STATUS, PAID_ENTITY, PATHWAY_NOTICE, REVIEW_BASIS } from "../../lib/pathways";
import { useEffect, useRef, useState } from "react";
import { ArrowDown, Plus, Minus } from "lucide-react";
import { Cta, applyHref } from "./chrome";
import { cn } from "../../lib/utils";
import { Link } from "wouter";

/* ------------------------------------------------------------------ */
/* HERO                                                                 */
/* ------------------------------------------------------------------ */
export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative isolate flex min-h-[100svh] flex-col overflow-hidden">
      <div aria-hidden className="absolute inset-0 -z-10">
        <picture>
          <source media="(max-width: 767px)" srcSet="/images/crew/hero-sm.webp" />
          <img
            src="/images/crew/hero.webp"
            alt=""
            fetchPriority="high"
            decoding="async"
            className="h-full w-full animate-[var(--animate-kenburns)] object-cover object-[60%_40%]"
          />
        </picture>
        <div className="absolute inset-0 bg-gradient-to-b from-sx-black/70 via-sx-black/35 to-sx-black" />
        <div className="absolute inset-0 bg-gradient-to-r from-sx-black/70 via-transparent to-transparent" />
      </div>

      <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col justify-end px-5 pb-10 pt-28 sm:px-8 sm:pb-14 lg:px-12 lg:pb-16">
        <p className="eyebrow rise text-white/70" style={{ "--d": 100 } as React.CSSProperties}>
          Sanctuary LV — Host + Promoter Team <span aria-hidden>·</span> {OPPORTUNITY_STATUS}
        </p>

        <h1 id="hero-title" className="display mt-6 text-[clamp(3.1rem,13.5vw,11.5rem)]">
          <span className="rise block" style={{ "--d": 200 } as React.CSSProperties}>
            Don't just
          </span>
          <span className="rise block" style={{ "--d": 320 } as React.CSSProperties}>
            attend.
          </span>
          <span className="rise block text-white/60" style={{ "--d": 460 } as React.CSSProperties}>
            Help build it.
          </span>
        </h1>

        <div className="mt-10 grid gap-10 lg:mt-14 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <p
            className="rise max-w-[34rem] text-[17px] font-light leading-relaxed text-white/80 sm:text-lg"
            style={{ "--d": 620 } as React.CSSProperties}
          >
            Sanctuary LV is building a community of Hosts and Promoters who help create unforgettable experiences and
            bring people into the room. Paid Host and Promoter opportunities are operated by {PAID_ENTITY}.
          </p>

          <div className="rise flex flex-col gap-3 sm:w-auto" style={{ "--d": 760 } as React.CSSProperties}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Cta href={applyHref("host", "hero")} crewRole="host" entry="hero" className="sm:min-w-64">
                Become a Host
              </Cta>
              <Cta href={applyHref("promoter", "hero")} crewRole="promoter" entry="hero" variant="outline" className="sm:min-w-64">
                Become a Promoter
              </Cta>
            </div>
            <Cta href={applyHref("both", "hero")} crewRole="both" entry="hero" variant="ghost" className="self-start">
              I'm interested in both
            </Cta>
          </div>
        </div>

        <div className="fade-in mt-12 flex items-center justify-between gap-6 border-t border-white/15 pt-5" style={{ "--d": 1000 } as React.CSSProperties}>
          <p className="eyebrow text-[10px] text-white/60 sm:text-[11px]">
            Las Vegas <span aria-hidden>•</span> Sanctuary Events <span aria-hidden>•</span> Community{" "}
            <span aria-hidden>•</span> Culture <span aria-hidden>•</span> Purpose
          </p>
          <a href="#roles" aria-label="Scroll to roles" className="hidden size-11 shrink-0 items-center justify-center border border-white/25 text-white/70 hover:text-white sm:inline-flex">
            <ArrowDown className="size-4" strokeWidth={1.5} />
          </a>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* MARQUEE                                                              */
/* ------------------------------------------------------------------ */
const STATEMENTS = ["Create the experience", "Build the room", "Welcome them in", "Bring someone", "Help build Sanctuary"];
export function Marquee() {
  const row = (hidden: boolean) => (
    <ul aria-hidden={hidden || undefined} className="flex shrink-0 items-center">
      {STATEMENTS.map((s) => (
        <li key={s} className="flex items-center">
          <span className="heading whitespace-nowrap px-6 text-[clamp(1.75rem,5vw,4rem)] sm:px-10">{s}</span>
          <span aria-hidden className="block size-2 rounded-full bg-white/40" />
        </li>
      ))}
    </ul>
  );
  return (
    <div className="overflow-hidden border-y border-white/10 bg-sx-black py-6 sm:py-8">
      <p className="sr-only">{STATEMENTS.join(". ")}.</p>
      <div className="marquee-track" aria-hidden>
        {row(true)}
        {row(true)}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* CHOOSE YOUR ROLE                                                     */
/* ------------------------------------------------------------------ */
const HOST_DUTIES = [
  "Welcoming guests",
  "Check-in",
  "Guest experience",
  "Hospitality",
  "Seating",
  "VIP care",
  "Connection",
  "Helping first-time guests",
  "Event flow",
  "Guest follow-up",
  "Directing guests toward Sanctuary resources",
];
const PROMOTER_DUTIES = [
  "Personal invitations",
  "Social sharing",
  "Event promotion",
  "Referral links",
  "QR campaigns",
  "Community outreach",
  "Hospitality / nightlife outreach",
  "Campus outreach",
  "Creative-community outreach",
  "Group invitations",
];

function RolePanel(props: {
  tone: "light" | "dark";
  index: string;
  label: string;
  headline: string;
  copy: string[];
  duties: string[];
  image: string;
  imageSm: string;
  imageAlt: string;
  crewRole: "host" | "promoter";
  cta: string;
}) {
  const light = props.tone === "light";
  return (
    <article
      aria-labelledby={`role-${props.crewRole}`}
      className={cn("group relative flex flex-col", light ? "on-light bg-sx-off text-sx-black" : "bg-sx-ink text-white")}
    >
      <div className="@container relative aspect-[4/5] overflow-hidden sm:aspect-[16/11] lg:aspect-[4/3]">
        <picture>
          <source media="(max-width: 767px)" srcSet={props.imageSm} />
          <img
            src={props.image}
            alt={props.imageAlt}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-[1.6s] ease-[var(--ease-cine)] group-hover:scale-[1.04]"
          />
        </picture>
        <div className={cn("absolute inset-0 bg-gradient-to-t", light ? "from-sx-off via-sx-off/0" : "from-sx-ink via-sx-ink/0")} />
        <span
          aria-hidden
          className={cn(
            "display absolute -bottom-[0.12em] left-4 text-[min(16.5cqw,15rem)] sm:left-8",
            light ? "text-sx-black" : "text-white",
          )}
        >
          {props.label}
        </span>
      </div>

      <div className="flex flex-1 flex-col px-5 pb-10 pt-8 sm:px-8 sm:pb-12 lg:px-12 lg:pb-14">
        <div className="flex items-baseline justify-between border-b pb-4 rule">
          <p className="eyebrow">
            {props.index} — {props.label}
          </p>
          <p className={cn("eyebrow", light ? "text-sx-black/65" : "text-white/60")}>
            {props.crewRole === "host" ? "Experience" : "Momentum"}
          </p>
        </div>
        <h3 id={`role-${props.crewRole}`} className="heading mt-8 text-[clamp(2.25rem,6vw,4.25rem)]">
          {props.headline}
        </h3>
        <p className={cn("eyebrow mt-4", light ? "text-sx-black/65" : "text-white/60")}>
          Operated by {PAID_ENTITY} · {OPPORTUNITY_STATUS}
        </p>
        <div className={cn("mt-6 max-w-lg space-y-3 text-[16px] font-light leading-relaxed sm:text-[17px]", light ? "text-sx-black/75" : "text-white/75")}>
          {props.copy.map((c) => (
            <p key={c}>{c}</p>
          ))}
        </div>

        <p className={cn("eyebrow mt-10", light ? "text-sx-black/65" : "text-white/60")}>Responsibilities may include</p>
        <ul className="mt-4 grid grid-cols-1 border-t rule sm:grid-cols-2 sm:gap-x-8">
          {props.duties.map((d) => (
            <li key={d} className="flex items-center gap-3 border-b py-3 text-[15px] rule">
              <span aria-hidden className={cn("block h-px w-3", light ? "bg-sx-black/50" : "bg-white/50")} />
              {d}
            </li>
          ))}
        </ul>

        <div className="mt-10 flex-1" />
        <Cta
          href={applyHref(props.crewRole, "role_section")}
          crewRole={props.crewRole}
          entry="role_section"
          variant={light ? "solid-dark" : "solid"}
          className="w-full sm:w-auto sm:self-start sm:min-w-72"
        >
          {props.cta}
        </Cta>
      </div>
    </article>
  );
}

export function ChooseRole() {
  return (
    <section id="roles" aria-labelledby="roles-title" className="bg-sx-black">
      <div className="mx-auto max-w-[1600px] px-5 pb-12 pt-20 sm:px-8 sm:pt-28 lg:px-12 lg:pt-36">
        <div data-reveal className="grid gap-6 lg:grid-cols-[1fr_1fr] lg:items-end">
          <div>
            <p className="eyebrow text-white/60">01 — Choose your role</p>
            <h2 id="roles-title" className="heading mt-6 text-[clamp(2.5rem,9vw,7rem)]">
              Two ways
              <br />
              <span className="text-white/60">in.</span>
            </h2>
          </div>
          <p className="max-w-md text-[17px] font-light leading-relaxed text-white/70 lg:justify-self-end">
            One team creates the experience. The other fills the room. Pick the one that sounds like you — or raise your
            hand for both.
          </p>
        </div>
      </div>
      <div className="mx-auto grid max-w-[1600px] gap-px bg-white/10 lg:grid-cols-2">
        <RolePanel
          tone="light"
          index="A"
          label="Host"
          crewRole="host"
          headline="Create the experience."
          copy={[
            "Hosts are the people who make Sanctuary feel like Sanctuary.",
            "They create the atmosphere from the moment someone arrives.",
          ]}
          duties={HOST_DUTIES}
          image="/images/crew/host.webp"
          imageSm="/images/crew/host-sm.webp"
          imageAlt="A host smiling and greeting an arriving guest at the door, tablet in hand."
          cta="Become a Host"
        />
        <RolePanel
          tone="dark"
          index="B"
          label="Promoter"
          crewRole="promoter"
          headline="Build the room."
          copy={[
            "Promoters help people discover Sanctuary and get them into the room.",
            "Promoters use relationships, social media, personal invitations and community connections to build momentum around Sanctuary events.",
          ]}
          duties={PROMOTER_DUTIES}
          image="/images/crew/promoter.webp"
          imageSm="/images/crew/promoter-sm.webp"
          imageAlt="A young man showing two friends something on his phone on a city street at night."
          cta="Become a Promoter"
        />
      </div>
      <div className="mx-auto flex max-w-[1600px] flex-col items-start gap-4 px-5 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12">
        <p className="text-[15px] text-white/60">Can't pick? Plenty of people do both.</p>
        <Cta href={applyHref("both", "role_section")} crewRole="both" entry="role_section" variant="ghost">
          I'm interested in both
        </Cta>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* LEAD ROLES + SERVE TEAM                                              */
/* ------------------------------------------------------------------ */
const LEADS = [
  {
    role: "guest_experience_lead",
    title: "Guest Experience Lead",
    body: "Leads the Host team on the night: briefings, guest flow, VIP and first-time guest care, and handoffs to Operations.",
  },
  {
    role: "promoter_manager",
    title: "Promoter Manager",
    body: "Coordinates Promoters: outreach plans, approved links and codes, accurate tracking and follow-through.",
  },
] as const;

export function Pathways() {
  return (
    <section id="pathways" aria-labelledby="pathways-title" className="border-t border-white/10 bg-sx-black">
      <div className="mx-auto max-w-[1600px] px-5 py-20 sm:px-8 sm:py-24 lg:px-12">
        <div className="flex flex-wrap items-center gap-4">
          <p className="eyebrow text-white/60">02 — Lead roles + Serve Team</p>
          <span className="eyebrow border border-white/25 px-2 py-1 text-[10px] text-white/60">{OPPORTUNITY_STATUS}</span>
        </div>
        <h2 id="pathways-title" className="heading mt-6 text-[clamp(2.25rem,6vw,4.5rem)]">
          Lead the team.
          <br />
          <span className="text-white/60">Or serve with us.</span>
        </h2>
        <div className="mt-12 grid gap-px bg-white/10 lg:grid-cols-3">
          {LEADS.map((l) => (
            <article key={l.role} aria-labelledby={`lead-${l.role}`} className="flex flex-col bg-sx-ink p-6 sm:p-8">
              <p className="eyebrow text-white/60">Operated by {PAID_ENTITY}</p>
              <h3 id={`lead-${l.role}`} className="heading mt-6 text-[clamp(1.6rem,3vw,2.4rem)]">
                {l.title}
              </h3>
              <p className="mt-4 flex-1 text-[15px] font-light leading-relaxed text-white/70">{l.body}</p>
              <Link
                href={`/crew/apply?role=${l.role}&entry=role_section`}
                className="eyebrow mt-8 inline-flex min-h-12 items-center self-start border border-white/40 px-5 text-white transition-colors hover:bg-white hover:text-sx-black"
              >
                Register interest
              </Link>
            </article>
          ))}
          <article aria-labelledby="serve-card" className="on-light flex flex-col bg-sx-off p-6 text-sx-black sm:p-8">
            <p className="eyebrow text-sx-black/65">Sanctuary LV nonprofit · unpaid</p>
            <h3 id="serve-card" className="heading mt-6 text-[clamp(1.6rem,3vw,2.4rem)]">
              Volunteer / Serve Team
            </h3>
            <p className="mt-4 flex-1 text-[15px] font-light leading-relaxed text-sx-black/75">
              A separate, unpaid pathway with its own sign-up, consent and review — not part of the paid Host and Promoter
              application.
            </p>
            <Link
              href="/serve"
              className="eyebrow mt-8 inline-flex min-h-12 items-center self-start bg-sx-black px-5 text-white transition-colors hover:bg-sx-ink"
            >
              Serve Team sign-up
            </Link>
          </article>
        </div>
        <p className="mt-8 max-w-3xl text-sm leading-relaxed text-white/65">
          {EVENT_CONTENT} {REVIEW_BASIS}
        </p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* PROMOTER CHALLENGE                                                   */
/* ------------------------------------------------------------------ */
function TenCounter() {
  const ref = useRef<HTMLDivElement>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setN(10);
      return;
    }
    let timer: number | undefined;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          io.disconnect();
          let i = 0;
          timer = window.setInterval(() => {
            i += 1;
            setN(i);
            if (i >= 10) window.clearInterval(timer);
          }, 140);
        }
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (timer) window.clearInterval(timer);
    };
  }, []);
  return (
    <div ref={ref} aria-hidden className="flex items-center gap-2 sm:gap-3">
      {Array.from({ length: 10 }, (_, i) => (
        <span
          key={i}
          className={cn(
            "block size-4 rounded-full border border-white transition-[background-color,transform] duration-500 ease-[var(--ease-cine)] sm:size-5",
            i < n ? "scale-100 bg-white" : "scale-75 bg-transparent",
          )}
        />
      ))}
      <span className="ml-3 font-light tabular-nums text-white/70">{String(n).padStart(2, "0")} / 10</span>
    </div>
  );
}

export function PromoterChallenge() {
  return (
    <section aria-labelledby="challenge-title" className="relative isolate overflow-hidden bg-sx-black">
      <div aria-hidden className="absolute inset-0 -z-10">
        <picture>
          <source media="(max-width: 767px)" srcSet="/images/crew/ten-sm.webp" />
          <img src="/images/crew/ten.webp" alt="" loading="lazy" decoding="async" className="h-full w-full object-cover opacity-55" />
        </picture>
        <div className="absolute inset-0 bg-gradient-to-b from-sx-black via-sx-black/50 to-sx-black" />
      </div>
      <div className="mx-auto max-w-[1600px] px-5 py-24 sm:px-8 sm:py-32 lg:px-12 lg:py-44">
        <p data-reveal className="eyebrow text-white/60">
          03 — The Promoter Challenge
        </p>
        <h2 id="challenge-title" data-reveal style={{ "--d": 80 } as React.CSSProperties} className="display mt-8 text-[clamp(3rem,12vw,10rem)]">
          Can you
          <br />
          bring <span className="text-white/60">10</span>
          <br />
          people?
        </h2>
        <div data-reveal style={{ "--d": 160 } as React.CSSProperties} className="mt-10">
          <TenCounter />
        </div>
        <div className="mt-14 grid gap-12 lg:grid-cols-[minmax(0,34rem)_1fr] lg:items-end">
          <div data-reveal style={{ "--d": 200 } as React.CSSProperties} className="space-y-4 text-[17px] font-light leading-relaxed text-white/80 sm:text-lg">
            <p>Maybe you're the person who always knows what's happening.</p>
            <p>Maybe people trust your recommendations.</p>
            <p>Maybe you're naturally a connector.</p>
            <p className="text-white">Put that influence to work.</p>
          </div>
          <div data-reveal style={{ "--d": 280 } as React.CSSProperties} className="lg:justify-self-end">
            <p className="heading text-[clamp(1.4rem,3vw,2.25rem)] leading-tight">
              Bring people. Build community.
              <br />
              Help build Sanctuary.
            </p>
            <Cta href={applyHref("promoter", "challenge")} crewRole="promoter" entry="challenge" className="mt-8 w-full sm:w-auto sm:min-w-72">
              Take the challenge
            </Cta>
            <p className="mt-4 max-w-sm text-xs leading-relaxed text-white/60">
              The challenge is optional and about community, not compensation. It isn't a selection requirement and doesn't
              create a paid position.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* WHY JOIN                                                             */
/* ------------------------------------------------------------------ */
const BENEFITS = [
  ["Belong", "Become part of the Sanctuary community."],
  ["Meet builders", "Meet creatives, leaders and builders across Las Vegas."],
  ["Go behind the scenes", "Get behind-the-scenes event experience."],
  ["Learn the craft", "Develop hospitality and event skills."],
  ["Make it matter", "Help create meaningful experiences for every guest."],
  ["Gather as a team", "Be invited into team gatherings."],
  ["Show up in the city", "Participate in Sanctuary activations."],
  ["Build relationships", "Build real relationships that outlast the night."],
  ["Grow as a leader", "Develop leadership opportunities as you grow."],
  ["Shape the culture", "Help shape what Sanctuary becomes."],
] as const;

export function WhyJoin() {
  return (
    <section aria-labelledby="why-title" className="on-light bg-sx-off text-sx-black">
      <div className="mx-auto max-w-[1600px] px-5 py-20 sm:px-8 sm:py-28 lg:px-12 lg:py-36">
        <div className="grid gap-12 lg:grid-cols-[5fr_7fr] lg:gap-20">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <p data-reveal className="eyebrow text-sx-black/65">
              04 — Why join
            </p>
            <h2 id="why-title" data-reveal style={{ "--d": 80 } as React.CSSProperties} className="heading mt-6 text-[clamp(2.5rem,8vw,6rem)]">
              More than
              <br />a shift.
            </h2>
            <figure data-reveal style={{ "--d": 160 } as React.CSSProperties} className="mt-10 overflow-hidden">
              <img
                src="/images/crew/backstage-sm.webp"
                srcSet="/images/crew/backstage-sm.webp 900w, /images/crew/backstage.webp 1536w"
                sizes="(min-width: 1024px) 40vw, 100vw"
                alt="Two crew members working together at a lighting console backstage."
                loading="lazy"
                decoding="async"
                className="aspect-[3/2] w-full object-cover"
              />
            </figure>
          </div>
          <div>
            <ol className="border-t rule">
              {BENEFITS.map(([title, body], i) => (
                <li
                  key={title}
                  data-reveal
                  style={{ "--d": (i % 4) * 60 } as React.CSSProperties}
                  className="grid grid-cols-[3rem_1fr] gap-4 border-b py-6 rule sm:grid-cols-[4rem_1fr_1.2fr] sm:items-baseline sm:gap-6 sm:py-7"
                >
                  <span className="text-sm tabular-nums text-sx-black/65">{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="text-xl font-medium tracking-tight sm:text-2xl">{title}</h3>
                  <p className="col-start-2 text-[15px] font-light leading-relaxed text-sx-black/65 sm:col-start-3">{body}</p>
                </li>
              ))}
            </ol>
            <p className="mt-8 max-w-xl text-xs leading-relaxed text-sx-black/65">
              {PATHWAY_NOTICE}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* PROMOTER PROGRESSION                                                 */
/* ------------------------------------------------------------------ */
const TIERS = [
  { name: "Starter", body: "Join the promoter team.", tag: null },
  { name: "Promoter", body: "Begin generating event registrations.", tag: null },
  { name: "Ambassador", body: "Demonstrate consistent participation and attendance generation.", tag: null },
  { name: "Lead Promoter", body: "Help coordinate promoter activity for major events.", tag: null },
  { name: "City Lead", body: "Potential future leadership opportunity for qualified team members.", tag: "Future vision" },
] as const;

export function Progression() {
  return (
    <section id="path" aria-labelledby="path-title" className="bg-sx-black">
      <div className="mx-auto max-w-[1600px] px-5 py-20 sm:px-8 sm:py-28 lg:px-12 lg:py-36">
        <div className="grid gap-6 lg:grid-cols-2 lg:items-end">
          <div>
            <div data-reveal className="flex flex-wrap items-center gap-4">
              <p className="eyebrow text-white/60">05 — The promoter path</p>
              <span className="eyebrow border border-white/25 px-2 py-1 text-[10px] text-white/60">In development</span>
            </div>
            <h2 id="path-title" data-reveal style={{ "--d": 80 } as React.CSSProperties} className="heading mt-6 text-[clamp(2.5rem,9vw,7rem)]">
              Start here.
              <br />
              <span className="text-white/60">Grow from here.</span>
            </h2>
          </div>
          <p data-reveal style={{ "--d": 160 } as React.CSSProperties} className="max-w-md text-[17px] font-light leading-relaxed text-white/70 lg:justify-self-end">
            A clear path for promoters who show up consistently. Advancement is based on Sanctuary approval and performance —
            it is never automatic.
          </p>
        </div>

        <ol className="relative mt-16 grid gap-px bg-white/10 sm:grid-cols-2 lg:mt-24 lg:grid-cols-5">
          {TIERS.map((t, i) => (
            <li
              key={t.name}
              data-reveal
              style={{ "--d": i * 90 } as React.CSSProperties}
              className={cn("@container relative flex min-h-56 flex-col bg-sx-black p-6 sm:p-8 lg:min-h-80 lg:p-6 xl:p-8", i === 4 && "sm:col-span-2 lg:col-span-1")}
            >
              <div className="flex items-center gap-3">
                <span className="text-sm tabular-nums text-white/60">{String(i + 1).padStart(2, "0")}</span>
                <span aria-hidden className="h-px flex-1 bg-white/15">
                  <span className="block h-px bg-white" style={{ width: `${((i + 1) / TIERS.length) * 100}%` }} />
                </span>
              </div>
              <h3 className="heading mt-10 text-[clamp(1.375rem,14.5cqw,2.6rem)] lg:mt-20">{t.name}</h3>
              <p className="mt-4 text-[15px] font-light leading-relaxed text-white/65">{t.body}</p>
              {t.tag && (
                <span className="eyebrow mt-5 self-start border border-white/25 px-2 py-1 text-[10px] text-white/60">{t.tag}</span>
              )}
            </li>
          ))}
        </ol>
        <p className="mt-8 max-w-2xl text-xs leading-relaxed text-white/60">
          Tiers describe how participation may be recognized over time. Movement between tiers is at Sanctuary's discretion,
          based on approval and performance, and does not by itself create compensation or employment.
        </p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* GOOD TO KNOW                                                         */
/* ------------------------------------------------------------------ */
const FAQ = [
  [
    "Is this a paid role?",
    `${PATHWAY_NOTICE} No paid openings, pay rates or event dates are confirmed yet — right now we're gathering candidate interest.`,
  ],
  [
    "What happens at a Sanctuary night?",
    `${EVENT_CONTENT} Team members help guests feel welcome throughout the night. ${REVIEW_BASIS}`,
  ],
  [
    "I'd rather volunteer. Where do I go?",
    "The Sanctuary LV nonprofit Volunteer / Serve Team is unpaid and separate from the paid Host and Promoter pathway, with its own sign-up and review. Use the Serve Team link on this page.",
  ],
  [
    "Do I have to come to every event?",
    "No. The application asks how often you could realistically participate — from most events to event-specific only.",
  ],
  ["Do I need experience?", "No event experience is needed to apply. Tell us how you connect with people and what draws you in."],
  [
    "What happens after I apply?",
    "Our team reviews applications and reaches out with next steps if there's a fit. Applying doesn't guarantee selection or an event assignment, and we don't send automatic confirmation emails.",
  ],
] as const;

export function GoodToKnow() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section aria-labelledby="faq-title" className="on-light bg-sx-off text-sx-black">
      <div className="mx-auto grid max-w-[1600px] gap-10 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-[5fr_7fr] lg:gap-20 lg:px-12">
        <div>
          <p className="eyebrow text-sx-black/65">06 — Good to know</p>
          <h2 id="faq-title" className="heading mt-6 text-[clamp(2.25rem,6vw,4.5rem)]">
            Straight
            <br />
            answers.
          </h2>
        </div>
        <ul className="border-t rule">
          {FAQ.map(([q, a], i) => {
            const isOpen = open === i;
            return (
              <li key={q} className="border-b rule">
                <h3>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={`faq-${i}`}
                    id={`faq-btn-${i}`}
                    onClick={() => setOpen(isOpen ? null : i)}
                    className="flex min-h-16 w-full items-center justify-between gap-6 py-5 text-left text-lg font-medium tracking-tight sm:text-xl"
                  >
                    {q}
                    {isOpen ? (
                      <Minus aria-hidden className="size-5 shrink-0" strokeWidth={1.5} />
                    ) : (
                      <Plus aria-hidden className="size-5 shrink-0" strokeWidth={1.5} />
                    )}
                  </button>
                </h3>
                <div
                  id={`faq-${i}`}
                  aria-labelledby={`faq-btn-${i}`}
                  hidden={!isOpen}
                  className="max-w-2xl pb-6 text-[16px] font-light leading-relaxed text-sx-black/70"
                >
                  {a}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* FINAL CTA                                                            */
/* ------------------------------------------------------------------ */
export function FinalCta() {
  return (
    <section aria-labelledby="final-title" className="relative isolate overflow-hidden bg-sx-black">
      <div aria-hidden className="absolute inset-0 -z-10">
        <picture>
          <source media="(max-width: 767px)" srcSet="/images/crew/room-sm.webp" />
          <img src="/images/crew/room.webp" alt="" loading="lazy" decoding="async" className="h-full w-full object-cover opacity-60" />
        </picture>
        <div className="absolute inset-0 bg-gradient-to-t from-sx-black via-sx-black/40 to-sx-black" />
      </div>
      <div className="mx-auto max-w-[1600px] px-5 py-28 sm:px-8 sm:py-36 lg:px-12 lg:py-48">
        <p data-reveal className="eyebrow text-white/60">
          Your move
        </p>
        <h2 id="final-title" data-reveal style={{ "--d": 80 } as React.CSSProperties} className="display mt-8 max-w-[14ch] text-[clamp(3rem,11vw,9.5rem)]">
          Help build the room.
        </h2>
        <div data-reveal style={{ "--d": 200 } as React.CSSProperties} className="mt-12 grid gap-3 sm:max-w-2xl sm:grid-cols-2">
          <Cta href={applyHref("host", "final")} crewRole="host" entry="final">
            Become a Host
          </Cta>
          <Cta href={applyHref("promoter", "final")} crewRole="promoter" entry="final" variant="outline">
            Become a Promoter
          </Cta>
        </div>
        <div data-reveal style={{ "--d": 260 } as React.CSSProperties} className="mt-3">
          <Cta href={applyHref("both", "final")} crewRole="both" entry="final" variant="ghost">
            I'm interested in both
          </Cta>
        </div>
      </div>
    </section>
  );
}

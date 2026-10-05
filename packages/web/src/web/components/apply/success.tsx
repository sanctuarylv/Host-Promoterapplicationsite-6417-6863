import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, Share2, Check } from "lucide-react";
import { FollowLinks, Wordmark } from "../crew/chrome";
import { OPPORTUNITY_STATUS, PATHWAY_NOTICE } from "../../lib/pathways";

const NEXT = [
  ["Application review", "Our team reads every application."],
  ["Screen", "If there's a fit, someone from Sanctuary LV Group reaches out to schedule a short conversation."],
  ["Assessment", "A practical, role-related exercise. Nothing involving your real contacts."],
  ["Written terms", "Any paid opportunity comes with written compensation, duties and schedule before you accept."],
  ["Training + assignment", "Only after acceptance and training are you placed on an event."],
] as const;

export function SuccessScreen({ firstName }: { firstName: string }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [shared, setShared] = useState(false);

  useEffect(() => {
    headingRef.current?.focus();
    window.scrollTo({ top: 0 });
  }, []);

  const share = async () => {
    const url = `${window.location.origin}/crew`;
    const data = { title: "Join the Sanctuary LV Host + Promoter Team", text: "Don't just attend Sanctuary. Help build it.", url };
    try {
      if (navigator.share) await navigator.share(data);
      else {
        await navigator.clipboard.writeText(url);
        setShared(true);
      }
    } catch {
      /* user cancelled */
    }
  };

  return (
    <main id="main" className="relative isolate min-h-[100svh] overflow-hidden bg-sx-black">
      <div aria-hidden className="absolute inset-0 -z-10">
        <img src="/images/crew/huddle.webp" alt="" className="fade-in h-full w-full object-cover opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-b from-sx-black/60 via-sx-black/85 to-sx-black" />
      </div>

      <div className="mx-auto flex h-16 max-w-[1600px] items-center px-5 sm:px-8 lg:px-12">
        <Link href="/crew" aria-label="Back to Sanctuary LV crew page">
          <Wordmark />
        </Link>
      </div>

      <div className="mx-auto max-w-[1600px] px-5 pb-20 pt-10 sm:px-8 sm:pt-16 lg:px-12 lg:pt-24">
        <svg aria-hidden viewBox="0 0 96 96" className="size-16 sm:size-20">
          <circle cx="48" cy="48" r="46" fill="none" stroke="white" strokeOpacity="0.25" strokeWidth="1.5" />
          <circle
            cx="48"
            cy="48"
            r="46"
            fill="none"
            stroke="white"
            strokeWidth="1.5"
            strokeDasharray="290"
            style={{ "--len": 290, animation: "draw 1.4s var(--ease-cine) 0.2s both", transformOrigin: "center", transform: "rotate(-90deg)" } as React.CSSProperties}
          />
          <path
            d="M30 49 l12 12 l24 -26"
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeDasharray="60"
            style={{ "--len": 60, animation: "draw 0.7s var(--ease-cine) 1.2s both" } as React.CSSProperties}
          />
        </svg>

        <p className="eyebrow rise mt-10 text-white/60" style={{ "--d": 300 } as React.CSSProperties}>
          Application received{firstName ? ` — thank you, ${firstName}` : ""}
        </p>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="display rise mt-6 text-[clamp(3rem,12vw,10rem)] outline-none"
          style={{ "--d": 420 } as React.CSSProperties}
        >
          You're in the
          <br />
          pipeline.
        </h1>
        <div className="rise mt-10 max-w-xl space-y-4 text-[17px] font-light leading-relaxed text-white/80 sm:text-lg" style={{ "--d": 600 } as React.CSSProperties}>
          <p>Thanks for raising your hand to help build Sanctuary.</p>
          <p>Our team will review your application and contact you with next steps if there is a fit.</p>
          <p className="text-[15px] text-white/60">Applied before? You're already in the pipeline — there's no need to apply again.</p>
          <p className="text-[15px] text-white/60">
            {OPPORTUNITY_STATUS}. {PATHWAY_NOTICE}
          </p>
        </div>

        <section aria-labelledby="next-title" className="mt-20 sm:mt-28">
          <h2 id="next-title" className="eyebrow text-white/60">
            What happens next
          </h2>
          <ol className="mt-6 grid gap-px bg-white/10 sm:grid-cols-2 lg:grid-cols-5">
            {NEXT.map(([t, d], i) => (
              <li key={t} className="rise flex min-h-44 flex-col bg-sx-black/90 p-6 sm:p-7" style={{ "--d": 800 + i * 120 } as React.CSSProperties}>
                <span className="flex items-center gap-3 text-sm tabular-nums text-white/60">
                  {String(i + 1).padStart(2, "0")}
                  {i === 0 && (
                    <span className="eyebrow inline-flex items-center gap-1 text-[10px] text-white">
                      <Check aria-hidden className="size-3" /> Up next
                    </span>
                  )}
                </span>
                <h3 className="mt-auto pt-8 text-xl font-medium tracking-tight">{t}</h3>
                <p className="mt-2 text-sm font-light leading-relaxed text-white/60">{d}</p>
              </li>
            ))}
          </ol>
        </section>

        <div className="mt-20 grid gap-12 border-t border-white/15 pt-10 lg:grid-cols-2">
          <div>
            <h2 className="eyebrow text-white/60">Follow Sanctuary LV</h2>
            <div className="mt-4">
              <FollowLinks />
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
            <button
              type="button"
              onClick={share}
              className="inline-flex min-h-14 items-center justify-between gap-6 border border-white/40 px-6 text-[12px] font-medium uppercase tracking-[0.2em] transition-colors hover:bg-white hover:text-sx-black"
            >
              {shared ? "Link copied" : "Know someone? Share"}
              <Share2 aria-hidden className="size-4" strokeWidth={1.5} />
            </button>
            <Link
              href="/crew"
              className="inline-flex min-h-14 items-center justify-between gap-6 bg-white px-6 text-[12px] font-medium uppercase tracking-[0.2em] text-sx-black transition-colors hover:bg-sx-gray"
            >
              Back to Sanctuary
              <ArrowRight aria-hidden className="size-4" strokeWidth={1.5} />
            </Link>
          </div>
          <p aria-live="polite" className="sr-only">
            {shared ? "Link copied to clipboard" : ""}
          </p>
        </div>
      </div>
    </main>
  );
}

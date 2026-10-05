import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, Loader2 } from "lucide-react";
import { ORPCError } from "@orpc/client";
import { SERVE_ACKNOWLEDGEMENT, SERVE_AREAS, SERVE_CONSENT_VERSION, serveSchema } from "../../api/crew/serve-contract";
import { LIMITS } from "../../api/crew/contract";
import { Checkbox, ChoiceGroup, TextAreaField, TextField, type FieldErrors } from "../components/apply/fields";
import { Grain, SiteFooter, SiteHeader } from "../components/crew/chrome";
import { useSubmitServeInterest } from "../queries/crew";
import { usePageMeta } from "../hooks/use-page-meta";
import { track } from "../lib/analytics";
import { EVENT_CONTENT, NONPROFIT_ENTITY, PAID_ENTITY } from "../lib/pathways";
import { LegalLinks } from "../components/crew/legal";

type ServeForm = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  city: string;
  areas: string[];
  availability: string;
  notes: string;
  acknowledged: boolean;
  website: string;
};

const EMPTY: ServeForm = { firstName: "", lastName: "", email: "", phone: "", city: "Las Vegas", areas: [], availability: "", notes: "", acknowledged: false, website: "" };
const ORDER: (keyof ServeForm)[] = ["firstName", "lastName", "email", "phone", "city", "areas", "availability", "notes", "acknowledged"];

export default function ServePage() {
  usePageMeta(`Volunteer / Serve Team — ${NONPROFIT_ENTITY}`);
  const [f, setF] = useState<ServeForm>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [done, setDone] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const startedAt = useRef(Date.now());
  const mutation = useSubmitServeInterest();
  useEffect(() => track("serve_page_view", { entry: "serve" }, { once: "serve" }), []);

  const set = <K extends keyof ServeForm>(k: K, v: ServeForm[K]) => {
    setF((p) => ({ ...p, [k]: v }));
    setErrors((p) => (p[k as string] ? { ...p, [k as string]: undefined } : p));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mutation.isPending) return;
    setSubmitError(null);
    const payload = { ...f, consentVersion: SERVE_CONSENT_VERSION, startedAt: startedAt.current };
    const parsed = serveSchema.safeParse(payload);
    if (!parsed.success) {
      const errs: FieldErrors = {};
      for (const i of parsed.error.issues) {
        const k = String(i.path[0] ?? "");
        if (k && !errs[k]) errs[k] = i.message;
      }
      setErrors(errs);
      const first = ORDER.find((k) => errs[k as string]);
      if (first) requestAnimationFrame(() => document.getElementById(String(first))?.focus());
      return;
    }
    try {
      await mutation.mutateAsync(payload as Parameters<typeof mutation.mutateAsync>[0]);
      track("serve_interest_submitted", { entry: "serve" });
      setDone(true);
      requestAnimationFrame(() => document.getElementById("serve-done")?.focus());
    } catch (err) {
      if (!navigator.onLine) setSubmitError("You appear to be offline. Check your connection and try again.");
      else if (err instanceof ORPCError && (err.code === "TOO_MANY_REQUESTS" || err.code === "PRECONDITION_FAILED")) setSubmitError(err.message);
      else setSubmitError("Something went wrong on our side. Please try again.");
    }
  };

  const errorCount = Object.values(errors).filter(Boolean).length;

  return (
    <>
      <Grain />
      <SiteHeader />
      <main id="main" className="bg-sx-black pt-16">
        <section aria-labelledby="serve-title" className="mx-auto grid max-w-[1600px] gap-12 px-5 py-16 sm:px-8 lg:grid-cols-[5fr_7fr] lg:gap-20 lg:px-12 lg:py-24">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <p className="eyebrow text-white/60">{NONPROFIT_ENTITY} · Unpaid</p>
            <h1 id="serve-title" className="heading mt-6 text-[clamp(2.75rem,8vw,6rem)]">
              Volunteer /
              <br />
              Serve Team.
            </h1>
            <div className="mt-8 max-w-md space-y-4 text-[16px] font-light leading-relaxed text-white/75">
              <p>
                The Serve Team is the unpaid volunteer pathway of {NONPROFIT_ENTITY}. It has its own sign-up, consent and
                review, separate from the paid Host and Promoter opportunities operated by {PAID_ENTITY}.
              </p>
              <p>{EVENT_CONTENT}</p>
              <p>
                Interested in a paid Host or Promoter role instead?{" "}
                <Link href="/crew#roles" className="underline underline-offset-4 hover:text-white">
                  See the Host + Promoter Team
                </Link>
                .
              </p>
            </div>
          </div>

          {done ? (
            <div id="serve-done" tabIndex={-1} className="border border-white/20 p-8 outline-none sm:p-12">
              <p className="eyebrow text-white/60">Received</p>
              <h2 className="heading mt-6 text-[clamp(2rem,5vw,3.5rem)]">Thank you for raising your hand.</h2>
              <p className="mt-6 max-w-lg text-[16px] font-light leading-relaxed text-white/75">
                A Serve Team coordinator may reach out about serving. This doesn't confirm a place on a team or a date, and no
                automatic confirmation email is sent.
              </p>
              <Link href="/crew" className="eyebrow mt-10 inline-flex min-h-12 items-center border border-white/40 px-5 hover:bg-white hover:text-sx-black">
                Back to Sanctuary
              </Link>
            </div>
          ) : (
            <form noValidate onSubmit={onSubmit} aria-labelledby="serve-form-title" className="space-y-10">
              <h2 id="serve-form-title" className="heading text-[clamp(1.75rem,4vw,2.75rem)]">
                Serve Team sign-up
              </h2>
              <div role="alert" aria-live="assertive">
                {errorCount > 0 && (
                  <p className="border border-dashed border-white/60 px-4 py-3 text-sm font-medium">
                    {errorCount === 1 ? "One answer needs attention." : `${errorCount} answers need attention.`}
                  </p>
                )}
                {submitError && <p className="border border-white px-4 py-3 text-sm font-medium">{submitError}</p>}
              </div>
              <div className="grid gap-8 sm:grid-cols-2">
                <TextField id="firstName" label="First name" autoComplete="given-name" maxLength={LIMITS.name} value={f.firstName} error={errors.firstName} onValue={(v) => set("firstName", v)} />
                <TextField id="lastName" label="Last name" autoComplete="family-name" maxLength={LIMITS.name} value={f.lastName} error={errors.lastName} onValue={(v) => set("lastName", v)} />
                <TextField id="email" label="Email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} maxLength={LIMITS.email} value={f.email} error={errors.email} onValue={(v) => set("email", v)} className="sm:col-span-2" />
                <TextField id="phone" label="Phone" optional type="tel" inputMode="tel" autoComplete="tel" maxLength={LIMITS.phone} value={f.phone} error={errors.phone} onValue={(v) => set("phone", v)} />
                <TextField id="city" label="City" optional autoComplete="address-level2" maxLength={LIMITS.city} value={f.city} error={errors.city} onValue={(v) => set("city", v)} />
              </div>
              <ChoiceGroup id="areas" legend="Where would you like to serve?" hint="Choose all that apply." type="checkbox" columns={2} options={SERVE_AREAS} value={f.areas} error={errors.areas} onValue={(v) => set("areas", v as string[])} />
              <TextField id="availability" label="When are you usually available?" placeholder="e.g. Friday evenings, one Saturday a month" maxLength={200} value={f.availability} error={errors.availability} onValue={(v) => set("availability", v)} />
              <TextAreaField id="notes" label="Anything else we should know?" optional hint="Please don't include medical or other sensitive details." maxLength={LIMITS.notes} value={f.notes} error={errors.notes} onValue={(v) => set("notes", v)} />
              <Checkbox id="acknowledged" required checked={f.acknowledged} error={errors.acknowledged} onChange={(v) => set("acknowledged", v)}>
                <span className="font-medium text-white">I understand that:</span>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-white/75">
                  {SERVE_ACKNOWLEDGEMENT.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </Checkbox>
              <LegalLinks keys={["privacy", "terms", "volunteerTerms", "communications", "retention"]} />
              {/* Honeypot — hidden from people and assistive tech */}
              <div aria-hidden className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden">
                <label htmlFor="serve-website">Website</label>
                <input id="serve-website" name="website" aria-label="Website" tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => set("website", e.target.value)} />
              </div>
              <button
                type="submit"
                disabled={mutation.isPending}
                aria-busy={mutation.isPending || undefined}
                className="group inline-flex min-h-14 w-full items-center justify-between gap-6 bg-white px-6 text-[12px] font-medium uppercase tracking-[0.2em] text-sx-black hover:bg-sx-gray disabled:cursor-wait disabled:opacity-80 sm:w-auto sm:min-w-72"
              >
                <span>{mutation.isPending ? "Sending…" : "Send Serve Team interest"}</span>
                {mutation.isPending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <ArrowRight aria-hidden className="size-4" strokeWidth={1.5} />}
              </button>
            </form>
          )}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

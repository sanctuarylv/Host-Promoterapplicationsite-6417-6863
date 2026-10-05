import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearch } from "wouter";
import { ArrowLeft, ArrowRight, Loader2, X } from "lucide-react";
import { ORPCError } from "@orpc/client";
import { applicationSchema, CONSENT_VERSION, labelFor, ROLE_OPTIONS } from "../../api/crew/contract";
import { EMPTY_FORM, getSteps, validateStep, type FormState } from "../components/apply/steps";
import type { FieldErrors } from "../components/apply/fields";
import { SuccessScreen } from "../components/apply/success";
import { Wordmark } from "../components/crew/chrome";
import { useSubmitApplication } from "../queries/crew";
import { getAttributionPayload } from "../lib/attribution";
import { track, trackBeacon } from "../lib/analytics";
import { usePageMeta } from "../hooks/use-page-meta";
import { cn } from "../lib/utils";

const DRAFT_KEY = "sx_crew_draft_v1";
const ROLE_PARAM = new Set(["host", "promoter", "both", "guest_experience_lead", "promoter_manager"]);

type Draft = { f: FormState; stepId: string; startedAt: number };

function loadDraft(): Draft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

/** Mounted application flows; guards abandonment tracking against remounts. */
let liveFlows = 0;

export default function ApplyPage() {
  usePageMeta("Apply — Sanctuary LV Host + Promoter Team");
  const search = useSearch();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const roleParam = params.get("role");
  const entry = (params.get("entry") ?? "direct").slice(0, 40);

  const initial = useMemo(() => {
    const d = loadDraft();
    const f: FormState = { ...EMPTY_FORM, ...d?.f, requiredConsent: false, website: "" };
    if (roleParam && ROLE_PARAM.has(roleParam)) f.roleInterest = roleParam;
    return { f, stepId: d?.stepId ?? "about", startedAt: d?.startedAt ?? Date.now(), resumed: Boolean(d) };
  }, [roleParam]);

  const [f, setF] = useState<FormState>(initial.f);
  const [stepId, setStepId] = useState(initial.stepId);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitted, setSubmitted] = useState<{ firstName: string } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const startedAt = useRef(initial.startedAt);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  const mutation = useSubmitApplication();

  const steps = useMemo(() => getSteps(f.roleInterest), [f.roleInterest]);
  const idx = Math.max(0, steps.findIndex((s) => s.id === stepId));
  const step = steps[idx]!;
  const isLast = idx === steps.length - 1;

  // Analytics: started (once per session) + abandonment.
  const progress = useRef({ step: step.id, index: idx, submitted: false });
  progress.current = { step: step.id, index: idx, submitted: Boolean(submitted) };
  useEffect(() => {
    track("application_started", { entry, role: roleParam ?? "unset", resumed: initial.resumed }, { once: "session" });
    const onHide = () => {
      const p = progress.current;
      if (!p.submitted) trackBeacon("application_abandoned", { last_step: p.step, step_index: p.index + 1 });
    };
    window.addEventListener("pagehide", onHide);
    liveFlows += 1;
    return () => {
      window.removeEventListener("pagehide", onHide);
      liveFlows -= 1;
      const p = progress.current;
      // Defer: a StrictMode/dev remount re-increments synchronously, so only a
      // real unmount (in-app navigation away) is counted as abandonment.
      setTimeout(() => {
        if (liveFlows === 0 && !p.submitted)
          track("application_abandoned", { last_step: p.step, step_index: p.index + 1, reason: "navigated_away" });
      }, 0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist draft (session only, cleared on submit). Consent is never persisted.
  useEffect(() => {
    if (submitted) return;
    try {
      const { requiredConsent: _r, website: _w, ...rest } = f;
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ f: rest, stepId: step.id, startedAt: startedAt.current }));
    } catch {
      /* storage unavailable */
    }
  }, [f, step.id, submitted]);

  // Move focus to the step heading on step change (not on first paint).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [step.id]);

  const set = useCallback(<K extends keyof FormState>(k: K, v: FormState[K]) => {
    setF((prev) => ({ ...prev, [k]: v }));
    setErrors((prev) => (prev[k as string] ? { ...prev, [k as string]: undefined } : prev));
    if (k === "roleInterest") track("role_selected", { role: String(v), entry: "application" });
  }, []);

  const focusFirstError = (errs: FieldErrors) => {
    const key = step.fields.find((k) => errs[k as string]);
    if (!key) return;
    requestAnimationFrame(() => {
      const el = document.getElementById(String(key));
      if (!el) return;
      const target =
        el.tagName === "FIELDSET" ? (el.querySelector<HTMLElement>("input") ?? el) : el;
      target.focus({ preventScroll: true });
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  };

  const submit = async () => {
    setSubmitError(null);
    const payload = {
      ...f,
      attribution: getAttributionPayload(entry),
      startedAt: startedAt.current,
      consentVersion: CONSENT_VERSION,
    };
    const parsed = applicationSchema.safeParse(payload);
    if (!parsed.success) {
      // Should not happen (each step validated); route the user to the first broken step.
      const badKey = String(parsed.error.issues[0]?.path[0] ?? "");
      const target = steps.find((s) => s.fields.includes(badKey as keyof FormState));
      if (target) {
        setStepId(target.id);
        setErrors({ [badKey]: parsed.error.issues[0]!.message });
      }
      return;
    }
    try {
      await mutation.mutateAsync(payload as Parameters<typeof mutation.mutateAsync>[0]);
      const role = f.roleInterest ?? "not_sure";
      const props = { role, entry, steps: steps.length };
      track("application_submitted", props);
      if (role === "host") track("host_application_submitted", props);
      if (role === "promoter") track("promoter_application_submitted", props);
      if (role === "both") track("both_application_submitted", props);
      try {
        sessionStorage.removeItem(DRAFT_KEY);
      } catch {
        /* ignore */
      }
      progress.current.submitted = true;
      setSubmitted({ firstName: f.firstName.trim() });
    } catch (e) {
      if (!navigator.onLine) setSubmitError("You appear to be offline. Check your connection and try again — your answers are saved.");
      else if (e instanceof ORPCError && e.code === "TOO_MANY_REQUESTS") setSubmitError(e.message);
      else if (e instanceof ORPCError && e.code === "PRECONDITION_FAILED") setSubmitError(e.message);
      else if (e instanceof ORPCError && e.code === "BAD_REQUEST")
        setSubmitError("Some answers couldn't be accepted. Please review the earlier steps and try again.");
      else setSubmitError("Something went wrong on our side. Your answers are saved — please try again.");
    }
  };

  const next = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (mutation.isPending) return;
    const errs = validateStep(step, f);
    if (Object.values(errs).some(Boolean)) {
      setErrors(errs);
      focusFirstError(errs);
      return;
    }
    setErrors({});
    track("application_step_completed", { step: step.id, step_index: idx + 1, total_steps: steps.length });
    if (isLast) void submit();
    else setStepId(steps[idx + 1]!.id);
  };

  const back = () => {
    setErrors({});
    setSubmitError(null);
    if (idx > 0) setStepId(steps[idx - 1]!.id);
  };

  if (submitted) return <SuccessScreen firstName={submitted.firstName} />;

  const errorCount = Object.values(errors).filter(Boolean).length;
  const roleLabel = f.roleInterest ? labelFor(ROLE_OPTIONS, f.roleInterest) : null;
  const Body = step.Render;

  return (
    <div className="min-h-[100svh] bg-sx-black lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {/* Visual rail (desktop) */}
      <aside aria-hidden className="relative hidden overflow-hidden lg:block">
        <div className="sticky top-0 h-[100svh]">
          {steps.map((s) => (
            <img
              key={s.id}
              src={s.image}
              alt=""
              className={cn(
                "absolute inset-0 h-full w-full object-cover transition-[opacity,transform] duration-[1.2s] ease-[var(--ease-cine)]",
                s.id === step.id ? "scale-100 opacity-70" : "scale-105 opacity-0",
              )}
            />
          ))}
          <div className="absolute inset-0 bg-gradient-to-t from-sx-black via-sx-black/30 to-sx-black/60" />
          <div className="absolute inset-x-0 bottom-0 p-12">
            <p className="eyebrow text-white/60">Host + Promoter Team</p>
            <p className="display mt-4 text-[clamp(3rem,6vw,6.5rem)]">
              Help
              <br />
              build it.
            </p>
            <ol className="mt-10 space-y-2">
              {steps.map((s, i) => (
                <li key={s.id} className={cn("eyebrow flex items-center gap-3 transition-colors", i === idx ? "text-white" : i < idx ? "text-white/60" : "text-white/60")}>
                  <span className="tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                  <span className={cn("h-px transition-all duration-500", i === idx ? "w-10 bg-white" : "w-4 bg-current")} />
                  {s.eyebrow}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </aside>

      {/* Form column */}
      <div className="flex min-h-[100svh] flex-col">
        <header className="sticky top-0 z-30 border-b border-white/10 bg-sx-black/90 backdrop-blur-md">
          <div className="flex h-16 items-center justify-between gap-4 px-5 sm:px-8 lg:px-12">
            <Link href="/crew" aria-label="Sanctuary LV crew page">
              <Wordmark />
            </Link>
            <div className="flex items-center gap-4">
              {roleLabel && <span className="eyebrow hidden text-white/60 sm:inline">Applying as · {roleLabel}</span>}
              <Link href="/crew" className="inline-flex size-11 items-center justify-center border border-white/20 text-white/80 hover:border-white hover:text-white" aria-label="Exit application">
                <X aria-hidden className="size-5" strokeWidth={1.5} />
              </Link>
            </div>
          </div>
          <progress
            className="sr-only"
            aria-label="Application progress"
            max={steps.length}
            value={idx + 1}
            aria-valuetext={`Step ${idx + 1} of ${steps.length}: ${step.eyebrow}`}
          />
          <div aria-hidden className="flex gap-1 px-5 pb-3 sm:px-8 lg:px-12">
            {steps.map((s, i) => (
              <span key={s.id} className="relative h-[3px] flex-1 overflow-hidden bg-white/15">
                <span
                  className="absolute inset-y-0 left-0 bg-white transition-[width] duration-700 ease-[var(--ease-cine)]"
                  style={{ width: i < idx ? "100%" : i === idx ? "50%" : "0%" }}
                />
              </span>
            ))}
          </div>
        </header>

        <main id="main" className="flex flex-1 flex-col">
          <form noValidate onSubmit={next} className="flex flex-1 flex-col" aria-labelledby="step-title">
            <div key={step.id} className="mx-auto w-full max-w-3xl flex-1 px-5 pb-36 pt-10 sm:px-8 sm:pt-14 lg:px-12 lg:pb-16 lg:pt-20">
              <p className="eyebrow rise text-white/60">
                Step {String(idx + 1).padStart(2, "0")} / {String(steps.length).padStart(2, "0")} — {step.eyebrow}
              </p>
              <h1
                id="step-title"
                ref={headingRef}
                tabIndex={-1}
                className="heading rise mt-5 text-[clamp(2.25rem,7vw,4.5rem)] outline-none"
                style={{ "--d": 60 } as React.CSSProperties}
              >
                {step.title}
              </h1>
              {step.lede && (
                <p className="rise mt-4 text-[17px] font-light text-white/65" style={{ "--d": 120 } as React.CSSProperties}>
                  {step.lede}
                </p>
              )}

              <div role="alert" aria-live="assertive" className="mt-6">
                {errorCount > 0 && (
                  <p className="border border-dashed border-white/60 px-4 py-3 text-sm font-medium">
                    {errorCount === 1 ? "One answer needs attention." : `${errorCount} answers need attention.`}
                  </p>
                )}
                {submitError && <p className="border border-white px-4 py-3 text-sm font-medium">{submitError}</p>}
              </div>

              <div className="rise mt-8 sm:mt-10" style={{ "--d": 160 } as React.CSSProperties}>
                <Body f={f} set={set} errors={errors} />
              </div>

              {/* Honeypot — hidden from people and assistive tech */}
              <div aria-hidden className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden">
                <label htmlFor="website">Website</label>
                <input id="website" name="website" aria-label="Website" tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => set("website", e.target.value)} />
              </div>
            </div>

            {/* Action bar — sticky on mobile for thumb reach */}
            <div data-apply-actionbar className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-sx-black/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:static lg:border-t-0 lg:bg-transparent lg:backdrop-blur-none">
              <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-5 py-3 sm:px-8 lg:px-12 lg:pb-16">
                {idx > 0 ? (
                  <button
                    type="button"
                    onClick={back}
                    className="inline-flex min-h-14 items-center gap-3 border border-white/25 px-5 text-[12px] font-medium uppercase tracking-[0.2em] text-white/80 transition-colors hover:border-white hover:text-white"
                  >
                    <ArrowLeft aria-hidden className="size-4" strokeWidth={1.5} />
                    <span>Back</span>
                  </button>
                ) : (
                  <Link
                    href="/crew"
                    className="inline-flex min-h-14 items-center gap-3 px-1 text-[12px] font-medium uppercase tracking-[0.2em] text-white/60 hover:text-white"
                  >
                    <ArrowLeft aria-hidden className="size-4" strokeWidth={1.5} />
                    <span className="sr-only sm:not-sr-only">Exit</span>
                  </Link>
                )}
                <button
                  type="submit"
                  disabled={mutation.isPending}
                  aria-busy={mutation.isPending || undefined}
                  className="group inline-flex min-h-14 flex-1 items-center justify-between gap-6 bg-white px-6 text-[12px] font-medium uppercase tracking-[0.2em] text-sx-black transition-colors hover:bg-sx-gray disabled:cursor-wait disabled:opacity-80 sm:flex-none sm:min-w-72 lg:ml-auto"
                >
                  <span>{isLast ? (mutation.isPending ? "Submitting…" : "Submit application") : "Continue"}</span>
                  {mutation.isPending ? (
                    <Loader2 aria-hidden className="size-4 animate-spin" />
                  ) : (
                    <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-1" strokeWidth={1.5} />
                  )}
                </button>
              </div>
            </div>
          </form>
        </main>
      </div>
    </div>
  );
}

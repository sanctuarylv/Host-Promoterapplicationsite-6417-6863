import type { z } from "zod";
import {
  ACKNOWLEDGEMENT_V2,
  AVAILABILITY_OPTIONS,
  PAID_OPERATOR_ENTITY,
  TRAVEL_OPTIONS,
  experienceSchema,
  HOST_INTEREST_OPTIONS,
  INVITE_RANGE_OPTIONS,
  LIMITS,
  NETWORK_OPTIONS,
  REFERRAL_SOURCE_OPTIONS,
  ROLE_OPTIONS,
  US_STATES,
  aboutSchema,
  availabilitySchema,
  consentSchema,
  hostSchema,
  labelFor,
  motivationSchema,
  promoterSchema,
  roleNeedsHost,
  roleNeedsPromoter,
  roleSchema,
  socialSchema,
} from "../../../api/crew/contract";
import { Checkbox, ChoiceGroup, SelectField, TextAreaField, TextField, YesNo, type FieldErrors } from "./fields";
import { PRIVACY_URL } from "../../lib/site-config";
import { LegalLinks } from "../crew/legal";

export type FormState = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  roleInterest?: string;
  instagram: string;
  tiktok: string;
  otherSocial: string;
  networkTypes: string[];
  availability?: string;
  eveningsAvailable?: boolean;
  weekendsAvailable?: boolean;
  promoterInviteRange?: string;
  promoterExperience?: boolean;
  promoterExperienceNotes: string;
  hostInterests: string[];
  travelRange?: string;
  relevantExperience: string;
  scenarioResponse: string;
  portfolioUrl: string;
  motivation: string;
  referralSource?: string;
  requiredConsent: boolean;
  marketingConsent: boolean;
  website: string; // honeypot
};

export const EMPTY_FORM: FormState = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  city: "Las Vegas",
  state: "NV",
  instagram: "",
  tiktok: "",
  otherSocial: "",
  networkTypes: [],
  promoterExperienceNotes: "",
  hostInterests: [],
  relevantExperience: "",
  scenarioResponse: "",
  portfolioUrl: "",
  motivation: "",
  requiredConsent: false,
  marketingConsent: false,
  website: "",
};

type Set = <K extends keyof FormState>(k: K, v: FormState[K]) => void;
export type StepProps = { f: FormState; set: Set; errors: FieldErrors };

export type StepDef = {
  id: string;
  eyebrow: string;
  title: string;
  lede?: string;
  image: string;
  schema: z.ZodType;
  /** Field order for focusing the first error. */
  fields: (keyof FormState)[];
  Render: (p: StepProps) => React.ReactElement;
};

/** Live-format US numbers as typed; leave international (+) numbers alone. */
export function formatPhone(raw: string): string {
  if (raw.trim().startsWith("+")) return raw.replace(/[^\d+\s()-]/g, "").slice(0, LIMITS.phone);
  let d = raw.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  d = d.slice(0, 10);
  if (d.length < 4) return d;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

const STATE_OPTIONS = US_STATES.map((s) => ({ value: s, label: s }));

/* ---------------- Steps ---------------- */

const About: StepDef = {
  id: "about",
  eyebrow: "About you",
  title: "Let's start with you.",
  lede: "The basics, so our team can reach you.",
  image: "/images/crew/hero-sm.webp",
  schema: aboutSchema,
  fields: ["firstName", "lastName", "email", "phone", "city", "state"],
  Render: ({ f, set, errors }) => (
    <div className="grid gap-8 sm:grid-cols-2 sm:gap-x-8">
      <TextField id="firstName" label="First name" autoComplete="given-name" autoCapitalize="words" enterKeyHint="next" maxLength={LIMITS.name} value={f.firstName} error={errors.firstName} onValue={(v) => set("firstName", v)} />
      <TextField id="lastName" label="Last name" autoComplete="family-name" autoCapitalize="words" enterKeyHint="next" maxLength={LIMITS.name} value={f.lastName} error={errors.lastName} onValue={(v) => set("lastName", v)} />
      <TextField id="email" label="Email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} enterKeyHint="next" maxLength={LIMITS.email} value={f.email} error={errors.email} onValue={(v) => set("email", v)} className="sm:col-span-2" />
      <TextField id="phone" label="Mobile phone" type="tel" inputMode="tel" autoComplete="tel" enterKeyHint="next" placeholder="(702) 555-0123" maxLength={LIMITS.phone} value={f.phone} error={errors.phone} onValue={(v) => set("phone", formatPhone(v))} className="sm:col-span-2" />
      <TextField id="city" label="City" autoComplete="address-level2" autoCapitalize="words" enterKeyHint="next" maxLength={LIMITS.city} value={f.city} error={errors.city} onValue={(v) => set("city", v)} />
      <SelectField id="state" label="State" autoComplete="address-level1" options={STATE_OPTIONS} placeholder="Choose" value={f.state} error={errors.state} onValue={(v) => set("state", v)} />
    </div>
  ),
};

const ROLE_DESCRIPTIONS: Record<string, string> = {
  host: "Create the experience — welcome, hospitality, event flow.",
  promoter: "Build the room — invitations, social, community outreach.",
  both: "Help create the experience and fill the room.",
  not_sure: "We'll help you find the right fit.",
  guest_experience_lead: "Lead the Host team on the night — briefings, flow, guest care.",
  promoter_manager: "Coordinate Promoters — outreach plans, tracking, follow-through.",
};

const Role: StepDef = {
  id: "role",
  eyebrow: "Your role",
  title: "How would you like to help build Sanctuary?",
  lede: `Future opportunities / candidate interest. Paid Host and Promoter roles are operated by ${PAID_OPERATOR_ENTITY}; openings, pay and dates are confirmed only for approved opportunities.`,
  image: "/images/crew/huddle-sm.webp",
  schema: roleSchema,
  fields: ["roleInterest"],
  Render: ({ f, set, errors }) => (
    <div className="space-y-8">
    <ChoiceGroup
      id="roleInterest"
      legend="Choose one"
      type="radio"
      size="lg"
      columns={2}
      options={ROLE_OPTIONS.map((o) => ({ ...o, description: ROLE_DESCRIPTIONS[o.value] }))}
      value={f.roleInterest}
      error={errors.roleInterest}
      onValue={(v) => set("roleInterest", v as string)}
    />
      <p className="border-l border-white/30 pl-4 text-sm text-white/70">
        Looking to volunteer instead? Unpaid Volunteer / Serve Team opportunities with Sanctuary LV nonprofit are a{" "}
        <a href="/serve" className="underline underline-offset-4 hover:text-white">
          separate pathway
        </a>
        .
      </p>
    </div>
  ),
};

const Social: StepDef = {
  id: "social",
  eyebrow: "Social + community",
  title: "Where are your people?",
  lede: "Handles are optional. They help us understand your reach.",
  image: "/images/crew/promoter-sm.webp",
  schema: socialSchema,
  fields: ["instagram", "tiktok", "otherSocial", "networkTypes"],
  Render: ({ f, set, errors }) => (
    <div className="space-y-12">
      <div className="grid gap-8 sm:grid-cols-2 sm:gap-x-8">
        <TextField id="instagram" label="Instagram" optional placeholder="@yourname" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={LIMITS.handle} value={f.instagram} error={errors.instagram} onValue={(v) => set("instagram", v)} />
        <TextField id="tiktok" label="TikTok" optional placeholder="@yourname" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={LIMITS.handle} value={f.tiktok} error={errors.tiktok} onValue={(v) => set("tiktok", v)} />
        <TextField id="otherSocial" label="Other relevant link" optional type="url" inputMode="url" placeholder="https://" autoCapitalize="none" spellCheck={false} maxLength={LIMITS.url} value={f.otherSocial} error={errors.otherSocial} onValue={(v) => set("otherSocial", v)} className="sm:col-span-2" />
      </div>
      <ChoiceGroup
        id="networkTypes"
        legend="How do you usually connect with people?"
        hint="Choose all that apply."
        type="checkbox"
        columns={2}
        options={NETWORK_OPTIONS}
        value={f.networkTypes}
        error={errors.networkTypes}
        onValue={(v) => set("networkTypes", v as string[])}
      />
    </div>
  ),
};

const Availability: StepDef = {
  id: "availability",
  eyebrow: "Availability",
  title: "How often could you show up?",
  image: "/images/crew/backstage-sm.webp",
  schema: availabilitySchema.extend(experienceSchema.pick({ travelRange: true }).shape),
  fields: ["availability", "eveningsAvailable", "weekendsAvailable", "travelRange"],
  Render: ({ f, set, errors }) => (
    <div className="space-y-12">
      <ChoiceGroup id="travelRange" legend="How far can you travel for an event?" type="radio" columns={3} options={TRAVEL_OPTIONS} value={f.travelRange} error={errors.travelRange} onValue={(v) => set("travelRange", v as string)} />
      <ChoiceGroup id="availability" legend="How often could you participate?" type="radio" columns={2} options={AVAILABILITY_OPTIONS} value={f.availability} error={errors.availability} onValue={(v) => set("availability", v as string)} />
      <div className="grid gap-12 sm:grid-cols-2 sm:gap-8">
        <YesNo id="eveningsAvailable" legend="Are evenings generally available?" value={f.eveningsAvailable} error={errors.eveningsAvailable} onValue={(v) => set("eveningsAvailable", v)} />
        <YesNo id="weekendsAvailable" legend="Are weekends generally available?" value={f.weekendsAvailable} error={errors.weekendsAvailable} onValue={(v) => set("weekendsAvailable", v)} />
      </div>
    </div>
  ),
};

const Promoter: StepDef = {
  id: "promoter",
  eyebrow: "Promoter",
  title: "Let's talk about your reach.",
  image: "/images/crew/ten-sm.webp",
  schema: promoterSchema,
  fields: ["promoterInviteRange", "promoterExperience", "promoterExperienceNotes"],
  Render: ({ f, set, errors }) => (
    <div className="space-y-12">
      <ChoiceGroup
        id="promoterInviteRange"
        legend="For the right event, approximately how many people could you personally invite?"
        type="radio"
        columns={3}
        options={INVITE_RANGE_OPTIONS}
        value={f.promoterInviteRange}
        error={errors.promoterInviteRange}
        onValue={(v) => set("promoterInviteRange", v as string)}
      />
      <YesNo id="promoterExperience" legend="Have you promoted events before?" value={f.promoterExperience} error={errors.promoterExperience} onValue={(v) => set("promoterExperience", v)} />
      {f.promoterExperience && (
        <div className="fade-in">
          <TextAreaField
            id="promoterExperienceNotes"
            label="Tell us about it"
            optional
            hint="Which events, what you did, roughly how many people you brought."
            maxLength={LIMITS.notes}
            value={f.promoterExperienceNotes}
            error={errors.promoterExperienceNotes}
            onValue={(v) => set("promoterExperienceNotes", v)}
          />
        </div>
      )}
    </div>
  ),
};

const Host: StepDef = {
  id: "host",
  eyebrow: "Host",
  title: "Where would you like to serve?",
  image: "/images/crew/host-sm.webp",
  schema: hostSchema,
  fields: ["hostInterests"],
  Render: ({ f, set, errors }) => (
    <ChoiceGroup
      id="hostInterests"
      legend="Which areas interest you?"
      hint="Choose all that apply."
      type="checkbox"
      columns={2}
      options={HOST_INTEREST_OPTIONS}
      value={f.hostInterests}
      error={errors.hostInterests}
      onValue={(v) => set("hostInterests", v as string[])}
    />
  ),
};

/** Role-specific scenario. Simulated only: never asks for real outreach, unpaid promotion or anyone's contact details. */
export function scenarioPrompt(role: string | undefined): { label: string; hint: string } {
  const host = "A guest arrives upset because their name isn't on the check-in list, and the line behind them is growing. What do you do in the first few minutes?";
  const promoter = "Describe how you'd invite people to a first-time Sanctuary night: what you'd say, how you'd follow up, and how you'd keep an accurate count. Don't include anyone's name or contact details.";
  if (role === "guest_experience_lead") return { label: "Two Hosts haven't arrived 30 minutes before doors and the VIP area is unstaffed. How do you reassign the team and who do you tell?", hint: "Walk us through it step by step." };
  if (role === "promoter_manager") return { label: "One Promoter reports far more confirmed guests than the registration count shows. How do you handle it fairly?", hint: "Think accuracy, conversation and follow-up." };
  if (roleNeedsPromoter(role) && !roleNeedsHost(role)) return { label: promoter, hint: "A plan, not real outreach — we never ask for contact lists." };
  if (roleNeedsHost(role) && !roleNeedsPromoter(role)) return { label: host, hint: "There's no single right answer. Tell us how you'd think." };
  return { label: host, hint: "There's no single right answer. Tell us how you'd think." };
}

const Experience: StepDef = {
  id: "experience",
  eyebrow: "Experience",
  title: "What have you done before?",
  lede: "Jobs, volunteering, school, church, events, hospitality — anything relevant counts.",
  image: "/images/crew/backstage-sm.webp",
  schema: experienceSchema.omit({ travelRange: true }),
  fields: ["relevantExperience", "scenarioResponse", "portfolioUrl"],
  Render: ({ f, set, errors }) => {
    const sc = scenarioPrompt(f.roleInterest);
    return (
      <div className="space-y-12">
        <TextAreaField
          id="relevantExperience"
          label="Relevant experience"
          hint="Guest service, events, hospitality, outreach, leadership or teamwork."
          maxLength={LIMITS.experience}
          value={f.relevantExperience}
          error={errors.relevantExperience}
          onValue={(v) => set("relevantExperience", v)}
        />
        <TextAreaField id="scenarioResponse" label={sc.label} hint={sc.hint} maxLength={LIMITS.scenario} value={f.scenarioResponse} error={errors.scenarioResponse} onValue={(v) => set("scenarioResponse", v)} />
        <TextField id="portfolioUrl" label="Portfolio or work sample link" optional type="url" inputMode="url" placeholder="https://" autoCapitalize="none" spellCheck={false} maxLength={LIMITS.url} value={f.portfolioUrl} error={errors.portfolioUrl} onValue={(v) => set("portfolioUrl", v)} />
      </div>
    );
  },
};

const Motivation: StepDef = {
  id: "motivation",
  eyebrow: "Motivation",
  title: "Why Sanctuary?",
  image: "/images/crew/room-sm.webp",
  schema: motivationSchema,
  fields: ["motivation", "referralSource"],
  Render: ({ f, set, errors }) => (
    <div className="space-y-12">
      <TextAreaField
        id="motivation"
        label="Why do you want to be part of the Sanctuary Host + Promoter Team?"
        hint="A few honest sentences is perfect."
        maxLength={LIMITS.motivationMax}
        value={f.motivation}
        error={errors.motivation}
        onValue={(v) => set("motivation", v)}
      />
      <ChoiceGroup id="referralSource" legend="How did you hear about us?" type="radio" columns={2} options={REFERRAL_SOURCE_OPTIONS} value={f.referralSource} error={errors.referralSource} onValue={(v) => set("referralSource", v as string)} />
    </div>
  ),
};

function Summary({ f }: { f: FormState }) {
  const rows: [string, string][] = [
    ["Name", `${f.firstName} ${f.lastName}`.trim()],
    ["Email", f.email],
    ["Mobile", f.phone],
    ["Location", [f.city, f.state].filter(Boolean).join(", ")],
    ["Role", labelFor(ROLE_OPTIONS, f.roleInterest)],
    ["Availability", labelFor(AVAILABILITY_OPTIONS, f.availability)],
    ["Travel", labelFor(TRAVEL_OPTIONS, f.travelRange)],
  ];
  if (roleNeedsPromoter(f.roleInterest)) rows.push(["Could invite", labelFor(INVITE_RANGE_OPTIONS, f.promoterInviteRange)]);
  if (roleNeedsHost(f.roleInterest))
    rows.push(["Host areas", f.hostInterests.map((h) => labelFor(HOST_INTEREST_OPTIONS, h)).join(", ")]);
  return (
    <dl className="border-t border-white/15">
      {rows.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[7.5rem_1fr] gap-4 border-b border-white/15 py-3 text-[15px] sm:grid-cols-[10rem_1fr]">
          <dt className="eyebrow pt-0.5 text-white/60">{k}</dt>
          <dd className="min-w-0 break-words text-white/90">{v || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

const Confirm: StepDef = {
  id: "confirm",
  eyebrow: "Confirm",
  title: "One last look.",
  lede: "Check your details, then send it in.",
  image: "/images/crew/huddle-sm.webp",
  schema: consentSchema,
  fields: ["requiredConsent", "marketingConsent"],
  Render: ({ f, set, errors }) => (
    <div className="space-y-10">
      <Summary f={f} />
      <p className="text-sm leading-relaxed text-white/70">
        Sanctuary nights include live music, a Christian message, worship and an optional time of prayer. Applications are
        reviewed on role-related capability, reliability and respectful conduct.
      </p>
      <div className="space-y-3">
        <Checkbox id="requiredConsent" required checked={f.requiredConsent} error={errors.requiredConsent} onChange={(v) => set("requiredConsent", v)}>
          <span className="font-medium text-white">I understand and agree that:</span>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-white/75">
            {ACKNOWLEDGEMENT_V2.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </Checkbox>
        <Checkbox id="marketingConsent" checked={f.marketingConsent} onChange={(v) => set("marketingConsent", v)}>
          <span className="text-white/60">Optional — </span>I'd also like to receive news, event announcements and updates from
          Sanctuary. I can opt out at any time.
        </Checkbox>
      </div>
      <p className="text-xs leading-relaxed text-white/60">
        Your information is used to review your application and coordinate team opportunities.
        {PRIVACY_URL ? (
          <>
            {" "}
            See our{" "}
            <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-white">
              privacy policy
            </a>
            .
          </>
        ) : null}
      </p>
      <LegalLinks keys={["privacy", "terms", "groupDisclosure", "communications", "retention"]} />
    </div>
  ),
};

/** Visible steps for the current role selection (steps 5 and 6 are conditional). */
export function getSteps(role: string | undefined): StepDef[] {
  return [
    About,
    Role,
    Social,
    Availability,
    ...(roleNeedsPromoter(role) ? [Promoter] : []),
    ...(roleNeedsHost(role) ? [Host] : []),
    Experience,
    Motivation,
    Confirm,
  ];
}

/** Validate one step against the shared contract; returns field → message. */
export function validateStep(step: StepDef, f: FormState): FieldErrors {
  const res = step.schema.safeParse(f);
  if (res.success) return {};
  const out: FieldErrors = {};
  for (const issue of res.error.issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}

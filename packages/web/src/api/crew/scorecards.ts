/**
 * Anchored scorecards (rubric v1). Each criterion is scored 1–4 against a
 * written behavioural anchor, and evidence notes are required. Criteria are
 * role-related only — never guest demographics, faith background or personal
 * networks. Simulated assessments never require real promotion or contact lists.
 */
export const RUBRIC_VERSION = "rubric.2026-10.v1";

type Criterion = { key: string; label: string; anchors: [string, string, string, string] };

export const RUBRICS: Record<"host" | "promoter", { title: string; exercise: string; criteria: Criterion[] }> = {
  host: {
    title: "Host scorecard",
    exercise:
      "Simulated arrival scenario (role-play): a guest arrives unsure what the evening includes and asks whether they have to take part in worship or prayer.",
    criteria: [
      { key: "communication", label: "Communication", anchors: ["Unclear or abrupt", "Understandable but generic", "Clear, warm and accurate", "Clear, warm, accurate and adapts to the guest"] },
      { key: "guest_judgment", label: "Guest judgment", anchors: ["Misreads the situation", "Handles only the obvious need", "Identifies the need and responds appropriately", "Anticipates needs and escalates correctly"] },
      { key: "reliability", label: "Reliability", anchors: ["No evidence of follow-through", "Some evidence, gaps unexplained", "Consistent, verifiable examples", "Strong record incl. punctuality and handoffs"] },
      { key: "teamwork", label: "Teamwork", anchors: ["Works alone / ignores roles", "Cooperates when asked", "Coordinates with leads and peers", "Supports others and communicates proactively"] },
      { key: "respectful_guidance", label: "Respectful guidance", anchors: ["Pressures or dismisses the guest", "Neutral but unhelpful", "Explains plainly; participation is optional", "Explains plainly, respects choice, keeps dignity"] },
    ],
  },
  promoter: {
    title: "Promoter scorecard",
    exercise:
      "Simulated planning exercise: describe how you would invite people to a sample event and track interest. No real outreach, no handing over contact lists.",
    criteria: [
      { key: "outreach", label: "Outreach approach", anchors: ["Spam-like or misleading", "Generic broadcast only", "Personal, honest invitations", "Personal, honest, audience-appropriate and compliant"] },
      { key: "invitation_plan", label: "Invitation plan", anchors: ["No plan", "Vague plan", "Specific steps and timing", "Specific, realistic, with fallbacks"] },
      { key: "follow_through", label: "Follow-through", anchors: ["No follow-up", "Ad hoc follow-up", "Planned follow-up", "Planned follow-up that respects opt-outs"] },
      { key: "tracking_accuracy", label: "Tracking & accuracy", anchors: ["No tracking or inflated claims", "Informal tracking", "Uses the provided link/code accurately", "Accurate, honest reporting incl. no-shows"] },
    ],
  },
};

export function validateScorecard(kind: "host" | "promoter", scores: Record<string, number>, evidence: Record<string, string>): string[] {
  const errs: string[] = [];
  for (const c of RUBRICS[kind].criteria) {
    const s = scores[c.key];
    if (!Number.isInteger(s) || s! < 1 || s! > 4) errs.push(`${c.label}: score 1–4 required`);
    if (!evidence[c.key] || evidence[c.key]!.trim().length < 5) errs.push(`${c.label}: supporting note required`);
  }
  const extra = Object.keys(scores).filter((k) => !RUBRICS[kind].criteria.some((c) => c.key === k));
  if (extra.length) errs.push(`Unknown criteria: ${extra.join(", ")}`);
  return errs;
}

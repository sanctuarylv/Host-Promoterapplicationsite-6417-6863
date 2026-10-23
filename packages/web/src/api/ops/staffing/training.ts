/**
 * Training mapping boundary (pure).
 *
 *   training_requirements text ─▶ phrases ─▶ EXISTING crew_training_modules.module_key
 *
 * Only the four seeded modules exist (after-dark-v1.ts PLANNING_TRAINING_MODULES).
 * A phrase maps only through the reviewed table below; anything else stays
 * `unresolved`. This module never creates a training module, never creates a
 * crew_training_records row and never marks anyone trained — a role requiring
 * training says nothing about whether a person completed it.
 */
import { PLANNING_TRAINING_MODULES } from "./after-dark-v1";

export const KNOWN_MODULE_KEYS = PLANNING_TRAINING_MODULES.map((m) => m.key);

/** Reviewed phrase → module key. Keys are lower-case trimmed phrases. */
export const TRAINING_PHRASES: Record<string, string> = {
  // event_orientation — what the night is and how the event runs
  "event briefing": "event_orientation",
  "sanctuary standards": "event_orientation",
  // guest_service_fundamentals — welcome, wayfinding, respectful guidance, hand-offs
  hospitality: "guest_service_fundamentals",
  "hospitality standards": "guest_service_fundamentals",
  "sanctuary hospitality": "guest_service_fundamentals",
  "guest service": "guest_service_fundamentals",
  "guest recovery": "guest_service_fundamentals",
  wayfinding: "guest_service_fundamentals",
  "respectful assistance": "guest_service_fundamentals",
  // venue_safety_authority — emergency/security stays with the venue; escalation paths
  safety: "venue_safety_authority",
  "site safety": "venue_safety_authority",
  "venue safety": "venue_safety_authority",
  "venue rules": "venue_safety_authority",
  "venue procedures": "venue_safety_authority",
  escalation: "venue_safety_authority",
  "incident escalation": "venue_safety_authority",
  "emergency procedures": "venue_safety_authority",
  "emergency exits": "venue_safety_authority",
  "evacuation routes": "venue_safety_authority",
  "emergency plan": "venue_safety_authority",
  "venue emergency plan": "venue_safety_authority",
  // promoter_tracking_accuracy — how links/codes work, honest invitations
  "referral attribution": "promoter_tracking_accuracy",
  "referral tools": "promoter_tracking_accuracy",
};

export type TrainingPhrase = { text: string; module_key: string | null };
export type TrainingMapping = {
  canonical_role_id: string;
  role_key: string;
  source_text: string;
  phrases: TrainingPhrase[];
  module_keys: string[];
  unresolved: string[];
  status: "mapped" | "partial" | "unresolved";
};

export function mapTraining(canonical_role_id: string, role_key: string, text: string, known: readonly string[] = KNOWN_MODULE_KEYS): TrainingMapping {
  const phrases: TrainingPhrase[] = text
    .split(/[,;]/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const k = TRAINING_PHRASES[p.toLowerCase()];
      return { text: p, module_key: k && known.includes(k) ? k : null };
    });
  const module_keys = [...new Set(phrases.flatMap((p) => (p.module_key ? [p.module_key] : [])))].sort();
  const unresolved = phrases.filter((p) => !p.module_key).map((p) => p.text);
  const status = module_keys.length === 0 ? "unresolved" : unresolved.length ? "partial" : "mapped";
  return { canonical_role_id, role_key, source_text: text, phrases, module_keys, unresolved, status };
}

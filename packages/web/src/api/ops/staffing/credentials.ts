/**
 * Credential mapping boundary (pure).
 *
 *   canonical role ─▶ credential_level text ─▶ tokens ─▶ EXISTING access-zone ids
 *
 * The repository's only access model is the zone list on template roles, copied
 * onto assignments and issued credentials (ops_template_roles.zones →
 * ops_assignments.zones → ops_credentials.zones). The zone ids in use are the
 * five below. No parallel credential system is introduced and no zone is
 * invented: a token that is not in ZONE_TOKENS / DESCRIPTOR_TOKENS is reported
 * as a reconciliation warning and grants NOTHING. Conditional wording
 * ("as required", "as approved", "as applicable") is never auto-granted.
 *
 * The result is a PROPOSAL shown in the import plan. Nothing here writes a
 * template role, assignment, credential or permission.
 */
export const ACCESS_ZONES = ["front_of_house", "back_of_house", "stage", "vip", "all_staff"] as const;
export type AccessZone = (typeof ACCESS_ZONES)[number];

/** Reviewed token → zone map. Keys are lower-case trimmed tokens. */
export const ZONE_TOKENS: Record<string, AccessZone[]> = {
  foh: ["front_of_house"],
  "foh audio": ["front_of_house"],
  floor: ["front_of_house"],
  backstage: ["back_of_house"],
  "green room": ["back_of_house"],
  loading: ["back_of_house"],
  facilities: ["back_of_house"],
  vip: ["vip"],
  "all access": ["all_staff"],
  // Matches the existing v1 production zones (back_of_house + stage).
  production: ["back_of_house", "stage"],
};

/**
 * Tokens that name a credential CATEGORY (department / function label) rather
 * than an area. Recognised — so they are not "unknown" — but they grant no zone.
 */
export const DESCRIPTOR_TOKENS = new Set([
  "executive credential",
  "guest experience",
  "registration",
  "accessibility",
  "hospitality",
  "promoter",
  "promoter lead",
  "activation",
  "operations",
  "safety",
  "security",
  "access control",
  "talent",
  "commerce",
  "staff check-in",
  "lighting",
  "video",
  "broadcast",
  "camera",
]);

const CONDITIONAL_RE = /\s+as\s+(required|approved|applicable)\s*$/i;

export type CredentialToken = { token: string; kind: "zone" | "descriptor" | "conditional" | "unknown"; zones: AccessZone[] };
export type CredentialMapping = {
  canonical_role_id: string;
  role_key: string;
  source_text: string;
  tokens: CredentialToken[];
  /** Union of zones from unconditional zone tokens only. A proposal — never applied in this phase. */
  proposed_zones: AccessZone[];
  status: "mapped" | "partial" | "unresolved";
  gaps: string[];
};

export function mapCredential(canonical_role_id: string, role_key: string, text: string): CredentialMapping {
  const tokens: CredentialToken[] = [];
  const gaps: string[] = [];
  for (const raw of text.split("/").map((t) => t.trim()).filter(Boolean)) {
    const cond = CONDITIONAL_RE.test(raw);
    const base = raw.replace(CONDITIONAL_RE, "").trim().toLowerCase();
    const zones = ZONE_TOKENS[base];
    if (cond) {
      tokens.push({ token: raw, kind: "conditional", zones: [] });
      gaps.push(`"${raw}" is conditional — needs a staff decision per event; not granted`);
    } else if (zones) tokens.push({ token: raw, kind: "zone", zones: [...zones] });
    else if (DESCRIPTOR_TOKENS.has(base)) tokens.push({ token: raw, kind: "descriptor", zones: [] });
    else {
      tokens.push({ token: raw, kind: "unknown", zones: [] });
      gaps.push(`"${raw}" has no reviewed zone mapping — no access created`);
    }
  }
  const proposed_zones = ACCESS_ZONES.filter((z) => tokens.some((t) => t.kind === "zone" && t.zones.includes(z)));
  if (!proposed_zones.length) gaps.push("no access zone resolved — credential level needs a reviewed mapping");
  const clean = tokens.every((t) => t.kind === "zone" || t.kind === "descriptor");
  const status = proposed_zones.length === 0 ? "unresolved" : clean ? "mapped" : "partial";
  return { canonical_role_id, role_key, source_text: text, tokens, proposed_zones, status, gaps };
}

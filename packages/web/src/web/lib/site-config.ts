/**
 * Public, non-secret site configuration. Official Sanctuary LV links are
 * NOT hard-coded — set them in the root .env (VITE_SANCTUARY_*). Until a
 * value is provided, the UI renders a clearly labeled placeholder.
 */
const v = (x: string | undefined) => (x?.trim().startsWith("https://") ? x.trim() : null);

export const SOCIAL_LINKS = [
  { key: "instagram", label: "Instagram", url: v(import.meta.env.VITE_SANCTUARY_INSTAGRAM_URL) },
  { key: "tiktok", label: "TikTok", url: v(import.meta.env.VITE_SANCTUARY_TIKTOK_URL) },
  { key: "youtube", label: "YouTube", url: v(import.meta.env.VITE_SANCTUARY_YOUTUBE_URL) },
  { key: "website", label: "Website", url: v(import.meta.env.VITE_SANCTUARY_WEBSITE_URL) },
] as const;

export const PRIVACY_URL = v(import.meta.env.VITE_SANCTUARY_PRIVACY_URL);

/**
 * Legal / consent documents. Official URLs and approved language are supplied
 * by Sanctuary LV Group and Sanctuary LV nonprofit — this app never invents
 * legal text. Each entry renders a visible "pending approval" placeholder until
 * its VITE_SANCTUARY_* URL (https only) is set in the root .env.
 * Inventory: docs/LEGAL_PLACEHOLDERS_V2.md.
 */
export const LEGAL = {
  privacy: { label: "Privacy Policy", envKey: "VITE_SANCTUARY_PRIVACY_URL", url: PRIVACY_URL },
  terms: { label: "Terms of Use", envKey: "VITE_SANCTUARY_TERMS_URL", url: v(import.meta.env.VITE_SANCTUARY_TERMS_URL) },
  groupDisclosure: {
    label: "Sanctuary LV Group paid-role disclosures",
    envKey: "VITE_SANCTUARY_GROUP_DISCLOSURE_URL",
    url: v(import.meta.env.VITE_SANCTUARY_GROUP_DISCLOSURE_URL),
  },
  volunteerTerms: {
    label: "Sanctuary LV nonprofit volunteer terms",
    envKey: "VITE_SANCTUARY_VOLUNTEER_TERMS_URL",
    url: v(import.meta.env.VITE_SANCTUARY_VOLUNTEER_TERMS_URL),
  },
  communications: {
    label: "Email & SMS communications terms",
    envKey: "VITE_SANCTUARY_COMMUNICATIONS_URL",
    url: v(import.meta.env.VITE_SANCTUARY_COMMUNICATIONS_URL),
  },
  retention: { label: "Data retention", envKey: "VITE_SANCTUARY_DATA_RETENTION_URL", url: v(import.meta.env.VITE_SANCTUARY_DATA_RETENTION_URL) },
} as const;

export type LegalKey = keyof typeof LEGAL;

/** Absolute production origin for canonical/og URLs (vite.config.ts defaults it to https://crew.sanctuarylv.org). */
export const SITE_URL = (import.meta.env.VITE_SITE_URL ?? "").trim().replace(/\/+$/, "");

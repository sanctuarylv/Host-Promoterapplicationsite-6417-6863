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

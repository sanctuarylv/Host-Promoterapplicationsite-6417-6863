/**
 * Referral / campaign / event / QR code helpers. Dependency-free so the
 * landing page can capture attribution without pulling zod into its bundle.
 */
export const CODE_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;

export function normalizeCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const v = raw.trim();
  return CODE_RE.test(v) ? v.toUpperCase() : null;
}

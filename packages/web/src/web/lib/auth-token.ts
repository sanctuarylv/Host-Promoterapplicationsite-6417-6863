/**
 * Bearer token store shared by the typed API client and the Better Auth client.
 *
 * It deliberately uses the SAME localStorage key as @runablehq/managed-auth
 * (`runable.managed-auth.token`, see its dist/client.js BrowserStorage) so a
 * managed Google sign-in and an email/password sign-in end up in one place and
 * `authClient.managedAuth.getToken()` / sign-out clearing both keep working.
 * This module has no Better Auth import, so the public pages stay light.
 * Coupling is checked by tests/auth-token.test.ts — re-check on package upgrades.
 */
export const AUTH_TOKEN_KEY = "runable.managed-auth.token";

export function getAuthToken(): string {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setAuthToken(token: string) {
  try {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  } catch {
    /* storage unavailable (private mode) — session cookie still works same-origin */
  }
}

export function clearAuthToken() {
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

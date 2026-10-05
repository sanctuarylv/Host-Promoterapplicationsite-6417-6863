import { createAuthClient } from "better-auth/react";
import { managedAuthClient } from "@runablehq/managed-auth/client";
import { clearAuthToken, setAuthToken } from "./auth-token";

// Both values are injected into the app env and exposed to the browser by Vite.
const config = {
  applicationId: import.meta.env.VITE_APPLICATION_ID,
  issuer: import.meta.env.VITE_RUNABLE_AUTH_ISSUER,
};

export const authClient = createAuthClient({
  baseURL: window.location.origin,
  basePath: "/api/auth",
  plugins: [managedAuthClient(config)],
});

/** Better Auth's bearer plugin returns the session token in `set-auth-token`; keep it with the managed token. */
export const captureToken = {
  onSuccess: (ctx: { response: Response }) => {
    const t = ctx.response.headers.get("set-auth-token");
    if (t) setAuthToken(t);
  },
};

export async function signOut() {
  try {
    await authClient.signOut();
  } finally {
    clearAuthToken();
  }
}

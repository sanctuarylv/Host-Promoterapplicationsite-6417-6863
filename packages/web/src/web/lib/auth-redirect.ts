// Finishes a returning managed (Google) top-level redirect sign-in. The broker
// hands back a `#…nonce=…` fragment; only then is the auth bundle loaded, so
// public pages stay light. managedAuthClient refreshes the reactive session
// after the exchange, so routes that render first update without a reload.
export const managedRedirectPending =
  typeof window !== "undefined" && /[#&]nonce=/.test(window.location.hash);

if (managedRedirectPending) {
  void import("./auth")
    .then(({ authClient }) => authClient.managedAuth.handleRedirect())
    .catch(() => undefined);
}

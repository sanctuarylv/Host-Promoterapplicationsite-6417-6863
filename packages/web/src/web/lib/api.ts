import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { AppRouterClient } from "../../api";
import { getAuthToken } from "./auth-token";

const link = new RPCLink({
  url: `${window.location.origin}/api/rpc`,
  headers: () => {
    const token = getAuthToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  },
});

/** Direct typed client: await client.ping() */
export const client: AppRouterClient = createORPCClient(link);

/** TanStack Query helpers: useQuery(orpc.ping.queryOptions()) */
export const orpc = createTanstackQueryUtils(client);

/**
 * Admin-only typed client. Sends the access key the operator typed in (kept
 * in sessionStorage for this tab only). No secret ships in the bundle.
 */
export const ADMIN_KEY_STORAGE = "sx_admin_key";

export const getAdminKey = () => {
  try {
    return sessionStorage.getItem(ADMIN_KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
};

const adminLink = new RPCLink({
  url: `${window.location.origin}/api/rpc`,
  headers: () => ({ "x-crew-admin-key": getAdminKey() }),
});

export const adminClient: AppRouterClient = createORPCClient(adminLink);
export const adminOrpc = createTanstackQueryUtils(adminClient);

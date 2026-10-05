import { useQuery } from "@tanstack/react-query";
import { orpc } from "../lib/api";
import { useInvalidating } from "../lib/use-invalidating";

/** Who am I: staff scopes, linked crew profile and staff navigation hints. */
export function useMe(enabled = true) {
  return useQuery(orpc.me.session.queryOptions({ enabled, retry: false, staleTime: 30_000 }));
}

/** Explicit account ↔ crew-profile link with a staff-issued one-time code. */
export function useRedeemLink() {
  return useInvalidating(orpc.me.redeemLink.mutationOptions(), [orpc.me.key(), orpc.worker.key()]);
}

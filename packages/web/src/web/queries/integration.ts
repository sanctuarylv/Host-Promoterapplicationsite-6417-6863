import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { client, orpc } from "../lib/api";
import { useInvalidating } from "../lib/use-invalidating";

export type OutboxInput = Parameters<typeof client.integration.outbox>[0];
const keys = () => [orpc.integration.key(), orpc.me.key()];

export const useReadiness = () => useQuery(orpc.integration.readiness.queryOptions({ retry: false }));
export const useIntegrationState = () => useQuery(orpc.integration.state.queryOptions({ retry: false }));
export const useOutbox = (input: OutboxInput) => useQuery(orpc.integration.outbox.queryOptions({ input, placeholderData: keepPreviousData, retry: false }));
export const useIntegrationAudit = () => useQuery(orpc.integration.audit.queryOptions({ input: {}, retry: false }));

export const useRetryOutbox = () => useInvalidating(orpc.integration.retry.mutationOptions(), keys());
export const useDrainNow = () => useInvalidating(orpc.integration.drainNow.mutationOptions(), keys());
export const useReconcile = () => useInvalidating(orpc.integration.reconcile.mutationOptions(), keys());

export const useStaffList = () => useQuery(orpc.staff.list.queryOptions({ retry: false }));
export const useGrantStaff = () => useInvalidating(orpc.staff.grant.mutationOptions(), [orpc.staff.key()]);
export const useRevokeStaff = () => useInvalidating(orpc.staff.revoke.mutationOptions(), [orpc.staff.key()]);

export type ServeStatus = NonNullable<Parameters<typeof client.serveTeam.list>[0]["status"]>[number];
export const useServeQueue = (status?: ServeStatus[]) =>
  useQuery(orpc.serveTeam.list.queryOptions({ input: { status }, placeholderData: keepPreviousData, retry: false }));
export const useSetServeStatus = () => useInvalidating(orpc.serveTeam.setStatus.mutationOptions(), [orpc.serveTeam.key()]);
export const useRecordRoundTrip = () => useInvalidating(orpc.integration.recordRoundTrip.mutationOptions(), keys());
export const useRecordCutover = () => useInvalidating(orpc.integration.recordCutover.mutationOptions(), keys());

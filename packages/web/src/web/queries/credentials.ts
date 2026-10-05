import { useQuery } from "@tanstack/react-query";
import { orpc } from "../lib/api";
import { useInvalidating } from "../lib/use-invalidating";

const keys = () => [orpc.credentials.key(), orpc.attendance.key(), orpc.events.key(), orpc.promoters.key()];

export const useAssignmentCredentials = (assignmentId: string | null) =>
  useQuery(orpc.credentials.forAssignment.queryOptions({ input: { assignmentId: assignmentId ?? "" }, enabled: Boolean(assignmentId), retry: false }));
export const useAssignmentAttendance = (assignmentId: string | null) =>
  useQuery(orpc.attendance.forAssignment.queryOptions({ input: { assignmentId: assignmentId ?? "" }, enabled: Boolean(assignmentId), retry: false }));
export const usePromoterAggregates = (eventId: string, enabled: boolean) =>
  useQuery(orpc.promoters.aggregates.queryOptions({ input: { eventId }, enabled, retry: false }));

export const useIssueCredential = () => useInvalidating(orpc.credentials.issue.mutationOptions(), keys());
export const useRevokeCredential = () => useInvalidating(orpc.credentials.revoke.mutationOptions(), keys());
export const useVerifyCredential = () => useInvalidating(orpc.credentials.verify.mutationOptions(), keys());
export const useRecordAttendance = () => useInvalidating(orpc.attendance.record.mutationOptions(), keys());
export const useCorrectAttendance = () => useInvalidating(orpc.attendance.correct.mutationOptions(), keys());
export const useCreatePromoterLink = () => useInvalidating(orpc.promoters.createLink.mutationOptions(), keys());
export const useRevokePromoterLink = () => useInvalidating(orpc.promoters.revokeLink.mutationOptions(), keys());

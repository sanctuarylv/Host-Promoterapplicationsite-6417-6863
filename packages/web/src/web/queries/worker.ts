import { useQuery } from "@tanstack/react-query";
import { orpc } from "../lib/api";
import { useInvalidating } from "../lib/use-invalidating";

const keys = () => [orpc.worker.key()];

export const useWorkerOverview = (enabled: boolean) => useQuery(orpc.worker.overview.queryOptions({ enabled, retry: false }));
export const useWorkerCredential = (assignmentId: string | null) =>
  useQuery(orpc.worker.credential.queryOptions({ input: { assignmentId: assignmentId ?? "" }, enabled: Boolean(assignmentId), retry: false }));
export const useWorkerCallSheet = (assignmentId: string | null) =>
  useQuery(orpc.worker.callSheet.queryOptions({ input: { assignmentId: assignmentId ?? "" }, enabled: Boolean(assignmentId), retry: false }));
export const useWorkerAttendance = (assignmentId: string | null) =>
  useQuery(orpc.worker.attendance.queryOptions({ input: { assignmentId: assignmentId ?? "" }, enabled: Boolean(assignmentId), retry: false }));

export const useReacknowledge = () => useInvalidating(orpc.worker.reacknowledge.mutationOptions(), keys());
export const useRespondOffer = () => useInvalidating(orpc.worker.respondOffer.mutationOptions(), keys());
export const useCompleteTraining = () => useInvalidating(orpc.worker.completeTraining.mutationOptions(), keys());

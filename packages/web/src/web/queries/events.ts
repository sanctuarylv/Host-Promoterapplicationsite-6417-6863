import { useQuery } from "@tanstack/react-query";
import { orpc } from "../lib/api";
import { useInvalidating } from "../lib/use-invalidating";

const keys = () => [orpc.events.key(), orpc.templates.key(), orpc.org.key(), orpc.assignments.key(), orpc.credentials.key(), orpc.attendance.key()];

export const useOrgChart = () => useQuery(orpc.org.chart.queryOptions({ retry: false }));
export const useTemplates = () => useQuery(orpc.templates.list.queryOptions({ retry: false }));
export const useTemplateVersion = (versionId: string | null) =>
  useQuery(orpc.templates.version.queryOptions({ input: { versionId: versionId ?? "" }, enabled: Boolean(versionId), retry: false }));
export const useEvents = () => useQuery(orpc.events.list.queryOptions({ retry: false }));
export const useEventDetail = (id: string) => useQuery(orpc.events.detail.queryOptions({ input: { id }, retry: false }));
export const useEventCallSheet = (eventId: string) => useQuery(orpc.assignments.callSheet.queryOptions({ input: { eventId }, retry: false }));

export const useAddOrgLine = () => useInvalidating(orpc.org.addLine.mutationOptions(), keys());
export const useRemoveOrgLine = () => useInvalidating(orpc.org.removeLine.mutationOptions(), keys());
export const useCloneVersion = () => useInvalidating(orpc.templates.cloneVersion.mutationOptions(), keys());
export const useUpdateTemplateRole = () => useInvalidating(orpc.templates.updateRole.mutationOptions(), keys());
export const usePublishVersion = () => useInvalidating(orpc.templates.publish.mutationOptions(), keys());
export const useCreateEvent = () => useInvalidating(orpc.events.create.mutationOptions(), keys());
export const useSetEventDate = () => useInvalidating(orpc.events.setDate.mutationOptions(), keys());
export const useSetOverride = () => useInvalidating(orpc.events.setOverride.mutationOptions(), keys());
export const useSetProvider = () => useInvalidating(orpc.events.setProvider.mutationOptions(), keys());
export const useAddRunOfShow = () => useInvalidating(orpc.events.addRunOfShow.mutationOptions(), keys());
export const useSaveCloseout = () => useInvalidating(orpc.events.saveCloseout.mutationOptions(), keys());
export const useProposeAssignment = () => useInvalidating(orpc.assignments.propose.mutationOptions(), keys());
export const useApproveAssignment = () => useInvalidating(orpc.assignments.approve.mutationOptions(), keys());
export const useCancelAssignment = () => useInvalidating(orpc.assignments.cancel.mutationOptions(), keys());

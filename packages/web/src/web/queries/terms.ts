import { useQuery } from "@tanstack/react-query";
import { orpc } from "../lib/api";
import { useInvalidating } from "../lib/use-invalidating";

const keys = () => [orpc.terms.key(), orpc.recruiting.key(), orpc.training.key()];

export const useTermsList = () => useQuery(orpc.terms.list.queryOptions({ retry: false }));
export const useTrainingModules = () => useQuery(orpc.training.modules.queryOptions({ retry: false }));
export const useTrainingRecords = (personId: string | null) =>
  useQuery(orpc.training.records.queryOptions({ input: { personId: personId ?? "" }, enabled: Boolean(personId), retry: false }));

export const useDraftTerms = () => useInvalidating(orpc.terms.draft.mutationOptions(), keys());
export const useApproveTerms = () => useInvalidating(orpc.terms.approve.mutationOptions(), keys());
export const useRetireTerms = () => useInvalidating(orpc.terms.retire.mutationOptions(), keys());
export const useIssueOffer = () => useInvalidating(orpc.offers.issue.mutationOptions(), keys());
export const useCancelOffer = () => useInvalidating(orpc.offers.cancel.mutationOptions(), keys());
export const useVerifyTraining = () => useInvalidating(orpc.training.verify.mutationOptions(), keys());

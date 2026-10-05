import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { client, orpc } from "../lib/api";
import { useInvalidating } from "../lib/use-invalidating";

export type ApplicantListInput = Parameters<typeof client.recruiting.list>[0];

const keys = () => [orpc.recruiting.key()];

export const useApplicants = (input: ApplicantListInput) =>
  useQuery(orpc.recruiting.list.queryOptions({ input, placeholderData: keepPreviousData, retry: false }));
export const useApplicant = (id: string) => useQuery(orpc.recruiting.detail.queryOptions({ input: { id }, retry: false }));
export const useStaffDirectory = () => useQuery(orpc.recruiting.staffDirectory.queryOptions({ staleTime: 60_000, retry: false }));
export const useAssignable = (enabled = true) => useQuery(orpc.recruiting.assignable.queryOptions({ enabled, retry: false }));

export const useAssignReviewer = () => useInvalidating(orpc.recruiting.assignReviewer.mutationOptions(), keys());
export const useTransition = () => useInvalidating(orpc.recruiting.transition.mutationOptions(), keys());
export const useScheduleInterview = () => useInvalidating(orpc.recruiting.scheduleInterview.mutationOptions(), keys());
export const useUpdateInterview = () => useInvalidating(orpc.recruiting.updateInterview.mutationOptions(), keys());
export const useSubmitScorecard = () => useInvalidating(orpc.recruiting.submitScorecard.mutationOptions(), keys());
export const useIssueLinkToken = () => useInvalidating(orpc.recruiting.issueLinkToken.mutationOptions(), keys());

/** CSV export: walks the cursor pages of the CURRENT filter (bounded, server-side). */
export async function fetchAllApplicants(filter: Omit<ApplicantListInput, "cursor" | "limit">, cap = 5000) {
  const out: Awaited<ReturnType<typeof client.recruiting.list>>["rows"] = [];
  let cursor: string | null = null;
  do {
    const page = await client.recruiting.list({ ...filter, cursor, limit: 200 });
    out.push(...page.rows);
    cursor = page.nextCursor;
  } while (cursor && out.length < cap);
  return out;
}

import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { adminClient, adminOrpc } from "../lib/api";

export type LegacyListInput = Parameters<typeof adminClient.crewAdmin.list>[0];

/** Legacy shared-key view: READ-ONLY, server-side filters + cursor pagination. */
export function useAdminApplications(input: LegacyListInput, enabled: boolean) {
  return useQuery(
    adminOrpc.crewAdmin.list.queryOptions({ input, enabled, retry: false, staleTime: 15_000, placeholderData: keepPreviousData }),
  );
}

export function useVerifyAdmin() {
  return useMutation(adminOrpc.crewAdmin.verify.mutationOptions({ retry: false }));
}

/** Walk every page of the current filter (200 per page) for a complete export. */
export async function fetchAllLegacyRows(filter: Omit<LegacyListInput, "cursor" | "limit">) {
  const out: Awaited<ReturnType<typeof adminClient.crewAdmin.list>>["rows"] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 500; i++) {
    const page: Awaited<ReturnType<typeof adminClient.crewAdmin.list>> = await adminClient.crewAdmin.list({ ...filter, cursor, limit: 200 });
    out.push(...page.rows);
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return out;
}

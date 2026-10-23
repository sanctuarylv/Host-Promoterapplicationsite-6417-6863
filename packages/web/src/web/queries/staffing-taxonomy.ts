import { useQuery } from "@tanstack/react-query";
import { orpc } from "../lib/api";

/** Read-only dry-run reconciliation preview of the 36-role canonical staffing taxonomy. */
export const useStaffingTaxonomyPreview = () => useQuery(orpc.staffingTaxonomy.preview.queryOptions({ retry: false, staleTime: Infinity }));
